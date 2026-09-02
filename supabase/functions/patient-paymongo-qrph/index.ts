import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

function paymongoHeaders(secret: string) {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Basic ${btoa(`${secret}:`)}`,
  }
}

async function paymongoRequest(secret: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.paymongo.com/v1${path}`, {
    ...init,
    headers: { ...paymongoHeaders(secret), ...(init.headers ?? {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload?.errors?.[0]?.detail ?? payload?.errors?.[0]?.code ?? 'PayMongo request failed.'
    throw new Error(message)
  }
  return payload
}

function manilaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

async function latestLedgerState(adminClient: ReturnType<typeof createClient>, paymentId: string, patientId: string) {
  const { data } = await adminClient
    .from('payments')
    .select('id, status, payment_number, allocated_cents, gateway_transaction_id')
    .eq('id', paymentId)
    .eq('patient_id', patientId)
    .maybeSingle()
  return data
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const paymongoSecret = Deno.env.get('PAYMONGO_SECRET_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Payment service is not configured.' }, 500)
  if (!paymongoSecret) return json({ error: 'Online payment is not configured yet. Please choose Pay in clinic.' }, 503)

  const authHeader = request.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Authentication required.' }, 401)

  const { data: patient, error: patientError } = await adminClient
    .from('patients')
    .select('id, patient_id, first_name, middle_name, last_name, email, phone, status')
    .eq('auth_user_id', authData.user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (patientError) return json({ error: 'Unable to verify your patient account.' }, 500)
  if (!patient) return json({ error: 'No active patient record is linked to this account.' }, 403)

  let body: { action?: string; invoiceId?: string; paymentId?: string }
  try { body = await request.json() } catch { return json({ error: 'Invalid request.' }, 400) }

  if (body.action === 'create') {
    if (!body.invoiceId) return json({ error: 'Invoice is required.' }, 400)

    const { data: invoice, error: invoiceError } = await adminClient
      .from('invoices')
      .select('id, invoice_number, patient_id, branch_id, balance_cents, status')
      .eq('id', body.invoiceId)
      .eq('patient_id', patient.id)
      .maybeSingle()

    if (invoiceError) return json({ error: 'Unable to load invoice.' }, 500)
    if (!invoice || invoice.status === 'void') return json({ error: 'Invoice is unavailable.' }, 404)
    if (Number(invoice.balance_cents ?? 0) < 100) return json({ error: 'This invoice has no payable online balance.' }, 400)

    await adminClient
      .from('payments')
      .update({ status: 'failed', notes: 'Superseded by a newer QR Ph attempt.' })
      .eq('invoice_id', invoice.id)
      .eq('patient_id', patient.id)
      .eq('gateway_provider', 'paymongo')
      .eq('status', 'processing')

    const paymentId = crypto.randomUUID()
    const { data: paymentNumber, error: numberError } = await adminClient.rpc('next_payment_number')
    if (numberError || !paymentNumber) return json({ error: 'Could not allocate a payment reference.' }, 500)

    const { error: insertError } = await adminClient.from('payments').insert({
      id: paymentId,
      payment_number: paymentNumber,
      patient_id: patient.id,
      invoice_id: invoice.id,
      branch_id: invoice.branch_id ?? null,
      amount_cents: invoice.balance_cents,
      allocated_cents: 0,
      refundable_cents: 0,
      payment_method: 'qrph',
      payment_date: manilaDate(),
      reference_number: '',
      recorded_by: 'patient_portal',
      source: 'online_gateway',
      status: 'processing',
      gateway_provider: 'paymongo',
      notes: 'Patient portal QR Ph payment attempt.',
    })
    if (insertError) return json({ error: 'Could not start the payment record.' }, 500)

    try {
      const intentPayload = await paymongoRequest(paymongoSecret, '/payment_intents', {
        method: 'POST',
        body: JSON.stringify({
          data: { attributes: {
            amount: invoice.balance_cents,
            currency: 'PHP',
            payment_method_allowed: ['qrph'],
            description: `Plamenco Dental Co. ${invoice.invoice_number}`,
            metadata: { payment_id: paymentId, invoice_id: invoice.id, patient_id: patient.patient_id },
          } },
        }),
      })
      const intent = intentPayload?.data
      const clientKey = intent?.attributes?.client_key
      if (!intent?.id || !clientKey) throw new Error('PayMongo did not return a valid payment intent.')

      const billingName = [patient.first_name, patient.middle_name, patient.last_name].filter(Boolean).join(' ')
      const methodPayload = await paymongoRequest(paymongoSecret, '/payment_methods', {
        method: 'POST',
        body: JSON.stringify({
          data: { attributes: {
            type: 'qrph',
            billing: { name: billingName, email: patient.email || undefined, phone: patient.phone || undefined },
          } },
        }),
      })
      const paymentMethodId = methodPayload?.data?.id
      if (!paymentMethodId) throw new Error('PayMongo did not return a QR Ph payment method.')

      const attachedPayload = await paymongoRequest(paymongoSecret, `/payment_intents/${intent.id}/attach`, {
        method: 'POST',
        body: JSON.stringify({ data: { attributes: { payment_method: paymentMethodId, client_key: clientKey } } }),
      })
      const attached = attachedPayload?.data
      const qrImage = attached?.attributes?.next_action?.code?.image_url
      if (!qrImage) throw new Error('PayMongo did not return the QR image.')

      await adminClient.from('payments').update({
        gateway_transaction_id: intent.id,
        reference_number: intent.id,
      }).eq('id', paymentId)

      return json({
        paymentId,
        paymentNumber,
        paymentIntentId: intent.id,
        amountCents: invoice.balance_cents,
        qrImage,
        status: attached?.attributes?.status ?? 'awaiting_next_action',
      })
    } catch (error) {
      await adminClient.from('payments').update({
        status: 'failed',
        notes: `QR Ph setup failed: ${error instanceof Error ? error.message : 'Unknown PayMongo error'}`,
      }).eq('id', paymentId)
      return json({ error: error instanceof Error ? error.message : 'Unable to create QR Ph payment.' }, 502)
    }
  }

  if (body.action === 'status') {
    if (!body.paymentId) return json({ error: 'Payment reference is required.' }, 400)

    const { data: payment, error: paymentError } = await adminClient
      .from('payments')
      .select('id, patient_id, amount_cents, status, gateway_transaction_id, payment_number')
      .eq('id', body.paymentId)
      .eq('patient_id', patient.id)
      .eq('gateway_provider', 'paymongo')
      .maybeSingle()

    if (paymentError) return json({ error: 'Unable to load payment status.' }, 500)
    if (!payment) return json({ error: 'Payment attempt was not found.' }, 404)
    if (payment.status === 'completed') return json({ paymentId: payment.id, paymentNumber: payment.payment_number, status: 'succeeded', completed: true })
    if (!payment.gateway_transaction_id) return json({ paymentId: payment.id, status: payment.status, completed: false })

    try {
      const intentPayload = await paymongoRequest(paymongoSecret, `/payment_intents/${payment.gateway_transaction_id}`, { method: 'GET' })
      const intent = intentPayload?.data
      const status = intent?.attributes?.status ?? 'processing'
      const amount = Number(intent?.attributes?.amount ?? 0)

      if (status === 'succeeded') {
        const { data: applied, error: applyError } = await adminClient.rpc('apply_verified_gateway_payment', {
          p_provider: 'paymongo',
          p_event_id: `poll:${payment.gateway_transaction_id}:succeeded`,
          p_payment_id: payment.id,
          p_status: 'completed',
          p_amount_cents: amount,
          p_transaction_id: payment.gateway_transaction_id,
        })
        if (applyError) {
          const latest = await latestLedgerState(adminClient, payment.id, patient.id)
          if (latest?.status === 'completed') return json({ paymentId: payment.id, paymentNumber: latest.payment_number ?? payment.payment_number, status, completed: true })
          return json({
            error: `Payment was received by PayMongo but could not be posted to the clinic ledger. Please contact the clinic with your payment reference ${payment.payment_number ?? payment.id}.`,
            reference: payment.payment_number ?? payment.id,
          }, 500)
        }
        return json({ paymentId: payment.id, paymentNumber: payment.payment_number, status, completed: true, ledger: applied })
      }

      return json({ paymentId: payment.id, paymentNumber: payment.payment_number, status, completed: false })
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unable to confirm payment status.' }, 502)
    }
  }

  return json({ error: 'Unsupported payment action.' }, 400)
})
