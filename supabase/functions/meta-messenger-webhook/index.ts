import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256',
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

async function hmacSha256(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const verifyToken = Deno.env.get('META_VERIFY_TOKEN')
  if (request.method === 'GET') {
    const url = new URL(request.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && verifyToken && token === verifyToken && challenge) {
      return new Response(challenge, { headers: corsHeaders })
    }
    return json({ error: 'Messenger webhook verification failed.' }, 403)
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appSecret = Deno.env.get('META_APP_SECRET')
  if (!supabaseUrl || !serviceRoleKey || !appSecret) return json({ error: 'Messenger webhook is not configured.' }, 500)

  const rawBody = await request.text()
  const signatureHeader = request.headers.get('x-hub-signature-256') ?? ''
  const signature = signatureHeader.replace(/^sha256=/, '')
  const expected = await hmacSha256(appSecret, rawBody)
  if (!timingSafeEqualHex(signature, expected)) return json({ error: 'Invalid Messenger signature.' }, 401)

  const payload = JSON.parse(rawBody) as {
    entry?: Array<{
      id?: string
      messaging?: Array<{
        sender?: { id?: string }
        recipient?: { id?: string }
        timestamp?: number
        message?: { text?: string }
        postback?: { payload?: string }
      }>
    }>
  }

  const client = createClient(supabaseUrl, serviceRoleKey)
  let recorded = 0

  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      const senderId = event.sender?.id
      if (!senderId) continue
      await client.from('system_health_events').insert({
        id: crypto.randomUUID(),
        component: 'messenger',
        status: 'operational',
        message: 'Messenger webhook event received and signature verified.',
        metadata: {
          page_id: entry.id ?? '',
          sender_ref: senderId,
          has_message: Boolean(event.message?.text),
          has_postback: Boolean(event.postback?.payload),
        },
      })
      recorded += 1
    }
  }

  return json({ received: true, recorded })
})
