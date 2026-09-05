import { createCommunicationDeliveryLog } from '../communications/communicationStore'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import type { Treatment } from '../treatments/treatmentTypes'
import type { CommunicationTemplateKey } from '../communications/communicationTypes'

export type InvoiceStatus = 'draft' | 'unpaid' | 'partially_paid' | 'paid' | 'void' | 'partially_refunded' | 'refunded'
export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'card' | 'online_gateway' | 'other'
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
  if (method && ['cash', 'gcash', 'maya', 'bank_transfer', 'card', 'online_gateway', 'other'].includes(method)) {
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
  return getStorage().getItem(PAYMENT_METHOD_STORAGE_KEY) !== null ? stored : defaultPaymentMethods
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
  for (const key of [
    INVOICE_STORAGE_KEY,
    PAYMENT_STORAGE_KEY,
    CHARGE_STORAGE_KEY,
    ALLOCATION_STORAGE_KEY,
    RECEIPT_STORAGE_KEY,
    REFUND_STORAGE_KEY,
    PAYMENT_METHOD_STORAGE_KEY,
    GATEWAY_EVENT_STORAGE_KEY,
  ]) {
    getStorage().removeItem(key)
  }
}

export function getInvoiceById(id: string): Invoice | undefined {
  return getStoredInvoices().find((invoice) => invoice.id === id)
}

export function getPaymentsByInvoice(invoiceId: string): Payment[] {
  const paymentIds = new Set(getStoredPaymentAllocations().filter((allocation) => allocation.invoiceId === invoiceId).map((allocation) => allocation.paymentId))
  return getStoredPayments().filter((payment) => payment.invoiceId === invoiceId || paymentIds.has(payment.id))
}

export function getPaymentsByPatient(patientId: string): Payment[] {
  return getStoredPayments()
    .filter((payment) => payment.patientId === patientId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getReceiptsByPatient(patientId: string): Receipt[] {
  return getStoredReceipts().filter((receipt) => receipt.patientId === patientId)
}

export function getRefundsByPatient(patientId: string): Refund[] {
  return getStoredRefunds().filter((refund) => refund.patientId === patientId)
}

export function getInvoicesByPatient(patientId: string): Invoice[] {
  return getStoredInvoices()
    .filter((invoice) => invoice.patientId === patientId)
    .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
}

export function getOutstandingBalanceByPatient(patientId: string): number {
  return getInvoicesByPatient(patientId)
    .filter((invoice) => invoice.status !== 'void')
    .reduce((sum, invoice) => sum + invoice.balanceCents, 0)
}

export function getLedgerByPatient(patientId: string) {
  const invoices = getInvoicesByPatient(patientId).map((invoice) => ({
    id: invoice.id,
    date: invoice.invoiceDate,
    kind: 'invoice' as const,
    label: `Invoice ${invoice.invoiceNumber}`,
    amountCents: invoice.totalCents,
    runningEffectCents: invoice.totalCents,
  }))
  const payments = getPaymentsByPatient(patientId)
    .filter((payment) => ['completed', 'partially_refunded', 'refunded'].includes(payment.status))
    .map((payment) => ({
      id: payment.id,
      date: payment.date,
      kind: 'payment' as const,
      label: `${getPaymentMethodLabel(payment.paymentMethod)} payment ${payment.paymentNumber}`,
      amountCents: payment.amountCents,
      runningEffectCents: -payment.allocatedCents,
    }))
  const refunds = getRefundsByPatient(patientId).map((refund) => ({
    id: refund.id,
    date: refund.processedAt,
    kind: 'refund' as const,
    label: `Refund ${refund.refundNumber}`,
    amountCents: refund.amountCents,
    runningEffectCents: refund.amountCents,
  }))

  let runningBalanceCents = 0
  return [...invoices, ...payments, ...refunds]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((entry) => {
      runningBalanceCents += entry.runningEffectCents
      return { ...entry, runningBalanceCents: Math.max(runningBalanceCents, 0) }
    })
    .reverse()
}

export function createCharge(input: Omit<Charge, 'id' | 'subtotalCents' | 'finalAmountCents' | 'status' | 'createdAt' | 'updatedAt'> & { status?: ChargeStatus }): Charge {
  if (!input.patientId.trim()) throw new Error('Patient is required for a charge.')
  if (!input.description.trim()) throw new Error('Charge description is required.')
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('Charge quantity must be a positive integer.')
  if (!Number.isFinite(input.unitPriceCents) || input.unitPriceCents < 0) throw new Error('Charge unit price must be non-negative.')

  const now = nowIso()
  const subtotalCents = Number(BigInt(input.quantity) * BigInt(input.unitPriceCents))
  const discountCents = Math.min(Math.max(input.discountCents, 0), subtotalCents)
  const charge: Charge = {
    ...input,
    id: makeId('charge'),
    subtotalCents,
    discountCents,
    finalAmountCents: Math.max(subtotalCents - discountCents, 0),
    status: input.status ?? 'unbilled',
    createdAt: now,
    updatedAt: now,
  }

  saveList(CHARGE_STORAGE_KEY, [charge, ...getStoredCharges()])
  void insertRemoteTableRow('charges', mapChargeToRemoteRow(charge))
  audit('charge_added', 'charge', charge.id, {
    patientId: charge.patientId,
    branchId: charge.branchId,
    treatmentId: charge.treatmentId,
    amountCents: charge.finalAmountCents,
  })
  return charge
}

export function createChargeFromTreatment(treatment: Treatment, createdBy = getCurrentSessionUserName()): Charge {
  return createCharge({
    patientId: treatment.patientId,
    branchId: treatment.branchId,
    clinicalVisitId: treatment.dentalRecordId,
    appointmentId: treatment.appointmentId,
    treatmentId: treatment.id,
    serviceId: treatment.serviceId,
    providerId: treatment.providerId,
    providerNameSnapshot: treatment.providerNameSnapshot ?? treatment.performedBy,
    description: treatment.serviceNameSnapshot || treatment.description,
    quantity: treatment.quantity ?? 1,
    unitPriceCents: treatment.priceSnapshotCents ?? treatment.cost ?? 0,
    discountCents: 0,
    createdBy,
  })
}

export function createInvoice({ patientId, branchId, invoiceDate, dueDate, items, amountPaidCents = 0, notes = '', createdBy }: InvoiceInput): Invoice {
  if (!patientId.trim()) throw new Error('Patient is required to create an invoice.')
  if (!invoiceDate) throw new Error('Invoice date is required.')
  if (!Array.isArray(items) || items.length === 0) throw new Error('Invoice must include at least one item.')
  if (!Number.isFinite(amountPaidCents) || amountPaidCents < 0) throw new Error('Amount paid must be a valid non-negative amount in cents.')

  const normalizedItems = items.map((item) => ({
    ...item,
    discountCents: item.discountCents ?? 0,
    amountCents: itemAmount(item),
  }))
  const totals = calculateInvoiceTotals(normalizedItems)
  if (amountPaidCents > totals.totalCents) throw new Error('Initial payment cannot exceed invoice total.')

  const now = nowIso()
  const invoices = getStoredInvoices()
  const invoiceNumber = nextHumanNumber('INV', invoices.map((invoice) => invoice.invoiceNumber))
  const invoice: Invoice = {
    id: makeId('invoice'),
    invoiceNumber,
    patientId,
    branchId: branchId || normalizedItems.find((item) => item.branchId)?.branchId,
    invoiceDate,
    dueDate,
    items: normalizedItems,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    amountPaidCents,
    balanceCents: totals.totalCents - amountPaidCents,
    status: amountPaidCents <= 0 ? 'unpaid' : amountPaidCents >= totals.totalCents ? 'paid' : 'partially_paid',
    notes,
    createdBy: createdBy?.trim() || getCurrentSessionUserName(),
    createdAt: now,
    updatedAt: now,
  }

  saveStoredInvoices([invoice, ...invoices])
  markChargesInvoiced(normalizedItems, invoice.id)
  void insertRemoteTableRow('invoices', mapInvoiceToRemoteRow(invoice))
  audit('invoice_created', 'invoice', invoice.id, { patientId, invoiceId: invoice.id, totalCents: invoice.totalCents, branchId: invoice.branchId })
  notifyFinancialEvent(patientId, 'invoice.created', `${invoice.invoiceNumber} is now available in your billing account.`, invoice.id)
  return invoice
}

export function createInvoiceFromCharges(patientId: string, chargeIds: string[], invoiceDate: string, notes?: string): Invoice {
  const charges = getStoredCharges().filter((charge) => charge.patientId === patientId && chargeIds.includes(charge.id) && charge.status === 'unbilled')
  if (!charges.length) throw new Error('No eligible unbilled charges were selected.')

  return createInvoice({
    patientId,
    branchId: charges[0].branchId,
    invoiceDate,
    items: charges.map((charge) => ({
      id: makeId('item'),
      chargeId: charge.id,
      treatmentId: charge.treatmentId,
      serviceId: charge.serviceId,
      providerId: charge.providerId,
      providerNameSnapshot: charge.providerNameSnapshot,
      branchId: charge.branchId,
      description: charge.description,
      quantity: charge.quantity,
      unitPriceCents: charge.unitPriceCents,
      discountCents: charge.discountCents,
      amountCents: charge.finalAmountCents,
    })),
    notes,
  })
}

export function applyDiscountToInvoiceItem(invoiceId: string, itemId: string, discount: Omit<DiscountRecord, 'id' | 'createdAt'>) {
  const invoices = getStoredInvoices()
  const index = invoices.findIndex((invoice) => invoice.id === invoiceId)
  if (index === -1) throw new Error('Invoice not found.')
  const invoice = invoices[index]
  if (invoice.status === 'paid' || invoice.status === 'void') throw new Error('Discounts can only be applied before an invoice is settled or voided.')

  const items = invoice.items.map((item) => {
    if (item.id !== itemId) return item
    const subtotal = itemSubtotal(item)
    const discountCents = discount.type === 'percentage'
      ? Math.round(subtotal * Math.min(Math.max(discount.percentage ?? 0, 0), 100) / 100)
      : Math.min(discount.valueCents ?? 0, subtotal)
    return { ...item, discountCents, discountReason: discount.reason, amountCents: Math.max(subtotal - discountCents, 0) }
  })

  const totals = calculateInvoiceTotals(items)
  if (invoice.amountPaidCents > totals.totalCents) throw new Error('Discount would reduce the invoice below the amount already paid.')

  const updated = {
    ...invoice,
    items,
    subtotalCents: totals.subtotalCents,
    discountCents: totals.discountCents,
    totalCents: totals.totalCents,
    balanceCents: totals.totalCents - invoice.amountPaidCents,
    updatedAt: nowIso(),
  }
  updated.status = getInvoiceStatus(updated)
  invoices[index] = updated
  saveStoredInvoices(invoices)
  void updateRemoteTableRow('invoices', invoiceId, mapInvoiceToRemoteRow(updated))
  audit('discount_applied', 'invoice', invoiceId, { invoiceId, itemId, reason: discount.reason, authorizedBy: discount.authorizedBy })
  return updated
}

export function applyPayment(input: PaymentInput): Payment {
  return recordCompletedPayment(input, 'manual')
}

function recordCompletedPayment(input: PaymentInput, source: PaymentSource, gateway?: { provider?: string; transactionId?: string }): Payment {
  const invoice = validatePaymentInput(input)
  const payment = createPaymentRecord({
    ...input,
    branchId: input.branchId || invoice.branchId,
    source,
    status: 'completed',
    gatewayProvider: gateway?.provider,
    gatewayTransactionId: gateway?.transactionId,
  })
  allocatePayment(payment.id, [{ invoiceId: invoice.id, amountCents: input.amountCents }])
  createReceiptForPayment(payment.id)
  audit('payment_recorded', 'payment', payment.id, {
    patientId: input.patientId,
    invoiceId: input.invoiceId,
    amountCents: input.amountCents,
    paymentMethod: input.paymentMethod,
    branchId: payment.branchId,
  })
  notifyFinancialEvent(input.patientId, 'payment.confirmed', `${formatCurrency(input.amountCents)} was received for ${invoice.invoiceNumber}.`, payment.id)
  return getStoredPayments().find((entry) => entry.id === payment.id) ?? payment
}

export function submitManualPaymentProof(input: PaymentInput & { proofFilePath?: string }): Payment {
  const invoice = validatePaymentInput(input)
  const payment = createPaymentRecord({
    ...input,
    branchId: input.branchId || invoice.branchId,
    source: 'patient_portal',
    status: 'pending_verification',
    proofFilePath: input.proofFilePath,
  })
  audit('payment_submitted', 'payment', payment.id, { patientId: input.patientId, invoiceId: input.invoiceId, amountCents: input.amountCents })
  notifyFinancialEvent(input.patientId, 'payment.submitted', 'Your payment proof was submitted for clinic verification.', payment.id)
  return payment
}

export function approvePayment(paymentId: string, verifiedBy: string): Payment {
  const payments = getStoredPayments()
  const paymentIndex = payments.findIndex((payment) => payment.id === paymentId)
  if (paymentIndex === -1) throw new Error('Payment not found.')
  const payment = payments[paymentIndex]
  if (payment.status !== 'pending_verification') throw new Error('Only payments pending verification can be approved.')
  validatePaymentInput({
    patientId: payment.patientId,
    invoiceId: payment.invoiceId,
    branchId: payment.branchId,
    amountCents: payment.amountCents,
    paymentMethod: payment.paymentMethod,
    date: payment.date,
    referenceNumber: payment.referenceNumber,
    recordedBy: payment.recordedBy,
  })

  const updated: Payment = { ...payment, status: 'completed', verifiedBy, verifiedAt: nowIso() }
  payments[paymentIndex] = updated
  saveStoredPayments(payments)
  void updateRemoteTableRow('payments', paymentId, mapPaymentToRemoteRow(updated))
  allocatePayment(paymentId, [{ invoiceId: payment.invoiceId, amountCents: payment.amountCents }])
  createReceiptForPayment(paymentId)
  audit('payment_approved', 'payment', paymentId, { patientId: payment.patientId, invoiceId: payment.invoiceId, verifiedBy })
  notifyFinancialEvent(payment.patientId, 'payment.confirmed', `${formatCurrency(payment.amountCents)} was verified and applied to your account.`, paymentId)
  return getStoredPayments().find((entry) => entry.id === paymentId) ?? updated
}

export function rejectPayment(paymentId: string, rejectedBy: string, internalReason: string, patientReason: string): Payment {
  const payments = getStoredPayments()
  const index = payments.findIndex((payment) => payment.id === paymentId)
  if (index === -1) throw new Error('Payment not found.')
  const updated: Payment = {
    ...payments[index],
    status: 'rejected',
    verifiedBy: rejectedBy,
    verifiedAt: nowIso(),
    rejectionReasonInternal: internalReason,
    rejectionReasonPatient: patientReason,
  }
  payments[index] = updated
  saveStoredPayments(payments)
  void updateRemoteTableRow('payments', paymentId, mapPaymentToRemoteRow(updated))
  audit('payment_rejected', 'payment', paymentId, { patientId: updated.patientId, invoiceId: updated.invoiceId, rejectedBy })
  notifyFinancialEvent(updated.patientId, 'payment.rejected', patientReason || 'Your payment submission could not be verified.', paymentId)
  return updated
}

export function initiateOnlinePayment(input: PaymentInput & { gatewayProvider?: string }): Payment {
  const invoice = validatePaymentInput(input)
  const payment = createPaymentRecord({
    ...input,
    branchId: input.branchId || invoice.branchId,
    paymentMethod: 'online_gateway',
    source: 'online_gateway',
    status: 'processing',
    gatewayProvider: input.gatewayProvider ?? 'not_configured',
  })
  audit('payment_submitted', 'payment', payment.id, { patientId: input.patientId, invoiceId: input.invoiceId, source: 'online_gateway' })
  return payment
}

export function processGatewayEvent(input: {
  provider: string
  eventId: string
  paymentId: string
  status: 'completed' | 'failed'
  gatewayTransactionId?: string
}) {
  const events = getList<GatewayEvent>(GATEWAY_EVENT_STORAGE_KEY)
  const existing = events.find((event) => event.provider === input.provider && event.eventId === input.eventId)
  if (existing) return getStoredPayments().find((payment) => payment.id === existing.paymentId)

  const payments = getStoredPayments()
  const index = payments.findIndex((payment) => payment.id === input.paymentId)
  if (index === -1) throw new Error('Payment not found.')
  const payment = payments[index]
  if (payment.status === 'completed') return payment

  const updated: Payment = {
    ...payment,
    status: input.status,
    gatewayTransactionId: input.gatewayTransactionId ?? payment.gatewayTransactionId,
    verifiedBy: input.provider,
    verifiedAt: nowIso(),
  }
  payments[index] = updated
  saveStoredPayments(payments)
  saveList(GATEWAY_EVENT_STORAGE_KEY, [
    { id: makeId('gateway-event'), provider: input.provider, eventId: input.eventId, paymentId: input.paymentId, status: input.status, receivedAt: nowIso() },
    ...events,
  ])

  if (input.status === 'completed') {
    validatePaymentInput({
      patientId: updated.patientId,
      invoiceId: updated.invoiceId,
      amountCents: updated.amountCents,
      paymentMethod: updated.paymentMethod,
      date: updated.date,
      recordedBy: updated.recordedBy,
    })
    allocatePayment(updated.id, [{ invoiceId: updated.invoiceId, amountCents: updated.amountCents }])
    createReceiptForPayment(updated.id)
    notifyFinancialEvent(updated.patientId, 'payment.confirmed', `${formatCurrency(updated.amountCents)} online payment was verified.`, updated.id)
  }

  void updateRemoteTableRow('payments', updated.id, mapPaymentToRemoteRow(updated))
  audit('payment_gateway_event_processed', 'payment', updated.id, { provider: input.provider, eventId: input.eventId, status: input.status })
  return getStoredPayments().find((entry) => entry.id === updated.id) ?? updated
}

function validatePaymentInput(input: PaymentInput) {
  if (!input.patientId.trim()) throw new Error('Patient is required for a payment record.')
  if (!input.invoiceId.trim()) throw new Error('Invoice is required for a payment record.')
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) throw new Error('Payment amount must be greater than zero.')
  if (!input.date) throw new Error('Payment date is required.')

  const invoice = getInvoiceById(input.invoiceId)
  if (!invoice) throw new Error('Invoice not found.')
  if (invoice.status === 'void') throw new Error('Payments cannot be applied to a void invoice.')
  if (invoice.patientId !== input.patientId) throw new Error('Payment patient does not match the invoice patient.')
  if (input.amountCents > invoice.balanceCents) throw new Error('Payment amount exceeds the outstanding invoice balance.')

  const method = getPaymentMethods().find((entry) => entry.id === input.paymentMethod)
  if (method?.requiresReference && !input.referenceNumber?.trim()) {
    throw new Error(`${method.label} payments require a reference number.`)
  }
  return invoice
}

function createPaymentRecord(input: PaymentInput & {
  source: PaymentSource
  status: PaymentStatus
  proofFilePath?: string
  gatewayProvider?: string
  gatewayTransactionId?: string
}): Payment {
  const payments = getStoredPayments()
  const now = nowIso()
  const payment: Payment = {
    id: makeId('payment'),
    paymentNumber: nextHumanNumber('PAY', payments.map((entry) => entry.paymentNumber)),
    patientId: input.patientId,
    invoiceId: input.invoiceId,
    branchId: input.branchId,
    amountCents: input.amountCents,
    allocatedCents: 0,
    refundableCents: input.status === 'completed' ? input.amountCents : 0,
    paymentMethod: input.paymentMethod,
    date: input.date,
    referenceNumber: input.referenceNumber,
    source: input.source,
    status: input.status,
    proofFilePath: input.proofFilePath,
    gatewayProvider: input.gatewayProvider,
    gatewayTransactionId: input.gatewayTransactionId,
    notes: input.notes,
    recordedBy: input.recordedBy.trim() || 'Front desk',
    createdAt: now,
  }
  saveStoredPayments([payment, ...payments])
  void insertRemoteTableRow('payments', mapPaymentToRemoteRow(payment))
  return payment
}

export function allocatePayment(paymentId: string, allocations: Array<{ invoiceId: string; amountCents: number }>) {
  const payments = getStoredPayments()
  const paymentIndex = payments.findIndex((payment) => payment.id === paymentId)
  if (paymentIndex === -1) throw new Error('Payment not found.')
  const payment = payments[paymentIndex]
  if (payment.status !== 'completed') throw new Error('Only completed payments can be allocated.')

  const totalAllocation = allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0)
  if (totalAllocation <= 0 || totalAllocation > payment.amountCents) throw new Error('Payment allocation must be positive and cannot exceed payment amount.')

  const invoices = getStoredInvoices()
  for (const allocation of allocations) {
    const invoice = invoices.find((entry) => entry.id === allocation.invoiceId)
    if (!invoice) throw new Error('Invoice not found for allocation.')
    if (invoice.patientId !== payment.patientId) throw new Error('Payment allocation patient mismatch.')
    if (allocation.amountCents > invoice.balanceCents) throw new Error('Payment allocation exceeds invoice balance.')
  }

  const now = nowIso()
  const newAllocations = allocations.map<PaymentAllocation>((allocation) => ({
    id: makeId('allocation'),
    paymentId,
    invoiceId: allocation.invoiceId,
    amountCents: allocation.amountCents,
    createdAt: now,
  }))
  saveList(ALLOCATION_STORAGE_KEY, [...newAllocations, ...getStoredPaymentAllocations()])

  for (const allocation of allocations) {
    const invoiceIndex = invoices.findIndex((invoice) => invoice.id === allocation.invoiceId)
    const updated = {
      ...invoices[invoiceIndex],
      amountPaidCents: invoices[invoiceIndex].amountPaidCents + allocation.amountCents,
      balanceCents: Math.max(invoices[invoiceIndex].balanceCents - allocation.amountCents, 0),
      updatedAt: now,
    }
    updated.status = getInvoiceStatus(updated)
    invoices[invoiceIndex] = updated
    void updateRemoteTableRow('invoices', updated.id, mapInvoiceToRemoteRow(updated))
  }

  payments[paymentIndex] = {
    ...payment,
    allocatedCents: payment.allocatedCents + totalAllocation,
    refundableCents: payment.refundableCents === 0 ? totalAllocation : payment.refundableCents,
  }
  saveStoredInvoices(invoices)
  saveStoredPayments(payments)
  newAllocations.forEach((allocation) => void insertRemoteTableRow('payment_allocations', mapAllocationToRemoteRow(allocation)))
  return newAllocations
}

export function voidInvoice(invoiceId: string, reason: string, voidedBy: string): Invoice {
  const invoices = getStoredInvoices()
  const index = invoices.findIndex((invoice) => invoice.id === invoiceId)
  if (index === -1) throw new Error('Invoice not found.')
  const invoice = invoices[index]
  if (invoice.amountPaidCents > 0) throw new Error('Paid invoices require refund or reversal handling before voiding.')
  const updated: Invoice = { ...invoice, status: 'void', balanceCents: 0, voidReason: reason, voidedBy, voidedAt: nowIso(), updatedAt: nowIso() }
  invoices[index] = updated
  saveStoredInvoices(invoices)
  void updateRemoteTableRow('invoices', invoiceId, mapInvoiceToRemoteRow(updated))
  audit('invoice_voided', 'invoice', invoiceId, { reason, voidedBy, patientId: invoice.patientId })
  return updated
}

export function createRefund(input: { paymentId: string; amountCents: number; reason: string; processedBy: string; gatewayRefundId?: string }): Refund {
  const payments = getStoredPayments()
  const paymentIndex = payments.findIndex((payment) => payment.id === input.paymentId)
  if (paymentIndex === -1) throw new Error('Payment not found.')
  const payment = payments[paymentIndex]
  if (!['completed', 'partially_refunded'].includes(payment.status)) throw new Error('Only completed payments can be refunded.')
  if (input.amountCents <= 0 || input.amountCents > payment.refundableCents) throw new Error('Refund amount exceeds the eligible refundable amount.')

  const now = nowIso()
  const refund: Refund = {
    id: makeId('refund'),
    refundNumber: nextHumanNumber('REF', getStoredRefunds().map((entry) => entry.refundNumber)),
    paymentId: payment.id,
    patientId: payment.patientId,
    branchId: payment.branchId,
    amountCents: input.amountCents,
    reason: input.reason,
    status: 'completed',
    processedBy: input.processedBy,
    processedAt: now,
    gatewayRefundId: input.gatewayRefundId,
  }
  saveList(REFUND_STORAGE_KEY, [refund, ...getStoredRefunds()])

  payments[paymentIndex] = {
    ...payment,
    refundableCents: payment.refundableCents - input.amountCents,
    status: payment.refundableCents - input.amountCents <= 0 ? 'refunded' : 'partially_refunded',
  }
  saveStoredPayments(payments)
  audit('refund_completed', 'refund', refund.id, { paymentId: payment.id, amountCents: refund.amountCents, branchId: refund.branchId })
  notifyFinancialEvent(payment.patientId, 'payment.refunded', `${formatCurrency(refund.amountCents)} was recorded as refunded.`, refund.id)
  void insertRemoteTableRow('refunds', mapRefundToRemoteRow(refund))
  void updateRemoteTableRow('payments', payment.id, mapPaymentToRemoteRow(payments[paymentIndex]))
  return refund
}

export function createReceiptForPayment(paymentId: string): Receipt {
  const existing = getStoredReceipts().find((receipt) => receipt.paymentId === paymentId)
  if (existing) return existing
  const payment = getStoredPayments().find((entry) => entry.id === paymentId)
  if (!payment || payment.status !== 'completed') throw new Error('Receipt can only be generated for a completed payment.')
  const allocations = getStoredPaymentAllocations().filter((allocation) => allocation.paymentId === paymentId)
  const remainingBalanceCents = allocations.reduce((sum, allocation) => sum + (getInvoiceById(allocation.invoiceId)?.balanceCents ?? 0), 0)
  const receipt: Receipt = {
    id: makeId('receipt'),
    receiptNumber: nextHumanNumber('RCPT', getStoredReceipts().map((entry) => entry.receiptNumber)),
    paymentId,
    patientId: payment.patientId,
    invoiceIds: allocations.map((allocation) => allocation.invoiceId),
    branchId: payment.branchId,
    amountCents: payment.amountCents,
    remainingBalanceCents,
    issuedAt: nowIso(),
    issuedBy: payment.verifiedBy ?? payment.recordedBy,
  }
  saveList(RECEIPT_STORAGE_KEY, [receipt, ...getStoredReceipts()])
  void insertRemoteTableRow('receipts', mapReceiptToRemoteRow(receipt))
  return receipt
}

function markChargesInvoiced(items: InvoiceItem[], invoiceId: string) {
  const chargeIds = new Set(items.map((item) => item.chargeId).filter(Boolean))
  if (!chargeIds.size) return
  const charges = getStoredCharges().map((charge) => chargeIds.has(charge.id) ? { ...charge, status: 'invoiced' as const, updatedAt: nowIso() } : charge)
  saveList(CHARGE_STORAGE_KEY, charges)
  charges
    .filter((charge) => chargeIds.has(charge.id))
    .forEach((charge) => void updateRemoteTableRow('charges', charge.id, { status: 'invoiced', invoice_id: invoiceId }))
}

export function getTodayRevenue(): number {
  const today = new Date().toISOString().slice(0, 10)
  return getStoredPayments()
    .filter((payment) => payment.date === today && ['completed', 'partially_refunded'].includes(payment.status))
    .reduce((sum, payment) => sum + payment.amountCents, 0)
}

export function getPendingPaymentsCount(): number {
  return getStoredPayments().filter((payment) => payment.status === 'pending_verification' || payment.status === 'processing').length
}

export function getOutstandingBalanceTotal(): number {
  return getStoredInvoices()
    .filter((invoice) => invoice.status !== 'void')
    .reduce((sum, invoice) => sum + invoice.balanceCents, 0)
}

export function getPartiallyPaidInvoiceCount() {
  return getStoredInvoices().filter((invoice) => invoice.status === 'partially_paid').length
}

export function getInvoiceSummaryByPatient(patientId: string) {
  const invoices = getInvoicesByPatient(patientId)
  const totalOutstanding = invoices.reduce((sum, invoice) => sum + invoice.balanceCents, 0)
  const totalPaid = invoices.reduce((sum, invoice) => sum + invoice.amountPaidCents, 0)

  return {
    invoiceCount: invoices.length,
    totalOutstanding,
    totalPaid,
  }
}

export function createInvoiceFromTreatmentPlan(
  patientId: string,
  invoiceDate: string,
  treatmentItems: Array<{ description: string; quantity: number; unitPriceCents: number; treatmentId?: string; branchId?: string; providerId?: string; providerNameSnapshot?: string }>,
  notes?: string,
): Invoice {
  return createInvoice({
    patientId,
    branchId: treatmentItems.find((item) => item.branchId)?.branchId,
    invoiceDate,
    items: treatmentItems.map((item) => ({
      id: makeId('treatment-item'),
      treatmentId: item.treatmentId,
      branchId: item.branchId,
      providerId: item.providerId,
      providerNameSnapshot: item.providerNameSnapshot,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      discountCents: 0,
    })),
    notes: notes ?? 'Treatment plan invoice',
  })
}

export function getPaymentMethodLabel(method: string): string {
  return getPaymentMethods().find((entry) => entry.id === normalizePaymentMethod(method))?.label ?? method
}

export function getGatewayFoundation() {
  return {
    provider: 'not_configured',
    createPayment: initiateOnlinePayment,
    getPaymentStatus: (paymentId: string) => getStoredPayments().find((payment) => payment.id === paymentId)?.status ?? 'pending',
    processWebhook: processGatewayEvent,
    refundPayment: createRefund,
    requiresServerSecrets: ['PAYMENT_SECRET_KEY', 'PAYMENT_WEBHOOK_SECRET'],
  }
}

function mapChargeToRemoteRow(charge: Charge) {
  return {
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
  }
}

function mapInvoiceToRemoteRow(invoice: Invoice) {
  return {
    id: invoice.id,
    invoice_number: invoice.invoiceNumber,
    patient_id: invoice.patientId,
    branch_id: invoice.branchId ?? null,
    invoice_date: invoice.invoiceDate,
    due_date: invoice.dueDate ?? null,
    items: invoice.items,
    subtotal_cents: invoice.subtotalCents,
    discount_cents: invoice.discountCents,
    total_cents: invoice.totalCents,
    amount_paid_cents: invoice.amountPaidCents,
    balance_cents: invoice.balanceCents,
    status: invoice.status,
    notes: invoice.notes,
    void_reason: invoice.voidReason ?? '',
    voided_by: invoice.voidedBy ?? '',
    voided_at: invoice.voidedAt ?? null,
    created_by: invoice.createdBy,
  }
}

function mapPaymentToRemoteRow(payment: Payment) {
  return {
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
    proof_file_path: payment.proofFilePath ?? '',
    gateway_provider: payment.gatewayProvider ?? '',
    gateway_transaction_id: payment.gatewayTransactionId ?? '',
    notes: payment.notes ?? '',
    recorded_by: payment.recordedBy,
    verified_by: payment.verifiedBy ?? '',
    verified_at: payment.verifiedAt ?? null,
    rejection_reason_internal: payment.rejectionReasonInternal ?? '',
    rejection_reason_patient: payment.rejectionReasonPatient ?? '',
  }
}

function mapAllocationToRemoteRow(allocation: PaymentAllocation) {
  return {
    id: allocation.id,
    payment_id: allocation.paymentId,
    invoice_id: allocation.invoiceId,
    amount_cents: allocation.amountCents,
  }
}

function mapReceiptToRemoteRow(receipt: Receipt) {
  return {
    id: receipt.id,
    receipt_number: receipt.receiptNumber,
    payment_id: receipt.paymentId,
    patient_id: receipt.patientId,
    invoice_ids: receipt.invoiceIds,
    branch_id: receipt.branchId ?? null,
    amount_cents: receipt.amountCents,
    remaining_balance_cents: receipt.remainingBalanceCents,
    issued_at: receipt.issuedAt,
    issued_by: receipt.issuedBy,
  }
}

function mapRefundToRemoteRow(refund: Refund) {
  return {
    id: refund.id,
    refund_number: refund.refundNumber,
    payment_id: refund.paymentId,
    patient_id: refund.patientId,
    branch_id: refund.branchId ?? null,
    amount_cents: refund.amountCents,
    reason: refund.reason,
    status: refund.status,
    processed_by: refund.processedBy,
    processed_at: refund.processedAt,
    gateway_refund_id: refund.gatewayRefundId ?? '',
  }
}

export {
  ALLOCATION_STORAGE_KEY,
  CHARGE_STORAGE_KEY,
  GATEWAY_EVENT_STORAGE_KEY,
  INVOICE_STORAGE_KEY,
  PAYMENT_METHOD_STORAGE_KEY,
  PAYMENT_STORAGE_KEY,
  RECEIPT_STORAGE_KEY,
  REFUND_STORAGE_KEY,
}
