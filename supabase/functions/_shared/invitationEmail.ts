export type InternalRole = 'super_admin' | 'dentist' | 'associate_dentist' | 'staff'

type SmtpSettings = {
  host: string
  port: number
  user: string
  password: string
  fromEmail: string
  fromName: string
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

  if (missing.length) throw new Error(`Email delivery is not configured. Missing Supabase secrets: ${missing.join(', ')}.`)
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
}

function roleLabel(role: InternalRole) {
  if (role === 'super_admin') return 'Super Admin'
  if (role === 'associate_dentist') return 'Associate Dentist'
  if (role === 'dentist') return 'Dentist'
  return 'Staff'
}

export async function sendInvitationEmail(params: { email: string; name: string; role: InternalRole; actionLink: string }) {
  const settings = requiredSmtpSettings()
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

    const body = [
      `Hello ${params.name || 'there'},`,
      '',
      `A ${roleLabel(params.role)} account has been created for you at Plamenco Dental Co.`,
      '',
      'Open this secure link to continue account setup and create your clinic password:',
      params.actionLink,
      '',
      'If you did not expect this invitation, you can ignore this email.',
      '',
      'Plamenco Dental Co.',
    ].join('\r\n').replace(/^\./gm, '..')
    const message = [
      `From: =?UTF-8?B?${base64(settings.fromName)}?= <${from}>`,
      `To: ${to}`,
      'Subject: Complete your Plamenco Dental Co. account setup',
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
