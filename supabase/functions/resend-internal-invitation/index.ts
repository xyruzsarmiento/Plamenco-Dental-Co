import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type InternalRole = 'super_admin' | 'dentist' | 'associate_dentist' | 'staff'
type ResendPayload = { invitationId?: string }

type SmtpSettings = {
  host: string
  port: number
  user: string
  password: string
  fromEmail: string
  fromName: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

function resolveInviteRedirectUrl() {
  const configuredUrl = [Deno.env.get('SITE_URL'), Deno.env.get('PUBLIC_SITE_URL'), Deno.env.get('APP_URL')]
    .find((value) => Boolean(value?.trim()))?.trim()
  if (!configuredUrl) return { error: 'Invitation service is not configured with an application URL.' }
  try {
    const parsed = new URL(configuredUrl)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return { error: 'Invitation service has an invalid application URL.' }
    }
    return { redirectTo: `${configuredUrl.replace(/\/+$/, '')}/accept-invite` }
  } catch {
    return { error: 'Invitation service has an invalid application URL.' }
  }
}

function requiredSmtpSettings(): SmtpSettings {
  const host = Deno.env.get('SMTP_HOST')?.trim() ?? ''
  const rawPort = Deno.env.get('SMTP_PORT')?.trim() ?? ''
  const user = Deno.env.get('SMTP_USER')?.trim() ?? ''
  const password = Deno.env.get('SMTP_PASSWORD')?.trim() ?? ''
  const fromEmail = Deno.env.get('SMTP_FROM_EMAIL')?.trim() ?? ''
  const fromName = Deno.env.get('SMTP_FROM_NAME')?.trim() ?? ''
  const missing = [
    ['SMTP_HOST', host],
    ['SMTP_PORT', rawPort],
    ['SMTP_USER', user],
    ['SMTP_PASSWORD', password],
    ['SMTP_FROM_EMAIL', fromEmail],
    ['SMTP_FROM_NAME', fromName],
  ].filter(([, value]) => !value).map(([name]) => name)

  if (missing.length) {
    throw new Error(`Email delivery is not configured. Missing Supabase secrets: ${missing.join(', ')}.`)
  }

  const port = Number(rawPort)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) throw new Error('SMTP_PORT must be a valid TCP port.')
  return { host, port, user, password, fromEmail, fromName }
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]/g, ' ').trim()
}

async function readSmtpResponse(connection: Deno.Conn) {
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
    const read = await connection.read(buffer)
    if (read === null) throw new Error('SMTP connection closed before a response was received.')
    pending += decoder.decode(buffer.subarray(0, read), { stream: true })
  }
}

function smtpStatus(response: string) {
  return Number(response.slice(0, 3))
}

async function smtpCommand(connection: Deno.Conn, command: string, expected: number[]) {
  await connection.write(new TextEncoder().encode(`${command}\r\n`))
  const response = await readSmtpResponse(connection)
  if (!expected.includes(smtpStatus(response))) throw new Error(`SMTP rejected the request: ${response}`)
  return response
}

function roleLabel(role: InternalRole) {
  if (role === 'super_admin') return 'Super Admin'
  if (role === 'associate_dentist') return 'Associate Dentist'
  if (role === 'dentist') return 'Dentist'
  return 'Staff'
}

async function sendInvitationEmail(settings: SmtpSettings, params: {
  email: string
  name: string
  role: InternalRole
  actionLink: string
}) {
  let connection: Deno.Conn | null = null
  try {
    connection = settings.port === 465
      ? await Deno.connectTls({ hostname: settings.host, port: settings.port })
      : await Deno.connect({ hostname: settings.host, port: settings.port })

    const greeting = await readSmtpResponse(connection)
    if (smtpStatus(greeting) !== 220) throw new Error(`SMTP greeting failed: ${greeting}`)
    await smtpCommand(connection, 'EHLO plamenco-dental.local', [250])

    if (settings.port !== 465) {
      await smtpCommand(connection, 'STARTTLS', [220])
      connection = await Deno.startTls(connection, { hostname: settings.host })
      await smtpCommand(connection, 'EHLO plamenco-dental.local', [250])
    }

    await smtpCommand(connection, 'AUTH LOGIN', [334])
    await smtpCommand(connection, base64(settings.user), [334])
    await smtpCommand(connection, base64(settings.password), [235])

    const from = cleanHeader(settings.fromEmail)
    const to = cleanHeader(params.email)
    await smtpCommand(connection, `MAIL FROM:<${from}>`, [250])
    await smtpCommand(connection, `RCPT TO:<${to}>`, [250, 251])
    await connection.write(new TextEncoder().encode('DATA\r\n'))
    const ready = await readSmtpResponse(connection)
    if (smtpStatus(ready) !== 354) throw new Error(`SMTP DATA command failed: ${ready}`)

    const senderName = base64(settings.fromName)
    const subject = 'Complete your Plamenco Dental Co. account setup'
    const body = [
      `Hello ${params.name || 'there'},`,
      '',
      `A fresh ${roleLabel(params.role)} invitation has been issued for your Plamenco Dental Co. internal account.`,
      '',
      'Open this secure link to continue account setup and create your clinic password:',
      params.actionLink,
      '',
      'If you did not expect this invitation, you can ignore this email.',
      '',
      'Plamenco Dental Co.',
    ].join('\r\n').replace(/^\./gm, '..')

    const message = [
      `From: =?UTF-8?B?${senderName}?= <${from}>`,
      `To: ${to}`,
      `Subject: ${cleanHeader(subject)}`,
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
  } finally {
    if (connection) {
      try { await smtpCommand(connection, 'QUIT', [221]) } catch { /* connection closes below */ }
      connection.close()
    }
  }
}

async function findAuthUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const match = data.users.find((user) => user.email?.trim().toLowerCase() === email)
    if (match) return match
    if (data.users.length < 1000) return null
  }
  return null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const inviteRedirect = resolveInviteRedirectUrl()
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Invitation service is not configured.' }, 500)
  if (inviteRedirect.error || !inviteRedirect.redirectTo) return json({ error: inviteRedirect.error ?? 'Invitation redirect is unavailable.' }, 500)

  const authHeader = request.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Authentication required.' }, 401)

  const { data: inviter, error: inviterError } = await adminClient.from('profiles').select('role, status').eq('id', authData.user.id).maybeSingle()
  if (inviterError) return json({ error: 'Could not verify inviter permissions.' }, 500)
  if (inviter?.role !== 'super_admin' || inviter.status !== 'active') return json({ error: 'Only an active Super Admin can resend internal invitations.' }, 403)

  let payload: ResendPayload
  try { payload = await request.json() as ResendPayload } catch { return json({ error: 'Invalid recovery payload.' }, 400) }
  const invitationId = payload.invitationId?.trim()
  if (!invitationId) return json({ error: 'An invitation record is required.' }, 400)

  const { data: invitation, error: invitationError } = await adminClient
    .from('internal_account_invitations')
    .select('id, email, full_name, role, status')
    .eq('id', invitationId)
    .maybeSingle()
  if (invitationError) return json({ error: 'Unable to load the invitation record.' }, 500)
  if (!invitation) return json({ error: 'Invitation record not found.' }, 404)
  if (!['pending', 'sent', 'failed', 'cancelled'].includes(invitation.status)) return json({ error: 'This invitation is already accepted or cannot be recovered.' }, 409)

  const email = String(invitation.email ?? '').trim().toLowerCase()
  const role = invitation.role as InternalRole
  const authUser = await findAuthUserByEmail(adminClient, email)
  if (!authUser) return json({ error: 'The original authenticated account could not be found. No new account was created.' }, 404)

  const { data: profile, error: profileError } = await adminClient.from('profiles').select('id, email, role, status').eq('id', authUser.id).maybeSingle()
  if (profileError) return json({ error: 'Unable to verify the existing clinic profile.' }, 500)
  if (!profile || profile.email?.trim().toLowerCase() !== email || profile.role !== role) return json({ error: 'The existing clinic profile does not match this invitation. No changes were made.' }, 409)
  if (profile.status === 'active') return json({ error: 'This clinic account is already active. No new invitation was sent.', state: 'active' }, 409)
  if (profile.status !== 'inactive') return json({ error: 'This clinic account is not eligible for invitation recovery.', state: profile.status }, 409)

  let smtp: SmtpSettings
  try {
    smtp = requiredSmtpSettings()
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Email delivery is not configured.', state: 'smtp_required' }, 503)
  }

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: {
      redirectTo: inviteRedirect.redirectTo,
      data: {
        full_name: invitation.full_name,
        first_name: invitation.full_name,
        last_name: '',
        role,
        account_type: 'internal',
      },
    },
  })

  const actionLink = linkData?.properties?.action_link
  if (linkError || !actionLink) {
    return json({ error: linkError?.message ?? 'Supabase could not generate a fresh secure invitation link. No clinic records were changed.' }, 400)
  }

  try {
    await sendInvitationEmail(smtp, {
      email,
      name: String(invitation.full_name ?? '').trim(),
      role,
      actionLink,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMTP delivery failed.'
    await adminClient.from('internal_account_invitations').update({
      status: 'failed',
      error_message: message.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq('id', invitationId)
    return json({ error: `A fresh secure link was generated, but the email could not be sent: ${message}`, state: 'email_failed' }, 502)
  }

  const now = new Date().toISOString()
  const { data: updatedInvitation, error: updateError } = await adminClient
    .from('internal_account_invitations')
    .update({ status: 'sent', error_message: '', invited_at: now, updated_at: now })
    .eq('id', invitationId)
    .select('id, status, invited_at')
    .single()

  if (updateError) return json({ error: `Invitation email was sent, but its audit record could not be updated: ${updateError.message}` }, 500)
  return json({ invitation: updatedInvitation, account: { userId: authUser.id, email, role }, state: 'resent' })
})
