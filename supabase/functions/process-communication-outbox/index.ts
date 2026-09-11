import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type OutboxEntry = {
  id: string
  delivery_log_id: string
  channel: 'sms' | 'email' | 'messenger' | 'in_app'
  provider: string
  patient_id?: string
  branch_id?: string
  payload: {
    recipient?: string
    subject?: string
    message?: string
  }
  attempts: number
  max_attempts?: number
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const transientStatusCodes = new Set([408, 425, 429, 500, 502, 503, 504])

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

function requireEnv(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function isAuthorizedCronRequest(request: Request) {
  const secret = Deno.env.get('CRON_SECRET')
  const authorization = request.headers.get('Authorization') ?? ''
  const headerSecret = request.headers.get('x-cron-secret') ?? ''
  return Boolean(secret && (authorization === `Bearer ${secret}` || headerSecret === secret))
}

function nextRetryDate(attempts: number) {
  const delayMinutes = Math.min(60, 2 ** Math.max(attempts, 1))
  return new Date(Date.now() + delayMinutes * 60_000).toISOString()
}

function providerIdFromResponse(data: unknown) {
  if (!data || typeof data !== 'object') return undefined
  const record = data as Record<string, unknown>
  const candidates = [record.id, record.message_id, record.messageId, record.sid]
  const value = candidates.find((entry) => typeof entry === 'string')
  return typeof value === 'string' ? value : undefined
}

function requiredSmtpSettings() {
  const names = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME']
  const values = Object.fromEntries(names.map((name) => [name, Deno.env.get(name) ?? ''])) as Record<string, string>
  const configured = names.filter((name) => values[name])
  if (configured.length === 0) return null
  const missing = names.filter((name) => !values[name])
  if (missing.length) throw new Error(`SMTP delivery is partially configured. Missing: ${missing.join(', ')}`)
  const port = Number(values.SMTP_PORT)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error('SMTP_PORT must be a valid TCP port.')
  return { ...values, port }
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function smtpHeader(value: string) {
  return value.replace(/[\r\n]/g, ' ').trim()
}

async function readSmtpResponse(conn: Deno.Conn) {
  const decoder = new TextDecoder()
  const buffer = new Uint8Array(2048)
  let pending = ''
  const lines: string[] = []

  while (true) {
    const split = pending.indexOf('\r\n')
    if (split !== -1) {
      const line = pending.slice(0, split)
      pending = pending.slice(split + 2)
      lines.push(line)
      if (/^\d{3} /.test(line)) return lines.join('\n')
      continue
    }
    const read = await conn.read(buffer)
    if (read === null) throw new Error('SMTP connection closed before a response was received.')
    pending += decoder.decode(buffer.subarray(0, read), { stream: true })
  }
}

function smtpStatus(response: string) {
  return Number(response.slice(0, 3))
}

async function smtpCommand(conn: Deno.Conn, command: string, expected: number[]) {
  await conn.write(new TextEncoder().encode(`${command}\r\n`))
  const response = await readSmtpResponse(conn)
  if (!expected.includes(smtpStatus(response))) throw new Error(`SMTP rejected command: ${response}`)
  return response
}

async function sendEmailViaSmtp(entry: OutboxEntry) {
  const settings = requiredSmtpSettings()
  if (!settings) throw new Error('SMTP delivery is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL, and SMTP_FROM_NAME.')

  let connection: Deno.Conn | null = null
  try {
    connection = settings.port === 465
      ? await Deno.connectTls({ hostname: settings.SMTP_HOST, port: settings.port })
      : await Deno.connect({ hostname: settings.SMTP_HOST, port: settings.port })
    const greeting = await readSmtpResponse(connection)
    if (smtpStatus(greeting) !== 220) throw new Error(`SMTP greeting failed: ${greeting}`)
    await smtpCommand(connection, 'EHLO plamenco-dental.local', [250])

    if (settings.port !== 465) {
      await smtpCommand(connection, 'STARTTLS', [220])
      connection = await Deno.startTls(connection, { hostname: settings.SMTP_HOST })
      await smtpCommand(connection, 'EHLO plamenco-dental.local', [250])
    }

    await smtpCommand(connection, 'AUTH LOGIN', [334])
    await smtpCommand(connection, base64(settings.SMTP_USER), [334])
    await smtpCommand(connection, base64(settings.SMTP_PASSWORD), [235])
    const from = smtpHeader(settings.SMTP_FROM_EMAIL)
    const to = smtpHeader(entry.payload.recipient ?? '')
    if (!to) throw new Error('SMTP recipient is empty.')
    await smtpCommand(connection, `MAIL FROM:<${from}>`, [250])
    await smtpCommand(connection, `RCPT TO:<${to}>`, [250, 251])
    await connection.write(new TextEncoder().encode('DATA\r\n'))
    const dataReady = await readSmtpResponse(connection)
    if (smtpStatus(dataReady) !== 354) throw new Error(`SMTP DATA command failed: ${dataReady}`)

    const encodedName = base64(settings.SMTP_FROM_NAME)
    const body = (entry.payload.message ?? '').replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..')
    const message = [
      `From: =?UTF-8?B?${encodedName}?= <${from}>`,
      `To: ${to}`,
      `Subject: ${smtpHeader(entry.payload.subject ?? '')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      `Date: ${new Date().toUTCString()}`,
      '',
      body,
      '.',
    ].join('\r\n')
    await connection.write(new TextEncoder().encode(`${message}\r\n`))
    const accepted = await readSmtpResponse(connection)
    if (smtpStatus(accepted) !== 250) throw new Error(`SMTP message was not accepted: ${accepted}`)
    return { ok: true, status: 250, text: async () => JSON.stringify({ id: entry.delivery_log_id }) }
  } finally {
    if (connection) {
      try { await smtpCommand(connection, 'QUIT', [221]) } catch { /* close below */ }
      connection.close()
    }
  }
}

async function sendSms(entry: OutboxEntry) {
  const endpoint = requireEnv('SMS_PROVIDER_ENDPOINT')
  const apiKey = requireEnv('SMS_API_KEY')
  const senderName = Deno.env.get('SMS_SENDER_NAME') ?? 'PLAMENCO'

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: entry.payload.recipient,
      message: entry.payload.message,
      sender: senderName,
      idempotencyKey: entry.delivery_log_id,
    }),
  })
}

async function sendEmail(entry: OutboxEntry) {
  if (requiredSmtpSettings()) return sendEmailViaSmtp(entry)
  const endpoint = requireEnv('EMAIL_PROVIDER_ENDPOINT')
  const apiKey = requireEnv('EMAIL_API_KEY')
  const from = requireEnv('EMAIL_FROM')

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: entry.payload.recipient,
      subject: entry.payload.subject,
      text: entry.payload.message,
      idempotencyKey: entry.delivery_log_id,
    }),
  })
}

async function sendMessenger(entry: OutboxEntry) {
  const token = requireEnv('META_PAGE_ACCESS_TOKEN')
  const response = await fetch(`https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: entry.payload.recipient },
      message: { text: entry.payload.message },
      messaging_type: 'MESSAGE_TAG',
      tag: 'CONFIRMED_EVENT_UPDATE',
    }),
  })
  return response
}

async function deliver(entry: OutboxEntry) {
  if (entry.channel === 'sms') return sendSms(entry)
  if (entry.channel === 'email') return sendEmail(entry)
  if (entry.channel === 'messenger') return sendMessenger(entry)
  throw new Error('In-app notifications are delivered inside the application.')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!isAuthorizedCronRequest(request)) return json({ error: 'Authorized scheduler request required.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Communication worker is not configured.' }, 500)

  const client = createClient(supabaseUrl, serviceRoleKey)
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? '10')

  const { data: entries, error } = await client
    .from('communication_outbox')
    .select('id, delivery_log_id, channel, provider, patient_id, branch_id, payload, attempts, max_attempts')
    .eq('status', 'queued')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 25))

  if (error) return json({ error: 'Unable to load communication outbox.' }, 500)

  const results = []
  for (const entry of (entries ?? []) as OutboxEntry[]) {
    await client.from('communication_outbox').update({ status: 'processing', attempts: entry.attempts + 1, updated_at: new Date().toISOString() }).eq('id', entry.id)
    await client.from('communication_delivery_logs').update({ status: 'sending', attempt_count: entry.attempts + 1, updated_at: new Date().toISOString() }).eq('id', entry.delivery_log_id)

    try {
      const response = await deliver(entry)
      const bodyText = await response.text()
      let parsed: unknown = null
      try {
        parsed = bodyText ? JSON.parse(bodyText) : null
      } catch {
        parsed = null
      }

      if (!response.ok) {
        const isTransient = transientStatusCodes.has(response.status)
        const maxAttempts = entry.max_attempts ?? 3
        const status = isTransient && entry.attempts + 1 < maxAttempts ? 'queued' : 'failed'
        await client.from('communication_outbox').update({
          status,
          attempts: entry.attempts + 1,
          next_attempt_at: status === 'queued' ? nextRetryDate(entry.attempts + 1) : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', entry.id)
        await client.from('communication_delivery_logs').update({
          status: status === 'queued' ? 'queued' : 'failed',
          failed_at: status === 'failed' ? new Date().toISOString() : null,
          next_retry_at: status === 'queued' ? nextRetryDate(entry.attempts + 1) : null,
          last_retry_at: status === 'queued' ? new Date().toISOString() : null,
          failure_reason: `Provider returned HTTP ${response.status}`,
          updated_at: new Date().toISOString(),
        }).eq('id', entry.delivery_log_id)
        results.push({ id: entry.id, status, providerStatus: response.status })
        continue
      }

      await client.from('communication_outbox').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', entry.id)
      await client.from('communication_delivery_logs').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_id: providerIdFromResponse(parsed) ?? '',
        updated_at: new Date().toISOString(),
      }).eq('id', entry.delivery_log_id)
      results.push({ id: entry.id, status: 'sent' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider delivery failed'
      const maxAttempts = entry.max_attempts ?? 3
      const shouldRetry = entry.attempts + 1 < maxAttempts
      await client.from('communication_outbox').update({
        status: shouldRetry ? 'queued' : 'failed',
        attempts: entry.attempts + 1,
        next_attempt_at: shouldRetry ? nextRetryDate(entry.attempts + 1) : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', entry.id)
      await client.from('communication_delivery_logs').update({
        status: shouldRetry ? 'queued' : 'failed',
        failed_at: shouldRetry ? null : new Date().toISOString(),
        next_retry_at: shouldRetry ? nextRetryDate(entry.attempts + 1) : null,
        last_retry_at: shouldRetry ? new Date().toISOString() : null,
        failure_reason: message,
        updated_at: new Date().toISOString(),
      }).eq('id', entry.delivery_log_id)
      results.push({ id: entry.id, status: 'failed', reason: message })
    }
  }

  return json({ processed: results.length, results })
})
