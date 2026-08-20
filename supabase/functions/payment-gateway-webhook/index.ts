import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type GatewayPayload = {
  provider?: string
  eventId?: string
  paymentId?: string
  status?: 'completed' | 'failed' | 'cancelled' | 'expired'
  amountCents?: number
  transactionId?: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-plamenco-signature',
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
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const webhookSecret = Deno.env.get('PAYMENT_WEBHOOK_SECRET')
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) return json({ error: 'Payment webhook is not configured.' }, 500)

  const rawBody = await request.text()
  const signature = request.headers.get('x-plamenco-signature') ?? ''
  const expected = await hmacSha256(webhookSecret, rawBody)
  if (!timingSafeEqualHex(signature, expected)) return json({ error: 'Invalid webhook signature.' }, 401)

  let payload: GatewayPayload
  try {
    payload = JSON.parse(rawBody) as GatewayPayload
  } catch {
    return json({ error: 'Invalid JSON payload.' }, 400)
  }

  const provider = payload.provider?.trim()
  const eventId = payload.eventId?.trim()
  const paymentId = payload.paymentId?.trim()
  if (!provider || !eventId || !paymentId || !payload.status) return json({ error: 'Provider, eventId, paymentId, and status are required.' }, 400)
  if (payload.status === 'completed' && typeof payload.amountCents !== 'number') return json({ error: 'Completed payment webhooks must include the verified provider amount.' }, 400)

  const client = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await client.rpc('apply_verified_gateway_payment', {
    p_provider: provider,
    p_event_id: eventId,
    p_payment_id: paymentId,
    p_status: payload.status === 'completed' ? 'completed' : 'failed',
    p_amount_cents: payload.amountCents ?? null,
    p_transaction_id: payload.transactionId ?? '',
  })

  if (error) return json({ error: 'Payment webhook could not be applied.' }, 422)
  return json((data ?? { processed: true }) as Record<string, unknown>)
})
