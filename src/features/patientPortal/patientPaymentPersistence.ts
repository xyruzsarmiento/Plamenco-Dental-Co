import { supabase } from '../../lib/supabase'

export type PatientQrPaymentSession = {
  paymentId: string
  paymentNumber?: string
  paymentIntentId: string
  amountCents: number
  qrImage: string
  status: string
}

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Online payment is unavailable.')
  return supabase
}

async function functionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const context = 'context' in error ? (error as { context?: unknown }).context : undefined
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown; message?: unknown }
        if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
        if (typeof payload.message === 'string' && payload.message.trim()) return payload.message
      } catch {
        try {
          const text = await context.clone().text()
          if (text.trim()) return text.trim()
        } catch {
          // Fall through to the library error message.
        }
      }
    }
    if ('message' in error && typeof (error as { message?: unknown }).message === 'string') {
      const message = String((error as { message: string }).message)
      if (message && !message.toLowerCase().includes('non-2xx')) return message
    }
  }
  return fallback
}

export async function createPatientQrPayment(invoiceId: string): Promise<PatientQrPaymentSession> {
  const db = requireDatabase()
  const { data, error } = await db.functions.invoke('patient-paymongo-qrph', {
    body: { action: 'create', invoiceId },
  })

  if (error) throw new Error(await functionErrorMessage(error, 'Online payment is not configured yet. Please choose Pay in clinic or contact the clinic.'))
  if (data?.error) throw new Error(String(data.error))
  if (!data?.paymentId || !data?.paymentIntentId || !data?.qrImage) {
    throw new Error('The payment service did not return a complete QR Ph session.')
  }

  return {
    paymentId: String(data.paymentId),
    paymentNumber: data.paymentNumber ? String(data.paymentNumber) : undefined,
    paymentIntentId: String(data.paymentIntentId),
    amountCents: Number(data.amountCents ?? 0),
    qrImage: String(data.qrImage),
    status: String(data.status ?? 'awaiting_next_action'),
  }
}

export async function checkPatientQrPayment(paymentId: string): Promise<{ status: string; completed: boolean; paymentNumber?: string }> {
  const db = requireDatabase()
  const { data, error } = await db.functions.invoke('patient-paymongo-qrph', {
    body: { action: 'status', paymentId },
  })

  if (error) throw new Error(await functionErrorMessage(error, 'Unable to confirm QR Ph payment status.'))
  if (data?.error) throw new Error(String(data.error))

  return {
    status: String(data?.status ?? 'processing'),
    completed: Boolean(data?.completed),
    paymentNumber: data?.paymentNumber ? String(data.paymentNumber) : undefined,
  }
}
