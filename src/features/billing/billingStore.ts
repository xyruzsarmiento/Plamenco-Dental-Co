import { createCommunicationDeliveryLog } from '../communications/communicationStore'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import type { Treatment } from '../treatments/treatmentTypes'
import type { CommunicationTemplateKey } from '../communications/communicationTypes'

export type InvoiceStatus = 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'void' | 'partially_refunded' | 'refunded'
export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'card' | 'online_gateway' | 'qrph' | 'other'
export type PaymentStatus =
  | 'pending'
  | 'pending_verification'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'voided'
  | 'partially_refunded'
  | 'refunded'
  | 'rejected'
export type PaymentSource = 'manual' | 'patient_portal' | 'online_gateway' | 'historical_import'
export type ChargeStatus = 'unbilled' | 'invoiced' | 'void'
export type DiscountType = 'fixed' | 'percentage'
export type RefundStatus = 'pending' | 'completed' | 'failed' | 'voided'

export type PaymentMethodConfig = {
  id: PaymentMethod
  label: string
  active: boolean
  isOnline: boolean
  requiresReference: boolean
  requiresVerification: boolean
}

export type DiscountRecord = {
  id: string
  type: DiscountType
  valueCents?: number
  percentage?: number
  reason: string
  authorizedBy: string
  createdAt: string
}

export type Charge = {
  id: string
  patientId: string
  branchId?: string
  clinicalVisitId?: string
  appointmentId?: string
  treatmentId?: string
  serviceId?: string
  providerId?: string
  providerNameSnapshot?: string
  description: string
  quantity: number
  unitPriceCents: number
  subtotalCents: number
  discountCents: number
  finalAmountCents: number
  status: ChargeStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type InvoiceItem = {
  id: string
  chargeId?: string
  treatmentId?: string
  serviceId?: string
  providerId?: string
  providerNameSnapshot?: string
  branchId?: string
  description: string
  quantity: number
  unitPriceCents: number
  discountCents?: number
  discountReason?: string
  amountCents?: number
}

export type Invoice = {
  id: string
  invoiceNumber: string
  patientId: string
  branchId?: string
  invoiceDate: string
  dueDate?: string
  items: InvoiceItem[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  amountPaidCents: number
  balanceCents: number
  status: InvoiceStatus
  notes: string
  voidReason?: string
  voidedBy?: string
  voidedAt?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type PaymentAllocation = {
  id: string
  paymentId: string
  invoiceId: string
  amountCents: number
  createdAt: string
}

export type Payment = {
  id: string
  paymentNumber: string
  patientId: string
  invoiceId: string
  branchId?: string
  amountCents: number
  allocatedCents: number
  refundableCents: number
  paymentMethod: PaymentMethod
  date: string
  referenceNumber?: string
  source: PaymentSource
  status: PaymentStatus
  proofFilePath?: string
  gatewayProvider?: string
  gatewayTransactionId?: string
  notes?: string
  recordedBy: string
  verifiedBy?: string
  verifiedAt?: string
  rejectionReasonInternal?: string
  rejectionReasonPatient?: string
  createdAt: string
}

export type Receipt = {
  id: string
  receiptNumber: string
  paymentId: string
  patientId: string
  invoiceIds: string[]
  branchId?: string
  amountCents: number
  remainingBalanceCents: number
  issuedAt: string
  issuedBy: string
}

export type Refund = {
  id: string
  refundNumber: string
  paymentId: string
  patientId: string
  branchId?: string
  amountCents: number
  reason: string
  status: RefundStatus
  processedBy: string
  processedAt: string
  gatewayRefundId?: string
}

export type GatewayEvent = {
  id: string
  provider: string
  eventId: string
  paymentId: string
  status: PaymentStatus
  receivedAt: string
}

type InvoiceInput = {
  patientId: string
  branchId?: string
  invoiceDate: string
  dueDate?: string
  items: InvoiceItem[]
  amountPaidCents?: number
  notes?: string
  createdBy?: string
}

type PaymentInput = {
  patientId: string
  invoiceId: string
  branchId?: string
  amountCents: number
  paymentMethod: PaymentMethod
  date: string
  referenceNumber?: string
  recordedBy: string
  notes?: string
}

const INVOICE_STORAGE_KEY = 'plamenco.invoices'
const PAYMENT_STORAGE_KEY = 'plamenco.payments'
const CHARGE_STORAGE_KEY = 'plamenco.billing.charges'
const ALLOCATION_STORAGE_KEY = 'plamenco.billing.paymentAllocations'
const RECEIPT_STORAGE_KEY = 'plamenco.billing.receipts'
const REFUND_STORAGE_KEY = 'plamenco.billing.refunds'
const PAYMENT_METHOD_STORAGE_KEY = 'plamenco.billing.paymentMethods'
const GATEWAY_EVENT_STORAGE_KEY = 'plamenco.billing.gatewayEvents'

const invoiceCache: { value: Invoice[] | null } = { value: null }
const paymentCache: { value: Payment[] | null } = { value: null }

const defaultPaymentMethods: PaymentMethodConfig[] = [
  { id: 'cash', label: 'Cash', active: true, isOnline: false, requiresReference: false, requiresVerification: false },
  { id: 'gcash', label: 'GCash', active: true, isOnline: false, requiresReference: true, requiresVerification: false },
  { id: 'maya', label: 'Maya', active: true, isOnline: false, requiresReference: true, requiresVerification: false },
  { id: 'bank_transfer', label: 'Bank Transfer', active: true, isOnline: false, requiresReference: true, requiresVerification: false },
  { id: 'card', label: 'Card/POS', active: true, isOnline: false, requiresReference: true, requiresVerification: false },
  { id: 'online_gateway', label: 'Online Gateway', active: false, isOnline: true, requiresReference: false, requiresVerification: true },
  { id: 'qrph', label: 'QR Ph', active: true, isOnline: true, requiresReference: true, requiresVerification: true },
  { id: 'other', label: 'Other', active: true, isOnline: false, requiresReference: false, requiresVerification: true },
]

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  } as Storage
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
    return globalThis.localStorage
  }

  const memoryStorage = (globalThis as typeof globalThis & { __plamencoMemoryStorage?: Storage }).__plamencoMemoryStorage
  if (memoryStorage) return memoryStorage

  const created = createMemoryStorage()
  ;(globalThis as typeof globalThis & { __plamencoMemoryStorage?: Storage }).__plamencoMemoryStorage = created
  return created
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function getList<T>(key: string): T[] {
  const stored = safeParse<T[]>(getStorage().getItem(key))
  return Array.isArray(stored) ? stored : []
}

function saveList<T>(key: string, rows: T[]) {
  getStorage().setItem(key, JSON.stringify(rows))
}

function nextHumanNumber(prefix: string, existing: string[], start = 1) {
  const next = existing.reduce((max, value) => {
    const match = value.match(new RegExp(`^${prefix}-(\\d+)$`))
    return match ? Math.max(max, Number(match[1])) : max
  }, start - 1) + 1
  return `${prefix}-${String(next).padStart(6, '0')}`
}

function audit(action: Parameters<typeof recordAuditEntry>[0]['action'], entity: string, entityId: string, metadata?: Record<string, string | number | boolean | null | undefined>) {
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action,
    entity,
    entityId,
    metadata,
  })
}

function notifyFinancialEvent(patientId: string, templateKey: CommunicationTemplateKey, message: string, relatedId: string) {
  createCommunicationDeliveryLog({
    patientId,
    channel: 'in_app',
    templateKey,
    recipient: patientId,
    message,
    status: 'queued',
    provider: 'in_app',
    idempotencyKey: `${templateKey}:${relatedId}`,
    queuedAt: nowIso(),
  })
}

function normalizePaymentMethod(method: string | undefined): PaymentMethod {
  if (method === 'bank transfer') return 'bank_transfer'
  if (method === 'credit_card') return 'card'
  if (method && ['cash', 'gcash', 'maya', 'bank_transfer', 'card', 'online_gateway', 'qrph', 'other'].includes(method)) {
    return method as PaymentMethod
  }
  return 'cash'
}

function itemSubtotal(item: InvoiceItem) {
  return Number(BigInt(item.quantity) * BigInt(item.unitPriceCents))
}

function itemDiscount(item: InvoiceItem) {
  return Math.min(Math.max(item.discountCents ?? 0, 0), itemSubtotal(item))
}

function itemAmount(item: InvoiceItem) {
  return Math.max(itemSubtotal(item) - itemDiscount(item), 0)
}

function normalizeInvoice(invoice: Partial<Invoice> & { id: string; patientId: string; invoiceDate: string; items?: InvoiceItem[] }): Invoice {
  const items = (invoice.items ?? []).map((item) => ({
    ...item,
    quantity: Number(item.quantity ?? 1),
    unitPriceCents: Number(item.unitPriceCents ?? 0),
    discountCents: Number(item.discountCents ?? 0),
    amountCents: Number(item.amountCents ?? itemAmount(item)),
  }))
  const subtotalCents = Number(invoice.subtotalCents ?? items.reduce((sum, item) => sum + itemSubtotal(item), 0))
  const discountCents = Number(invoice.discountCents ?? items.reduce((sum, item) => sum + itemDiscount(item), 0))
  const totalCents = Number(invoice.totalCents ?? Math.max(subtotalCents - discountCents, 0))
  const amountPaidCents = Number(invoice.amountPaidCents ?? 0)
  const balanceCents = Math.max(Number(invoice.balanceCents ?? totalCents - amountPaidCents), 0)
  const createdAt = invoice.createdAt ?? nowIso()

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber ?? 'INV-LEGACY',
    patientId: invoice.patientId,
    branchId: invoice.branchId,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    items,
    subtotalCents,
    discountCents,
    totalCents,
    amountPaidCents,
    balanceCents,
    status: invoice.status ?? (balanceCents <= 0 ? 'paid' : amountPaidCents > 0 ? 'partially_paid' : 'unpaid'),
    notes: invoice.notes ?? '',
    voidReason: invoice.voidReason,
    voidedBy: invoice.voidedBy,
    voidedAt: invoice.voidedAt,
    createdBy: invoice.createdBy ?? 'Front desk',
    createdAt,
    updatedAt: invoice.updatedAt ?? createdAt,
  }
}

function normalizePayment(payment: Partial<Payment> & { id: string; patientId: string; amountCents: number; date: string }): Payment {
  const createdAt = payment.createdAt ?? nowIso()
  return {
    id: payment.id,
    paymentNumber: payment.paymentNumber ?? nextHumanNumber('PAY', getList<Payment>(PAYMENT_STORAGE_KEY).map((entry) => entry.paymentNumber).filter(Boolean)),
    patientId: payment.patientId,
    invoiceId: payment.invoiceId ?? '',
    branchId: payment.branchId,
    amountCents: Number(payment.amountCents ?? 0),
    allocatedCents: Number(payment.allocatedCents ?? payment.amountCents ?? 0),
    refundableCents: Number(payment.refundableCents ?? payment.amountCents ?? 0),
    paymentMethod: normalizePaymentMethod(payment.paymentMethod),
    date: payment.date,
    referenceNumber: payment.referenceNumber,
    source: payment.source ?? 'manual',
    status: payment.status ?? 'completed',
    proofFilePath: payment.proofFilePath,
    gatewayProvider: payment.gatewayProvider,
    gatewayTransactionId: payment.gatewayTransactionId,
    notes: payment.notes,
    recordedBy: payment.recordedBy ?? 'Front desk',
    verifiedBy: payment.verifiedBy,
    verifiedAt: payment.verifiedAt,
    rejectionReasonInternal: payment.rejectionReasonInternal,
    rejectionReasonPatient: payment.rejectionReasonPatient,
    createdAt,
  }
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export function calculateInvoiceTotal(items: InvoiceItem[]): number {
  return calculateInvoiceTotals(items).totalCents
}

export function calculateInvoiceTotals(items: InvoiceItem[]) {
  const totals = items.reduce(
    (sum, item) => {
      if (!item.description.trim()) throw new Error('Each invoice item must include a description.')
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error('Invoice item quantity must be a positive integer.')
      if (!Number.isFinite(item.unitPriceCents) || item.unitPriceCents < 0) {
        throw new Error('Invoice item unit price must be a valid non-negative number in cents.')
      }
      if (!Number.isFinite(item.discountCents ?? 0) || (item.discountCents ?? 0) < 0) {
        throw new Error('Invoice item discount must be a valid non-negative amount in cents.')
      }

      const subtotal = BigInt(item.quantity) * BigInt(item.unitPriceCents)
      const discount = BigInt(Math.min(item.discountCents ?? 0, Number(subtotal)))
      return {
        subtotalCents: sum.subtotalCents + subtotal,
        discountCents: sum.discountCents + discount,
        totalCents: sum.totalCents + subtotal - discount,
      }
    },
    { subtotalCents: 0n, discountCents: 0n, totalCents: 0n },
  )

  return {
    subtotalCents: Number(totals.subtotalCents),
    discountCents: Number(totals.discountCents),
    totalCents: Number(totals.totalCents),
  }
}

export function getInvoiceStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === 'void' || invoice.status === 'refunded' || invoice.status === 'partially_refunded') return invoice.status
  if (invoice.totalCents === 0) return 'paid'
  if (invoice.balanceCents <= 0) return 'paid'
  if (invoice.amountPaidCents > 0) return 'partially_paid'
  return invoice.status === 'draft' ? 'draft' : 'unpaid'
}

export function getStoredInvoices(): Invoice[] {
  const cached = invoiceCache.value
  if (cached) return cached

  const stored = safeParse<Invoice[]>(getStorage().getItem(INVOICE_STORAGE_KEY))
  invoiceCache.value = Array.isArray(stored) ? stored.map(normalizeInvoice) : []
  return invoiceCache.value
}

export function getStoredPayments(): Payment[] {
  const cached = paymentCache.value
  if (cached) return cached

  const stored = safeParse<Payment[]>(getStorage().getItem(PAYMENT_STORAGE_KEY))
  paymentCache.value = Array.isArray(stored) ? stored.map(normalizePayment) : []
  return paymentCache.value
}

export function getStoredCharges(): Charge[] {
  return getList<Charge>(CHARGE_STORAGE_KEY)
}

export function getStoredPaymentAllocations(): PaymentAllocation[] {
  return getList<PaymentAllocation>(ALLOCATION_STORAGE_KEY)
}

export function getStoredReceipts(): Receipt[] {
  return getList<Receipt>(RECEIPT_STORAGE_KEY)
}

export function getStoredRefunds(): Refund[] {
  return getList<Refund>(REFUND_STORAGE_KEY)
}

export function getPaymentMethods(): PaymentMethodConfig[] {
  const stored = getList<PaymentMethodConfig>(PAYMENT_METHOD_STORAGE_KEY)
  return stored.length ? stored : defaultPaymentMethods
}

export function updatePaymentMethodConfig(methodId: PaymentMethod, updates: Partial<Omit<PaymentMethodConfig, 'id'>>) {
  const methods = getPaymentMethods()
  const index = methods.findIndex((method) => method.id === methodId)
  if (index === -1) throw new Error('Payment method not found.')
  const updated: PaymentMethodConfig = { ...methods[index], ...updates, id: methodId }
  const next = methods.map((method) => method.id === methodId ? updated : method)
  saveList(PAYMENT_METHOD_STORAGE_KEY, next)
  void updateRemoteTableRow('payment_methods', methodId, {
    label: updated.label,
    active: updated.active,
    is_online: updated.isOnline,
    requires_reference: updated.requiresReference,
    requires_verification: updated.requiresVerification,
  })
  audit('settings_changed', 'payment_method', methodId, { active: updated.active, isOnline: updated.isOnline, requiresReference: updated.requiresReference, requiresVerification: updated.requiresVerification })
  return updated
}

export function getActivePaymentMethods() {
  return getPaymentMethods().filter((method) => method.active)
}

export function saveStoredInvoices(invoices: Invoice[]) {
  invoiceCache.value = invoices.map(normalizeInvoice)
  getStorage().setItem(INVOICE_STORAGE_KEY, JSON.stringify(invoiceCache.value))
}

export function saveStoredPayments(payments: Payment[]) {
  paymentCache.value = payments.map(normalizePayment)
  getStorage().setItem(PAYMENT_STORAGE_KEY, JSON.stringify(paymentCache.value))
}

export function resetBillingState() {
  invoiceCache.value = null
  paymentCache.value = null
  ;[
    INVOICE_STORAGE_KEY,
    PAYMENT_STORAGE_KEY,
    CHARGE_STORAGE_KEY,
    ALLOCATION_STORAGE_KEY,
    RECEIPT_STORAGE_KEY,
    REFUND_STORAGE_KEY,
    PAYMENT_METHOD_STORAGE_KEY,
    GATEWAY_EVENT_STORAGE_KEY,
  ].forEach((key) => getStorage().removeItem(key))
}

export function seedDefaultBillingData() {
  return { invoices: getStoredInvoices(), payments: getStoredPayments(), charges: getStoredCharges() }
}

export function getInvoicesByPatient(patientId: string): Invoice[] {
  return getStoredInvoices()
    .filter((invoice) => invoice.patientId === patientId)
    .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
}

export function getPaymentsByPatient(patientId: string): Payment[] {
  return getStoredPayments()
    .filter((payment) => payment.patientId === patientId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getReceiptsByPatient(patientId: string): Receipt[] {
  return getStoredReceipts()
    .filter((receipt) => receipt.patientId === patientId)
    .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
}

export function getOutstandingBalanceByPatient(patientId: string) {
  return getInvoicesByPatient(patientId)
    .filter((invoice) => invoice.status !== 'void')
    .reduce((sum, invoice) => sum + Math.max(invoice.balanceCents, 0), 0)
}

export function createCharge(input: Omit<Charge, 'id' | 'subtotalCents' | 'finalAmountCents' | 'status' | 'createdAt' | 'updatedAt'>): Charge {
  if (!input.patientId) throw new Error('Patient is required before adding a charge.')
  if (!input.description.trim()) throw new Error('Charge description is required.')
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Charge quantity must be a positive integer.')
  if (!Number.isFinite(input.unitPriceCents) || input.unitPriceCents < 0) throw new Error('Charge unit price must be a valid non-negative number in cents.')

  const existing = getStoredCharges()
  const subtotalCents = Number(BigInt(input.quantity) * BigInt(input.unitPriceCents))
  const discountCents = Math.min(Math.max(input.discountCents, 0), subtotalCents)
  const charge: Charge = {
    ...input,
    id: makeId('chg'),
    subtotalCents,
    discountCents,
    finalAmountCents: Math.max(subtotalCents - discountCents, 0),
    status: 'unbilled',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }

  saveList(CHARGE_STORAGE_KEY, [charge, ...existing])
  void insertRemoteTableRow('charges', {
    id: charge.id,
    patient_id: charge.patientId,
    branch_id: charge.branchId ?? null,
    clinical_visit_id: charge.clinicalVisitId ?? null,
    appointment_id: charge.appointmentId ?? null,
    treatment_id: charge.treatmentId ?? null,
    service_id: charge.serviceId ?? null,
    provider_id: charge.providerId ?? null,
    provider_name_snapshot: charge.providerNameSnapshot ?? '',
    description: charge.description,
    quantity: charge.quantity,
    unit_price_cents: charge.unitPriceCents,
    subtotal_cents: charge.subtotalCents,
    discount_cents: charge.discountCents,
    final_amount_cents: charge.finalAmountCents,
    status: charge.status,
    created_by: charge.createdBy,
  })
  audit('charge_created', 'charge', charge.id, { patientId: charge.patientId, amountCents: charge.finalAmountCents })
  return charge
}

export function createChargeFromTreatment(treatment: Treatment, amountCents: number, createdBy: string): Charge {
  const existing = getStoredCharges().find((charge) => charge.treatmentId === treatment.id && charge.status !== 'void')
  if (existing) return existing
  return createCharge({
    patientId: treatment.patientId,
    branchId: treatment.branchId,
    clinicalVisitId: treatment.dentalRecordId,
    appointmentId: treatment.appointmentId,
    treatmentId: treatment.id,
    serviceId: treatment.serviceId,
    providerId: treatment.providerId,
    providerNameSnapshot: treatment.providerNameSnapshot,
    description: treatment.serviceNameSnapshot || treatment.description || 'Dental treatment',
    quantity: 1,
    unitPriceCents: amountCents,
    discountCents: 0,
    createdBy,
  })
}

export function getUnbilledCharges(patientId?: string) {
  return getStoredCharges().filter((charge) => charge.status === 'unbilled' && (!patientId || charge.patientId === patientId))
}

export function markChargesInvoiced(chargeIds: string[], invoiceId: string) {
  const chargeSet = new Set(chargeIds)
  const updated = getStoredCharges().map((charge) => chargeSet.has(charge.id) ? { ...charge, status: 'invoiced' as const, updatedAt: nowIso() } : charge)
  saveList(CHARGE_STORAGE_KEY, updated)
  chargeIds.forEach((id) => void updateRemoteTableRow('charges', id, { status: 'invoiced', invoice_id: invoiceId }))
  return updated
}

export function createInvoice(input: InvoiceInput): Invoice {
  if (!input.patientId) throw new Error('Patient is required before creating an invoice.')
  if (!input.invoiceDate) throw new Error('Invoice date is required.')
  if (!input.items.length) throw new Error('Add at least one item before creating an invoice.')

  const totals = calculateInvoiceTotals(input.items)
  const now = nowIso()
  const amountPaidCents = Math.min(Math.max(input.amountPaidCents ?? 0, 0), totals.totalCents)
  const invoice: Invoice = {
    id: makeId('inv'),
    invoiceNumber: nextHumanNumber('INV', getStoredInvoices().map((entry) => entry.invoiceNumber)),
    patientId: input.patientId,
    branchId: input.branchId,
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate,
    items: input.items.map((item) => ({
      ...item,
      amountCents: itemAmount(item),
    })),
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    amountPaidCents,
    balanceCents: Math.max(totals.totalCents - amountPaidCents, 0),
    status: amountPaidCents >= totals.totalCents ? 'paid' : amountPaidCents > 0 ? 'partially_paid' : 'unpaid',
    notes: input.notes?.trim() ?? '',
    createdBy: input.createdBy ?? getCurrentSessionUserName(),
    createdAt: now,
    updatedAt: now,
  }

  saveStoredInvoices([invoice, ...getStoredInvoices()])
  void insertRemoteTableRow('invoices', {
    id: invoice.id,
    invoice_number: invoice.invoiceNumber,
    patient_id: invoice.patientId,
    branch_id: invoice.branchId ?? null,
    invoice_date: invoice.invoiceDate,
    due_date: invoice.dueDate || null,
    items: invoice.items,
    subtotal_cents: invoice.subtotalCents,
    discount_cents: invoice.discountCents,
    total_cents: invoice.totalCents,
    amount_paid_cents: invoice.amountPaidCents,
    balance_cents: invoice.balanceCents,
    status: invoice.status,
    notes: invoice.notes,
    created_by: invoice.createdBy,
  })
  markChargesInvoiced(invoice.items.map((item) => item.chargeId).filter((value): value is string => Boolean(value)), invoice.id)
  audit('invoice_created', 'invoice', invoice.id, { invoiceNumber: invoice.invoiceNumber, patientId: invoice.patientId, totalCents: invoice.totalCents })
  return invoice
}

export function applyDiscountToInvoiceItem(
  invoiceId: string,
  itemId: string,
  discount: DiscountRecord,
): Invoice {
  const invoice = getStoredInvoices().find((entry) => entry.id === invoiceId)
  if (!invoice) throw new Error('Invoice not found.')
  if (invoice.status === 'void') throw new Error('Void invoices cannot be edited.')

  const items = invoice.items.map((item) => {
    if (item.id !== itemId) return item
    const subtotal = itemSubtotal(item)
    const discountCents = discount.type === 'percentage'
      ? Math.min(Math.round(subtotal * Math.max(discount.percentage ?? 0, 0) / 100), subtotal)
      : Math.min(Math.max(discount.valueCents ?? 0, 0), subtotal)

    return {
      ...item,
      discountCents,
      discountReason: discount.reason,
      amountCents: Math.max(subtotal - discountCents, 0),
    }
  })

  const totals = calculateInvoiceTotals(items)
  const updated: Invoice = {
    ...invoice,
    items,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    balanceCents: Math.max(totals.totalCents - invoice.amountPaidCents, 0),
    updatedAt: nowIso(),
  }
  updated.status = getInvoiceStatus(updated)
  saveStoredInvoices(getStoredInvoices().map((entry) => entry.id === invoiceId ? updated : entry))
  void updateRemoteTableRow('invoices', invoiceId, {
    items: updated.items,
    subtotal_cents: updated.subtotalCents,
    discount_cents: updated.discountCents,
    total_cents: updated.totalCents,
    balance_cents: updated.balanceCents,
    status: updated.status,
  })
  audit('invoice_discount_applied', 'invoice', invoiceId, { patientId: invoice.patientId, discountReason: discount.reason, totalCents: updated.totalCents })
  return updated
}

export function createPayment(input: PaymentInput): Payment {
  if (!input.patientId) throw new Error('Patient is required before recording a payment.')
  if (!input.invoiceId) throw new Error('Invoice is required before recording a payment.')
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Payment amount must be a positive integer amount in cents.')
  if (!input.date) throw new Error('Payment date is required.')

  const invoice = getStoredInvoices().find((entry) => entry.id === input.invoiceId)
  if (!invoice) throw new Error('Invoice not found.')
  if (invoice.status === 'void') throw new Error('Payments cannot be applied to a void invoice.')
  if (input.amountCents > invoice.balanceCents) throw new Error('Payment cannot exceed the invoice balance.')

  const method = getPaymentMethods().find((entry) => entry.id === input.paymentMethod)
  if (!method?.active) throw new Error('Selected payment method is not active.')
  if (method.requiresReference && !input.referenceNumber?.trim()) throw new Error('A payment reference is required for this payment method.')

  const payment: Payment = {
    id: makeId('pay'),
    paymentNumber: nextHumanNumber('PAY', getStoredPayments().map((entry) => entry.paymentNumber)),
    patientId: input.patientId,
    invoiceId: input.invoiceId,
    branchId: input.branchId ?? invoice.branchId,
    amountCents: input.amountCents,
    allocatedCents: 0,
    refundableCents: input.amountCents,
    paymentMethod: input.paymentMethod,
    date: input.date,
    referenceNumber: input.referenceNumber,
    source: 'manual',
    status: method.requiresVerification ? 'pending_verification' : 'completed',
    recordedBy: input.recordedBy,
    notes: input.notes?.trim() ?? '',
    createdAt: nowIso(),
  }

  saveStoredPayments([payment, ...getStoredPayments()])
  void insertRemoteTableRow('payments', {
    id: payment.id,
    payment_number: payment.paymentNumber,
    patient_id: payment.patientId,
    invoice_id: payment.invoiceId,
    branch_id: payment.branchId ?? null,
    amount_cents: payment.amountCents,
    allocated_cents: payment.allocatedCents,
    refundable_cents: payment.refundableCents,
    payment_method: payment.paymentMethod,
    payment_date: payment.date,
    reference_number: payment.referenceNumber ?? '',
    source: payment.source,
    status: payment.status,
    recorded_by: payment.recordedBy,
    notes: payment.notes ?? '',
  })

  audit('payment_created', 'payment', payment.id, { paymentNumber: payment.paymentNumber, invoiceId: payment.invoiceId, amountCents: payment.amountCents, status: payment.status })
  return payment
}
