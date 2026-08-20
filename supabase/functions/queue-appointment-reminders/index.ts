import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type AppointmentRow = {
  id: string
  patient_id: string
  branch_id?: string | null
  provider_id?: string | null
  service_id?: string | null
  appointment_date: string
  start_time: string
  status: string
  appointment_number?: string | null
}

type PatientRow = {
  patient_id: string
  first_name?: string | null
  phone?: string | null
  email?: string | null
  auth_user_id?: string | null
}

type PreferenceRow = {
  patient_id: string
  sms_enabled: boolean
  email_enabled: boolean
  messenger_enabled: boolean
  in_app_enabled: boolean
  preferred_channel: 'sms' | 'email' | 'messenger' | 'in_app'
  messenger_recipient_id?: string | null
}

type SettingsRow = {
  default_channels?: string[] | null
  reminder_offsets_hours?: number[] | null
  sms_configured?: boolean | null
  email_configured?: boolean | null
  messenger_configured?: boolean | null
  sms_provider?: string | null
  email_provider?: string | null
  messenger_provider?: string | null
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

function isAuthorizedCronRequest(request: Request) {
  const secret = Deno.env.get('CRON_SECRET')
  const authorization = request.headers.get('Authorization') ?? ''
  const headerSecret = request.headers.get('x-cron-secret') ?? ''
  return Boolean(secret && (authorization === `Bearer ${secret}` || headerSecret === secret))
}

function normalizePhilippineMobileNumber(value = '') {
  const compact = value.replace(/[^\d+]/g, '')
  const digits = compact.startsWith('+') ? compact.slice(1) : compact
  if (/^09\d{9}$/.test(digits)) return { valid: true, value: `+63${digits.slice(1)}` }
  if (/^639\d{9}$/.test(digits)) return { valid: true, value: `+${digits}` }
  return { valid: false, value }
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function appointmentTime(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`)
}

function formatDate(date: string) {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  const parsed = new Date(Date.UTC(2000, 0, 1, (hour || 0) - 8, minute || 0))
  return parsed.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })
}

function renderReminder(patient: PatientRow, appointment: AppointmentRow) {
  const firstName = patient.first_name?.trim() || 'Patient'
  return {
    title: 'Appointment reminder',
    subject: 'Reminder for your Plamenco Dental Co. appointment',
    body: `Hi ${firstName}, this is a reminder for your Plamenco Dental Co. appointment ${appointment.appointment_number ?? appointment.id} on ${formatDate(appointment.appointment_date)} at ${formatTime(appointment.start_time)}. Please use your authenticated patient portal or contact the clinic for changes.`,
  }
}

function orderedChannels(preference: PreferenceRow | undefined, defaults: string[]) {
  const preferred = preference?.preferred_channel ?? 'in_app'
  return [...new Set([preferred, ...defaults, 'in_app'])].filter((channel) => ['sms', 'email', 'messenger', 'in_app'].includes(channel))
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!isAuthorizedCronRequest(request)) return json({ error: 'Authorized scheduler request required.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Reminder scheduler is not configured.' }, 500)

  const client = createClient(supabaseUrl, serviceRoleKey)
  const now = new Date()

  const { data: settingsData } = await client.from('communication_settings').select('*').eq('id', 'clinic').maybeSingle()
  const settings = (settingsData ?? {}) as SettingsRow
  const offsets = settings.reminder_offsets_hours?.length ? settings.reminder_offsets_hours : [48, 24, 2]
  const defaults = settings.default_channels?.length ? settings.default_channels : ['in_app', 'sms', 'email', 'messenger']

  const maxOffset = Math.max(...offsets)
  const start = new Date(now.getTime() - 30 * 60_000)
  const end = new Date(now.getTime() + maxOffset * 60 * 60_000 + 30 * 60_000)

  const { data: appointments, error } = await client
    .from('appointments')
    .select('id, patient_id, branch_id, provider_id, service_id, appointment_date, start_time, status, appointment_number')
    .eq('status', 'confirmed')
    .gte('appointment_date', start.toISOString().slice(0, 10))
    .lte('appointment_date', end.toISOString().slice(0, 10))

  if (error) return json({ error: 'Unable to load appointments.' }, 500)

  let queued = 0
  for (const appointment of (appointments ?? []) as AppointmentRow[]) {
    const scheduledAt = appointmentTime(appointment.appointment_date, appointment.start_time)
    if (Number.isNaN(scheduledAt.getTime())) continue

    for (const offsetHours of offsets) {
      const due = new Date(scheduledAt.getTime() - offsetHours * 60 * 60_000)
      if (now < new Date(due.getTime() - 15 * 60_000) || now > new Date(due.getTime() + 15 * 60_000)) continue

      const { data: patient } = await client
        .from('patients')
        .select('patient_id, first_name, phone, email, auth_user_id')
        .eq('patient_id', appointment.patient_id)
        .maybeSingle()
      if (!patient) continue

      const { data: preference } = await client
        .from('communication_preferences')
        .select('patient_id, sms_enabled, email_enabled, messenger_enabled, in_app_enabled, preferred_channel, messenger_recipient_id')
        .eq('patient_id', appointment.patient_id)
        .maybeSingle()

      const rendered = renderReminder(patient as PatientRow, appointment)
      for (const channel of orderedChannels(preference as PreferenceRow | undefined, defaults)) {
        const idempotencyKey = `${appointment.id}:appointment_reminder:${offsetHours}h:${channel}:auto`
        const { data: existing } = await client.from('communication_delivery_logs').select('id').eq('idempotency_key', idempotencyKey).maybeSingle()
        if (existing) continue

        const phone = normalizePhilippineMobileNumber((patient as PatientRow).phone ?? '')
        const recipient =
          channel === 'sms' ? phone.value :
          channel === 'email' ? ((patient as PatientRow).email ?? '').trim().toLowerCase() :
          channel === 'messenger' ? ((preference as PreferenceRow | null)?.messenger_recipient_id ?? '') :
          ((patient as PatientRow).auth_user_id ?? appointment.patient_id)

        const available =
          channel === 'in_app' ? Boolean((preference as PreferenceRow | null)?.in_app_enabled ?? true) :
          channel === 'sms' ? Boolean((preference as PreferenceRow | null)?.sms_enabled && phone.valid) :
          channel === 'email' ? Boolean((preference as PreferenceRow | null)?.email_enabled && isValidEmail(recipient)) :
          Boolean((preference as PreferenceRow | null)?.messenger_enabled && recipient)

        const configured =
          channel === 'in_app' ? true :
          channel === 'sms' ? Boolean(settings.sms_configured) :
          channel === 'email' ? Boolean(settings.email_configured) :
          Boolean(settings.messenger_configured)

        const provider =
          channel === 'sms' ? settings.sms_provider ?? 'sms_provider' :
          channel === 'email' ? settings.email_provider ?? 'email_provider' :
          channel === 'messenger' ? settings.messenger_provider ?? 'meta_messenger' :
          'plamenco_in_app'

        const status = available && configured ? (channel === 'in_app' ? 'sent' : 'queued') : 'skipped'
        const { data: log } = await client.from('communication_delivery_logs').insert({
          id: crypto.randomUUID(),
          patient_id: appointment.patient_id,
          appointment_id: appointment.id,
          channel,
          template_key: 'appointment_reminder',
          recipient,
          subject: rendered.subject,
          message: rendered.body,
          status,
          provider,
          attempt_count: 0,
          idempotency_key: idempotencyKey,
          queued_at: status === 'queued' ? new Date().toISOString() : null,
          sent_at: status === 'sent' ? new Date().toISOString() : null,
          failure_reason: status === 'skipped' ? 'Channel unavailable or provider not configured.' : '',
        }).select('id').single()

        if (status === 'queued' && log) {
          await client.from('communication_outbox').insert({
            id: crypto.randomUUID(),
            delivery_log_id: log.id,
            channel,
            provider,
            payload: { recipient, subject: rendered.subject, message: rendered.body },
            status: 'queued',
            attempts: 0,
            next_attempt_at: new Date().toISOString(),
          })
        }
        queued += 1
      }
    }
  }

  return json({ queued })
})
