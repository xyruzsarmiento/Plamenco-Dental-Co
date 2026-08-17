import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'refunded'
export type PaymentMethod = 'cash' | 'gcash' | 'maya' | 'bank_transfer' | 'card'

export type InvoiceItem = {
  id: string
  description: string
  quantity: number
  unitPriceCents: number
}

export type Invoice = {
  id: string
  invoiceNumber: string
  patientId: string
  invoiceDate: string
  items: InvoiceItem[]
  totalCents: number
  amountPaidCents: number
  balanceCents: number
  status: InvoiceStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export type Payment = {
  id: string
  patientId: string
  invoiceId: string
  amountCents: number
  paymentMethod: PaymentMethod
  date: string
  referenceNumber?: string
  recordedBy: string
  createdAt: string
}

type InvoiceInput = {
  patientId: string
  invoiceDate: string
  items: InvoiceItem[]
  amountPaidCents?: number
  notes?: string
}

type PaymentInput = {
  patientId: string
  invoiceId: string
  amountCents: number
  paymentMethod: PaymentMethod
  date: string
  referenceNumber?: string
  recordedBy: string
}

const INVOICE_STORAGE_KEY = 'plamenco.invoices'
const PAYMENT_STORAGE_KEY = 'plamenco.payments'

const invoiceCache: { value: Invoice[] | null } = { value: null }
const paymentCache: { value: Payment[] | null } = { value: null }

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
  if (memoryStorage) {
    return memoryStorage
  }

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

export function calculateInvoiceTotal(items: InvoiceItem[]): number {
  const total = items.reduce((sum, item) => {
    if (!item.description.trim()) {
      throw new Error('Each invoice item must include a description.')
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Invoice item quantity must be a positive integer.')
    }

    if (!Number.isFinite(item.unitPriceCents) || item.unitPriceCents < 0) {
      throw new Error('Invoice item unit price must be a valid non-negative number in cents.')
    }

    return sum + (BigInt(item.quantity) * BigInt(item.unitPriceCents))
  }, 0n)

  return Number(total)
}

export function getInvoiceStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.status === 'refunded') return 'refunded'
  if (invoice.totalCents === 0) return 'paid'
  if (invoice.balanceCents <= 0) return 'paid'
  if (invoice.amountPaidCents > 0) return 'partially_paid'
  return 'unpaid'
}

export function getStoredInvoices(): Invoice[] {
  const cached = invoiceCache.value
  if (cached) {
    return cached
  }

  const stored = safeParse<Invoice[]>(getStorage().getItem(INVOICE_STORAGE_KEY))
  if (stored && stored.length > 0) {
    invoiceCache.value = stored
    return stored
  }

  invoiceCache.value = []
  return []
}

export function getStoredPayments(): Payment[] {
  const cached = paymentCache.value
  if (cached) {
    return cached
  }

  const stored = safeParse<Payment[]>(getStorage().getItem(PAYMENT_STORAGE_KEY))
  if (stored && stored.length > 0) {
    paymentCache.value = stored
    return stored
  }

  paymentCache.value = []
  return []
}

export function saveStoredInvoices(invoices: Invoice[]) {
  invoiceCache.value = invoices
  getStorage().setItem(INVOICE_STORAGE_KEY, JSON.stringify(invoices))
}

export function saveStoredPayments(payments: Payment[]) {
  paymentCache.value = payments
  getStorage().setItem(PAYMENT_STORAGE_KEY, JSON.stringify(payments))
}

export function resetBillingState() {
  invoiceCache.value = null
  paymentCache.value = null
  getStorage().removeItem(INVOICE_STORAGE_KEY)
  getStorage().removeItem(PAYMENT_STORAGE_KEY)
}

export function getInvoiceById(id: string): Invoice | undefined {
  return getStoredInvoices().find((invoice) => invoice.id === id)
}

export function getPaymentsByInvoice(invoiceId: string): Payment[] {
  return getStoredPayments().filter((payment) => payment.invoiceId === invoiceId)
}

export function getPaymentsByPatient(patientId: string): Payment[] {
  return getStoredPayments()
    .filter((payment) => payment.patientId === patientId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getInvoicesByPatient(patientId: string): Invoice[] {
  return getStoredInvoices()
    .filter((invoice) => invoice.patientId === patientId)
    .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime())
}

export function getOutstandingBalanceByPatient(patientId: string): number {
  return getInvoicesByPatient(patientId).reduce((sum, invoice) => sum + invoice.balanceCents, 0)
}

export function createInvoice({ patientId, invoiceDate, items, amountPaidCents = 0, notes = '' }: InvoiceInput): Invoice {
  if (!patientId.trim()) {
    throw new Error('Patient is required to create an invoice.')
  }

  if (!invoiceDate) {
    throw new Error('Invoice date is required.')
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Invoice must include at least one item.')
  }

  if (!Number.isFinite(amountPaidCents) || amountPaidCents < 0) {
    throw new Error('Amount paid must be a valid non-negative amount in cents.')
  }

  const totalCents = calculateInvoiceTotal(items)
  const safePaid = Math.min(amountPaidCents, totalCents)
  const balanceCents = Math.max(totalCents - safePaid, 0)
  const status = safePaid <= 0 ? 'unpaid' : safePaid >= totalCents ? 'paid' : 'partially_paid'
  const now = new Date().toISOString()
  const invoices = getStoredInvoices()
  const invoiceNumber = `INV-${String(invoices.length + 1001).padStart(4, '0')}`

  const invoice: Invoice = {
    id: `invoice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    invoiceNumber,
    patientId,
    invoiceDate,
    items,
    totalCents,
    amountPaidCents: safePaid,
    balanceCents,
    status,
    notes,
    createdAt: now,
    updatedAt: now,
  }

  invoices.push(invoice)
  saveStoredInvoices(invoices)
  
  // Persist to Supabase asynchronously
  void insertRemoteTableRow('invoices', {
    id: invoice.id,
    invoice_number: invoice.invoiceNumber,
    patient_id: invoice.patientId,
    invoice_date: invoice.invoiceDate,
    items: invoice.items,
    total_cents: invoice.totalCents,
    amount_paid_cents: invoice.amountPaidCents,
    balance_cents: invoice.balanceCents,
    status: invoice.status,
    notes: invoice.notes,
  })
  
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'invoice_created',
    entity: 'invoice',
    entityId: invoice.patientId,
    metadata: { patientId: invoice.patientId, invoiceId: invoice.id, totalCents: invoice.totalCents },
  })
  return invoice
}

export function applyPayment({
  patientId,
  invoiceId,
  amountCents,
  paymentMethod,
  date,
  referenceNumber,
  recordedBy,
}: PaymentInput): Payment {
  if (!patientId.trim()) {
    throw new Error('Patient is required for a payment record.')
  }

  if (!invoiceId.trim()) {
    throw new Error('Invoice is required for a payment record.')
  }

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('Payment amount must be greater than zero.')
  }

  if (!date) {
    throw new Error('Payment date is required.')
  }

  const invoice = getInvoiceById(invoiceId)
  if (!invoice) {
    throw new Error('Invoice not found.')
  }

  if (invoice.patientId !== patientId) {
    throw new Error('Payment patient does not match the invoice patient.')
  }

  const remainingBalance = Math.max(invoice.totalCents - invoice.amountPaidCents, 0)
  if (amountCents > remainingBalance) {
    throw new Error('Payment amount exceeds the outstanding invoice balance.')
  }

  const payments = getStoredPayments()
  const now = new Date().toISOString()
  const payment: Payment = {
    id: `payment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    patientId,
    invoiceId,
    amountCents,
    paymentMethod,
    date,
    referenceNumber,
    recordedBy: recordedBy.trim() || 'Front desk',
    createdAt: now,
  }

  payments.push(payment)
  saveStoredPayments(payments)
  
  // Persist payment to Supabase asynchronously
  void insertRemoteTableRow('payments', {
    id: payment.id,
    patient_id: payment.patientId,
    invoice_id: payment.invoiceId,
    amount_cents: payment.amountCents,
    payment_method: payment.paymentMethod,
    payment_date: payment.date,
    reference_number: payment.referenceNumber,
    recorded_by: payment.recordedBy,
  })

  invoice.amountPaidCents += amountCents
  invoice.balanceCents = Math.max(invoice.totalCents - invoice.amountPaidCents, 0)
  invoice.status = getInvoiceStatus(invoice)
  invoice.updatedAt = now

  const allInvoices = getStoredInvoices()
  const invoiceIndex = allInvoices.findIndex((entry) => entry.id === invoice.id)
  if (invoiceIndex >= 0) {
    allInvoices[invoiceIndex] = invoice
    saveStoredInvoices(allInvoices)
    
    // Persist updated invoice to Supabase asynchronously
    void updateRemoteTableRow('invoices', invoice.id, {
      amount_paid_cents: invoice.amountPaidCents,
      balance_cents: invoice.balanceCents,
      status: invoice.status,
    })
  }

  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'payment_recorded',
    entity: 'payment',
    entityId: patientId,
    metadata: { patientId, invoiceId, amountCents, paymentMethod },
  })

  return payment
}

export function getTodayRevenue(): number {
  const today = new Date().toISOString().slice(0, 10)
  return getStoredPayments()
    .filter((payment) => payment.date === today)
    .reduce((sum, payment) => sum + payment.amountCents, 0)
}

export function getPendingPaymentsCount(): number {
  return getStoredInvoices().filter((invoice) => invoice.balanceCents > 0).length
}

export function getOutstandingBalanceTotal(): number {
  return getStoredInvoices().reduce((sum, invoice) => sum + invoice.balanceCents, 0)
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
  treatmentItems: Array<{ description: string; quantity: number; unitPriceCents: number }>,
  notes?: string
): Invoice {
  return createInvoice({
    patientId,
    invoiceDate,
    items: treatmentItems.map((item) => ({
      id: `treatment-item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    })),
    notes: notes ?? 'Treatment plan invoice',
  })
}

export { INVOICE_STORAGE_KEY, PAYMENT_STORAGE_KEY }
