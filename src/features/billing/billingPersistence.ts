import { supabase } from '../../lib/supabase'
import { createUuid } from '../../lib/id'
import { getStoredPatients } from '../patients/patientStore'
import {
  getStoredInvoices,
  getStoredPayments,
  getStoredReceipts,
  getStoredRefunds,
  saveStoredInvoices,
  saveStoredPayments,
  type DiscountType,
  type Invoice,
  type InvoiceItem,
  type Payment,
  type PaymentMethod,
  type Receipt,
  type Refund,
} from './billingStore'

const RECEIPT_STORAGE_KEY = 'plamenco.billing.receipts'
const REFUND_STORAGE_KEY = 'plamenco.billing.refunds'

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Financial changes cannot be saved safely.')
  return supabase
}

function patientReferenceFromDatabaseId(patientId: string) {
  return getStoredPatients().find((patient) => patient.id === patientId)?.patientId ?? patientId
}

function mapInvoiceRow(row: Record<string, any>): Invoice {
  return {
    id: String(row.id), invoiceNumber: String(row.invoice_number ?? ''), patientId: patientReferenceFromDatabaseId(String(row.patient_id ?? '')),
    branchId: row.branch_id ?? undefined, invoiceDate: String(row.invoice_date ?? ''), dueDate: row.due_date ?? undefined,
    items: Array.isArray(row.items) ? row.items as InvoiceItem[] : [], subtotalCents: Number(row.subtotal_cents ?? 0),
    discountCents: Number(row.discount_cents ?? 0), totalCents: Number(row.total_cents ?? 0), amountPaidCents: Number(row.amount_paid_cents ?? 0),
    balanceCents: Number(row.balance_cents ?? 0), status: row.status ?? 'unpaid', notes: row.notes ?? '', voidReason: row.void_reason ?? undefined,
    voidedBy: row.voided_by ?? undefined, voidedAt: row.voided_at ?? undefined, createdBy: row.created_by ?? 'system',
    createdAt: row.created_at ?? new Date().toISOString(), updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

function mapPaymentRow(row: Record<string, any>): Payment {
  return {
    id: String(row.id), paymentNumber: String(row.payment_number ?? ''), patientId: patientReferenceFromDatabaseId(String(row.patient_id ?? '')),
    invoiceId: String(row.invoice_id ?? ''), branchId: row.branch_id ?? undefined, amountCents: Number(row.amount_cents ?? 0),
    allocatedCents: Number(row.allocated_cents ?? 0), refundableCents: Number(row.refundable_cents ?? 0), paymentMethod: row.payment_method ?? 'cash',
    date: String(row.payment_date ?? ''), referenceNumber: row.reference_number ?? undefined, source: row.source ?? 'manual', status: row.status ?? 'completed',
    proofFilePath: row.proof_file_path ?? undefined, gatewayProvider: row.gateway_provider ?? undefined, gatewayTransactionId: row.gateway_transaction_id ?? undefined,
    notes: row.notes ?? undefined, recordedBy: row.recorded_by ?? 'Clinic user', verifiedBy: row.verified_by ?? undefined, verifiedAt: row.verified_at ?? undefined,
    rejectionReasonInternal: row.rejection_reason_internal ?? undefined, rejectionReasonPatient: row.rejection_reason_patient ?? undefined,
    createdAt: row.created_at ?? new Date().toISOString(),
  }
}

function mapReceiptRow(row: Record<string, any>): Receipt {
  return {
    id: String(row.id), receiptNumber: String(row.receipt_number ?? ''), paymentId: String(row.payment_id ?? ''),
    patientId: patientReferenceFromDatabaseId(String(row.patient_id ?? '')), invoiceIds: Array.isArray(row.invoice_ids) ? row.invoice_ids.map(String) : [],
    branchId: row.branch_id ?? undefined, amountCents: Number(row.amount_cents ?? 0), remainingBalanceCents: Number(row.remaining_balance_cents ?? 0),
    issuedAt: row.issued_at ?? row.created_at ?? new Date().toISOString(), issuedBy: row.issued_by ?? 'Clinic user',
  }
}

function mapRefundRow(row: Record<string, any>): Refund {
  return {
    id: String(row.id), refundNumber: String(row.refund_number ?? ''), paymentId: String(row.payment_id ?? ''),
    patientId: patientReferenceFromDatabaseId(String(row.patient_id ?? '')), branchId: row.branch_id ?? undefined,
    amountCents: Number(row.amount_cents ?? 0), reason: row.reason ?? '', status: row.status ?? 'completed',
    processedBy: row.processed_by ?? 'Clinic user', processedAt: row.processed_at ?? row.created_at ?? new Date().toISOString(),
    gatewayRefundId: row.gateway_refund_id ?? undefined,
  }
}

function replaceInvoice(invoice: Invoice) { saveStoredInvoices([invoice, ...getStoredInvoices().filter((entry) => entry.id !== invoice.id)]) }
function replacePayment(payment: Payment) { saveStoredPayments([payment, ...getStoredPayments().filter((entry) => entry.id !== payment.id)]) }
function replaceReceipt(receipt: Receipt) {
  const next = [receipt, ...getStoredReceipts().filter((entry) => entry.id !== receipt.id && entry.paymentId !== receipt.paymentId)]
  window.localStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(next))
}
function replaceRefund(refund: Refund) {
  const next = [refund, ...getStoredRefunds().filter((entry) => entry.id !== refund.id)]
  window.localStorage.setItem(REFUND_STORAGE_KEY, JSON.stringify(next))
}
function signalBillingMutation(branchId?: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('plamenco:billing-mutated', { detail: { branchId } }))
}
function rpcError(message: string, cause: { message?: string } | null | undefined) {
  if (import.meta.env.DEV && cause?.message) console.error('[billing persistence]', cause)
  return new Error(cause?.message ? `${message} ${cause.message}` : message)
}

export async function createInvoicePersisted(input: { patientDbId: string; branchId?: string; invoiceDate: string; dueDate?: string; items: InvoiceItem[]; notes?: string; clientRequestId?: string }): Promise<Invoice> {
  const db = requireDatabase(); const clientRequestId = input.clientRequestId ?? createUuid()
  const { data, error } = await db.rpc('create_invoice_from_items', { p_patient_id: input.patientDbId, p_branch_id: input.branchId || null, p_invoice_date: input.invoiceDate, p_due_date: input.dueDate || null, p_items: input.items, p_notes: input.notes ?? '', p_client_request_id: clientRequestId })
  if (error || !data?.invoice) throw rpcError('Unable to create the invoice. No financial changes were committed.', error)
  const invoice = mapInvoiceRow(data.invoice as Record<string, any>); replaceInvoice(invoice); signalBillingMutation(invoice.branchId); return invoice
}

export async function recordManualPaymentPersisted(input: { invoiceId: string; amountCents: number; paymentMethod: PaymentMethod; date: string; referenceNumber?: string; notes?: string; clientRequestId?: string }): Promise<{ payment: Payment; invoice: Invoice; receipt: Receipt }> {
  const db = requireDatabase(); const clientRequestId = input.clientRequestId ?? createUuid()
  const { data, error } = await db.rpc('record_manual_payment', { p_invoice_id: input.invoiceId, p_amount_cents: input.amountCents, p_payment_method: input.paymentMethod, p_payment_date: input.date, p_reference_number: input.referenceNumber ?? '', p_notes: input.notes ?? '', p_client_request_id: clientRequestId })
  if (error || !data?.payment || !data?.invoice || !data?.receipt) throw rpcError('Payment was not recorded. No balance change was committed.', error)
  const payment=mapPaymentRow(data.payment as Record<string,any>), invoice=mapInvoiceRow(data.invoice as Record<string,any>), receipt=mapReceiptRow(data.receipt as Record<string,any>)
  replacePayment(payment); replaceInvoice(invoice); replaceReceipt(receipt); signalBillingMutation(invoice.branchId ?? payment.branchId); return { payment, invoice, receipt }
}

export async function applyInvoiceDiscountPersisted(input: { invoiceId: string; itemId: string; type: DiscountType; valueCents?: number; percentage?: number; reason: string }): Promise<Invoice> {
  const db=requireDatabase(); const {data,error}=await db.rpc('apply_invoice_discount',{p_invoice_id:input.invoiceId,p_item_id:input.itemId,p_discount_type:input.type,p_value_cents:input.valueCents??null,p_percentage:input.percentage??null,p_reason:input.reason})
  if(error||!data) throw rpcError('Discount was not applied. The invoice was left unchanged.',error); const invoice=mapInvoiceRow(data as Record<string,any>); replaceInvoice(invoice); signalBillingMutation(invoice.branchId); return invoice
}

export async function voidInvoicePersisted(invoiceId:string,reason:string):Promise<Invoice>{
  const db=requireDatabase(); const {data,error}=await db.rpc('void_invoice',{p_invoice_id:invoiceId,p_reason:reason}); if(error||!data) throw rpcError('The invoice could not be voided. It remains unchanged.',error); const invoice=mapInvoiceRow(data as Record<string,any>); replaceInvoice(invoice); signalBillingMutation(invoice.branchId); return invoice
}

export async function refundPaymentPersisted(input:{paymentId:string;amountCents:number;reason:string;gatewayRefundId?:string;clientRequestId?:string}):Promise<{refund:Refund;payment:Payment;invoice:Invoice}>{
  const db=requireDatabase(); const clientRequestId=input.clientRequestId??createUuid(); const {data,error}=await db.rpc('record_payment_refund',{p_payment_id:input.paymentId,p_amount_cents:input.amountCents,p_reason:input.reason,p_gateway_refund_id:input.gatewayRefundId??'',p_client_request_id:clientRequestId})
  if(error||!data?.refund||!data?.payment||!data?.invoice) throw rpcError('The refund could not be recorded. No financial changes were committed.',error)
  const refund=mapRefundRow(data.refund as Record<string,any>),payment=mapPaymentRow(data.payment as Record<string,any>),invoice=mapInvoiceRow(data.invoice as Record<string,any>); replaceRefund(refund);replacePayment(payment);replaceInvoice(invoice);signalBillingMutation(invoice.branchId ?? payment.branchId);return{refund,payment,invoice}
}

export async function verifySubmittedPaymentPersisted(paymentId:string):Promise<{payment:Payment;invoice:Invoice;receipt:Receipt}>{
  const db=requireDatabase(); const {data,error}=await db.rpc('verify_submitted_payment',{p_payment_id:paymentId})
  if(error||!data?.payment||!data?.invoice||!data?.receipt) throw rpcError('The submitted payment could not be verified. No balance change was committed.',error)
  const payment=mapPaymentRow(data.payment as Record<string,any>),invoice=mapInvoiceRow(data.invoice as Record<string,any>),receipt=mapReceiptRow(data.receipt as Record<string,any>);replacePayment(payment);replaceInvoice(invoice);replaceReceipt(receipt);signalBillingMutation(invoice.branchId ?? payment.branchId);return{payment,invoice,receipt}
}

export async function rejectSubmittedPaymentPersisted(paymentId:string,internalReason:string,patientReason=''):Promise<Payment>{
  const db=requireDatabase(); const {data,error}=await db.rpc('reject_submitted_payment',{p_payment_id:paymentId,p_internal_reason:internalReason,p_patient_reason:patientReason})
  if(error||!data?.payment) throw rpcError('The submitted payment could not be rejected. It remains unchanged.',error); const payment=mapPaymentRow(data.payment as Record<string,any>);replacePayment(payment);signalBillingMutation(payment.branchId);return payment
}
