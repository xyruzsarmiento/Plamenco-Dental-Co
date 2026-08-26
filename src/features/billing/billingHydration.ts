import { supabase } from '../../lib/supabase'
import { getStoredPatients, mapSupabasePatientRow, saveStoredPatients } from '../patients/patientStore'
import {
  saveStoredInvoices,
  saveStoredPayments,
  type Charge,
  type Invoice,
  type InvoiceItem,
  type Payment,
  type PaymentMethod,
  type Receipt,
  type Refund,
} from './billingStore'

const CHARGE_STORAGE_KEY = 'plamenco.billing.charges'
const RECEIPT_STORAGE_KEY = 'plamenco.billing.receipts'
const REFUND_STORAGE_KEY = 'plamenco.billing.refunds'

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Billing data cannot be loaded safely.')
  return supabase
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[], branchId: string, getBranchId: (row: T) => string | undefined) {
  const untouched = existing.filter((row) => getBranchId(row) !== branchId)
  const byId = new Map(untouched.map((row) => [row.id, row]))
  incoming.forEach((row) => byId.set(row.id, row))
  return Array.from(byId.values())
}

function parseStored<T>(key: string): T[] {
  try {
    const value = window.localStorage.getItem(key)
    const parsed = value ? JSON.parse(value) : []
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

export async function hydrateBranchBillingFromDatabase(branchId: string) {
  if (!branchId) throw new Error('Choose an authorized branch before loading billing data.')
  const db = requireDatabase()

  const [patientResult, invoiceResult, paymentResult, receiptResult, refundResult, chargeResult] = await Promise.all([
    db.from('patients').select('*').eq('status', 'active'),
    db.from('invoices').select('*').eq('branch_id', branchId).order('invoice_date', { ascending: false }),
    db.from('payments').select('*').eq('branch_id', branchId).order('payment_date', { ascending: false }),
    db.from('receipts').select('*').eq('branch_id', branchId).order('issued_at', { ascending: false }),
    db.from('refunds').select('*').eq('branch_id', branchId).order('processed_at', { ascending: false }),
    db.from('charges').select('*').eq('branch_id', branchId).order('created_at', { ascending: false }),
  ])

  const failure = [patientResult, invoiceResult, paymentResult, receiptResult, refundResult, chargeResult].find((result) => result.error)
  if (failure?.error) throw new Error(`Unable to refresh branch billing: ${failure.error.message}`)

  const patients = (patientResult.data ?? []).map((row) => mapSupabasePatientRow(row as Record<string, unknown>))
  const patientIdByDbId = new Map(patients.map((patient) => [patient.id, patient.patientId]))
  const patientRef = (value: unknown) => patientIdByDbId.get(String(value ?? '')) ?? String(value ?? '')

  const invoices: Invoice[] = (invoiceResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    invoiceNumber: String(row.invoice_number ?? ''),
    patientId: patientRef(row.patient_id),
    branchId: row.branch_id ?? undefined,
    invoiceDate: String(row.invoice_date ?? ''),
    dueDate: row.due_date ?? undefined,
    items: Array.isArray(row.items) ? row.items as InvoiceItem[] : [],
    subtotalCents: Number(row.subtotal_cents ?? row.total_cents ?? 0),
    discountCents: Number(row.discount_cents ?? 0),
    totalCents: Number(row.total_cents ?? 0),
    amountPaidCents: Number(row.amount_paid_cents ?? 0),
    balanceCents: Number(row.balance_cents ?? 0),
    status: row.status ?? 'unpaid',
    notes: row.notes ?? '',
    voidReason: row.void_reason ?? undefined,
    voidedBy: row.voided_by ?? undefined,
    voidedAt: row.voided_at ?? undefined,
    createdBy: row.created_by ?? 'Clinic user',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }))

  const payments: Payment[] = (paymentResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    paymentNumber: String(row.payment_number ?? ''),
    patientId: patientRef(row.patient_id),
    invoiceId: String(row.invoice_id ?? ''),
    branchId: row.branch_id ?? undefined,
    amountCents: Number(row.amount_cents ?? 0),
    allocatedCents: Number(row.allocated_cents ?? row.amount_cents ?? 0),
    refundableCents: Number(row.refundable_cents ?? 0),
    paymentMethod: String(row.payment_method ?? 'cash') as PaymentMethod,
    date: String(row.payment_date ?? ''),
    referenceNumber: row.reference_number ?? undefined,
    source: row.source ?? 'manual',
    status: row.status ?? 'completed',
    proofFilePath: row.proof_file_path ?? undefined,
    gatewayProvider: row.gateway_provider ?? undefined,
    gatewayTransactionId: row.gateway_transaction_id ?? undefined,
    notes: row.notes ?? undefined,
    recordedBy: row.recorded_by ?? 'Clinic user',
    verifiedBy: row.verified_by ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    rejectionReasonInternal: row.rejection_reason_internal ?? undefined,
    rejectionReasonPatient: row.rejection_reason_patient ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  }))

  const receipts: Receipt[] = (receiptResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    receiptNumber: String(row.receipt_number ?? ''),
    paymentId: String(row.payment_id ?? ''),
    patientId: patientRef(row.patient_id),
    invoiceIds: Array.isArray(row.invoice_ids) ? row.invoice_ids.map(String) : [],
    branchId: row.branch_id ?? undefined,
    amountCents: Number(row.amount_cents ?? 0),
    remainingBalanceCents: Number(row.remaining_balance_cents ?? 0),
    issuedAt: row.issued_at ?? row.created_at ?? new Date().toISOString(),
    issuedBy: row.issued_by ?? 'Clinic user',
  }))

  const refunds: Refund[] = (refundResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    refundNumber: String(row.refund_number ?? ''),
    paymentId: String(row.payment_id ?? ''),
    patientId: patientRef(row.patient_id),
    branchId: row.branch_id ?? undefined,
    amountCents: Number(row.amount_cents ?? 0),
    reason: row.reason ?? '',
    status: row.status ?? 'completed',
    processedBy: row.processed_by ?? 'Clinic user',
    processedAt: row.processed_at ?? row.created_at ?? new Date().toISOString(),
    gatewayRefundId: row.gateway_refund_id ?? undefined,
  }))

  const charges: Charge[] = (chargeResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    patientId: patientRef(row.patient_id),
    branchId: row.branch_id ?? undefined,
    clinicalVisitId: row.clinical_visit_id ?? undefined,
    appointmentId: row.appointment_id ?? undefined,
    treatmentId: row.treatment_id ?? undefined,
    serviceId: row.service_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    providerNameSnapshot: row.provider_name_snapshot ?? undefined,
    description: row.description ?? '',
    quantity: Number(row.quantity ?? 1),
    unitPriceCents: Number(row.unit_price_cents ?? 0),
    subtotalCents: Number(row.subtotal_cents ?? 0),
    discountCents: Number(row.discount_cents ?? 0),
    finalAmountCents: Number(row.final_amount_cents ?? 0),
    status: row.status ?? 'unbilled',
    createdBy: row.created_by ?? 'Clinic user',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }))

  const existingPatients = getStoredPatients()
  const patientMap = new Map(existingPatients.map((row) => [row.id, row]))
  patients.forEach((row) => patientMap.set(row.id, row))
  saveStoredPatients(Array.from(patientMap.values()))

  const existingInvoices = parseStored<Invoice>('plamenco.invoices')
  const existingPayments = parseStored<Payment>('plamenco.payments')
  saveStoredInvoices(mergeById(existingInvoices, invoices, branchId, (row) => row.branchId))
  saveStoredPayments(mergeById(existingPayments, payments, branchId, (row) => row.branchId))

  window.localStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(mergeById(parseStored<Receipt>(RECEIPT_STORAGE_KEY), receipts, branchId, (row) => row.branchId)))
  window.localStorage.setItem(REFUND_STORAGE_KEY, JSON.stringify(mergeById(parseStored<Refund>(REFUND_STORAGE_KEY), refunds, branchId, (row) => row.branchId)))
  window.localStorage.setItem(CHARGE_STORAGE_KEY, JSON.stringify(mergeById(parseStored<Charge>(CHARGE_STORAGE_KEY), charges, branchId, (row) => row.branchId)))

  window.dispatchEvent(new CustomEvent('plamenco:billing-hydrated', { detail: { branchId } }))
  return { invoices, payments, receipts, refunds, charges }
}
