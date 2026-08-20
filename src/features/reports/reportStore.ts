import { getStoredAppointments } from '../appointments/appointmentStore.ts'
import type { Appointment, AppointmentStatus } from '../appointments/appointmentTypes.ts'
import { getStoredBranches } from '../branches/branchStore.ts'
import type { Branch } from '../branches/branchTypes.ts'
import { getStoredCharges, getStoredInvoices, getStoredPayments, getStoredRefunds } from '../billing/billingStore.ts'
import type { Charge, Invoice, InvoiceStatus, Payment, PaymentMethod, Refund } from '../billing/billingStore.ts'
import { getProviderBranchAssignments, getStoredProviders } from '../dentists/dentistStore.ts'
import type { Provider, ProviderBranchAssignment } from '../dentists/dentistTypes.ts'
import { getExpenseCategories, getExpenses, getExpensePayments, getExpenseVendors } from '../expenses/expenseStore.ts'
import type { Expense, ExpenseCategory, ExpensePayment, ExpenseVendor } from '../expenses/expenseStore.ts'
import {
  getBranchInventory,
  getInventoryCategories,
  getInventoryItems,
  getInventoryOverview,
  getInventoryValuation,
  getPurchaseOrders,
  getPurchaseReceipts,
  getSuppliers,
  getStockMovements,
} from '../inventory/inventoryStore.ts'
import type { BranchInventory, InventoryCategory, InventoryItem, PurchaseOrder, PurchaseReceipt, StockMovement, Supplier } from '../inventory/inventoryStore.ts'
import { getStoredPatients } from '../patients/patientStore.ts'
import type { Patient } from '../patients/patientTypes.ts'
import { getStoredServices } from '../services/serviceStore.ts'
import type { Service } from '../services/serviceTypes.ts'
import { getStoredTreatments } from '../treatments/treatmentStore.ts'
import type { Treatment } from '../treatments/treatmentTypes.ts'

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_7_days'
  | 'this_month'
  | 'last_month'
  | 'last_30_days'
  | 'this_quarter'
  | 'this_year'
  | 'custom'

export type ReportingFilters = {
  preset?: DateRangePreset
  startDate: string
  endDate: string
  branchId?: string
  authorizedBranchIds?: string[]
  providerId?: string
  serviceId?: string
  treatmentStatus?: string
  appointmentStatus?: AppointmentStatus | 'all'
  patientId?: string
  paymentMethod?: PaymentMethod | 'all'
  invoiceStatus?: InvoiceStatus | 'all'
  expenseCategoryId?: string
  vendorId?: string
  inventoryCategoryId?: string
  supplierId?: string
  stockStatus?: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'
}

export type ReportPeriodComparison = {
  currentCents: number
  previousCents: number
  changePercent: number | null
}

export type CountPeriodComparison = {
  current: number
  previous: number
  changePercent: number | null
}

export type RevenueMetric = {
  dailyTotal: number
  weeklyTotal: number
  monthlyTotal: number
  outstandingBalance: number
  paymentMethods: Array<{ method: PaymentMethod; total: number }>
}

export type PatientMetric = {
  total: number
  newThisMonth: number
  returning: number
}

export type AppointmentMetric = {
  statusCounts: Record<'completed' | 'cancelled' | 'no_show' | 'pending', number>
}

export type ServiceMetric = {
  topRequested: Array<{ serviceId: string; name: string; count: number; revenue: number }>
}

export type ReportSnapshot = {
  revenue: RevenueMetric
  patients: PatientMetric
  appointments: AppointmentMetric
  services: ServiceMetric
}

export type EnterpriseReportSnapshot = {
  filters: ReportingFilters
  executive: {
    appointments: number
    completedVisits: number
    uniquePatientsSeen: number
    newPatients: number
    returningPatients: number
    activePatients: number
    billedRevenueCents: number
    collectedCashCents: number
    outstandingReceivablesCents: number
    refundsCents: number
    discountCents: number
    operatingExpensesCents: number
    expensePaymentsCents: number
    netOperatingResultCents: number
    completionRate: number
    cancellationRate: number
    noShowRate: number
    revenueComparison: ReportPeriodComparison
    collectionsComparison: ReportPeriodComparison
    expensesComparison: ReportPeriodComparison
    operatingResultComparison: ReportPeriodComparison
    appointmentsComparison: CountPeriodComparison
  }
  trend: Array<{ label: string; date: string; billedRevenueCents: number; collectionsCents: number; expensesCents: number; operatingResultCents: number; newPatients: number; returningPatients: number; noShows: number }>
  branches: Array<{
    branchId: string
    branchName: string
    appointments: number
    completedVisits: number
    newPatients: number
    billedRevenueCents: number
    collectionsCents: number
    outstandingReceivablesCents: number
    expensesCents: number
    noShows: number
    noShowRate: number
    inventoryPurchasesCents: number
    netOperatingResultCents: number
  }>
  revenue: {
    billedRevenueCents: number
    collectedCashCents: number
    refundsCents: number
    outstandingReceivablesCents: number
    discountCents: number
    byPaymentMethod: Array<{ method: PaymentMethod; totalCents: number }>
    invoicesByStatus: Array<{ status: InvoiceStatus; count: number; totalCents: number; balanceCents: number }>
    accountsReceivable: Array<{ invoiceNumber: string; patientName: string; branchName: string; invoiceDate: string; status: InvoiceStatus; totalCents: number; paidCents: number; balanceCents: number }>
    receivableAging: Array<{ bucket: string; count: number; balanceCents: number }>
    refundCount: number
  }
  expenses: {
    recordedExpensesCents: number
    paidExpensesCents: number
    outstandingPayablesCents: number
    byCategory: Array<{ categoryId: string; categoryName: string; totalCents: number; count: number }>
    byVendor: Array<{ vendorId: string; vendorName: string; totalCents: number; count: number }>
    details: Array<{ expenseNumber: string; branchName: string; categoryName: string; payeeName: string; expenseDate: string; status: string; totalCents: number; paidCents: number; balanceCents: number }>
    largest: Array<{ expenseNumber: string; branchName: string; categoryName: string; payeeName: string; expenseDate: string; totalCents: number }>
  }
  appointments: {
    total: number
    byStatus: Array<{ status: AppointmentStatus; count: number }>
    noShowsByBranch: Array<{ branchId: string; branchName: string; count: number }>
    noShowsByProvider: Array<{ providerId: string; providerName: string; count: number; rate: number }>
    busiestDays: Array<{ day: string; count: number }>
    busiestHours: Array<{ hour: string; count: number }>
    heatmap: Array<{ day: string; hour: string; count: number }>
    details: Array<{ appointmentNumber: string; patientName: string; branchName: string; providerName: string; serviceName: string; date: string; time: string; bookingSource: string; status: AppointmentStatus; createdDate: string; completedDate: string }>
  }
  patients: {
    totalPatients: number
    newPatients: number
    returningPatients: number
    patientsSeen: number
    activePatients: number
    byOrigin: Array<{ origin: string; count: number }>
    growthTrend: Array<{ label: string; date: string; newPatients: number; returningPatients: number }>
  }
  providers: Array<{ providerId: string; providerName: string; branchNames: string; patientsSeen: number; appointments: number; completedVisits: number; treatments: number; collectionsCents: number; billedRevenueCents: number; averageTreatmentValueCents: number; noShows: number; noShowRate: number }>
  treatments: Array<{ serviceId: string; serviceName: string; performedCount: number; plannedCount: number; billedRevenueCents: number; collectionsCents: number; averageServiceValueCents: number; revenueShare: number }>
  inventory: {
    activeItems: number
    lowStockItems: number
    outOfStockItems: number
    expiringSoon: number
    inventoryValuationCents: number
    stockRows: Array<{ itemId: string; itemName: string; branchName: string; categoryName: string; quantityOnHand: number; reorderLevel: number; status: string; valuationCents: number }>
    movementCount: number
    consumption: Array<{ itemId: string; itemName: string; branchName: string; quantity: number }>
    purchaseTotalCents: number
    purchaseOrders: Array<{ poNumber: string; branchName: string; supplierName: string; orderDate: string; status: string; totalCents: number }>
    supplierTotals: Array<{ supplierId: string; supplierName: string; totalCents: number; receipts: number; averageReceiptCents: number; lastPurchaseDate: string }>
  }
  dataQuality: Array<{ severity: 'review' | 'warning'; area: string; count: number; message: string }>
  insights: Array<{ tone: 'positive' | 'neutral' | 'warning'; title: string; detail: string }>
}

type ReportInput = {
  patients?: Patient[]
  appointments?: Appointment[]
  invoices?: Invoice[]
  payments?: Payment[]
  services?: Service[]
}

type EnterpriseReportInput = ReportInput & {
  filters?: Partial<ReportingFilters>
  branches?: Branch[]
  providers?: Provider[]
  providerBranchAssignments?: ProviderBranchAssignment[]
  treatments?: Treatment[]
  charges?: Charge[]
  refunds?: Refund[]
  expenses?: Expense[]
  expensePayments?: ExpensePayment[]
  expenseCategories?: ExpenseCategory[]
  expenseVendors?: ExpenseVendor[]
  inventoryItems?: InventoryItem[]
  inventoryCategories?: InventoryCategory[]
  branchInventory?: BranchInventory[]
  stockMovements?: StockMovement[]
  suppliers?: Supplier[]
  purchaseOrders?: PurchaseOrder[]
  purchaseReceipts?: PurchaseReceipt[]
}

export function formatReportCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00+08:00`)
  next.setDate(next.getDate() + days)
  return next.toISOString().slice(0, 10)
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`
}

export function getReportingDatePresetRange(preset: DateRangePreset, baseDate = todayManila()) {
  const base = new Date(`${baseDate}T00:00:00+08:00`)
  const year = base.getFullYear()
  const month = base.getMonth()
  const day = base.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const asIso = (value: Date) => value.toISOString().slice(0, 10)

  if (preset === 'today') return { startDate: baseDate, endDate: baseDate }
  if (preset === 'yesterday') {
    const yesterday = addDays(baseDate, -1)
    return { startDate: yesterday, endDate: yesterday }
  }
  if (preset === 'this_week') return { startDate: addDays(baseDate, mondayOffset), endDate: baseDate }
  if (preset === 'last_7_days') return { startDate: addDays(baseDate, -6), endDate: baseDate }
  if (preset === 'this_month') return { startDate: monthStart(baseDate), endDate: baseDate }
  if (preset === 'last_month') {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0)
    return { startDate: asIso(start), endDate: asIso(end) }
  }
  if (preset === 'last_30_days') return { startDate: addDays(baseDate, -29), endDate: baseDate }
  if (preset === 'this_quarter') {
    const quarterMonth = Math.floor(month / 3) * 3
    return { startDate: asIso(new Date(year, quarterMonth, 1)), endDate: baseDate }
  }
  if (preset === 'this_year') return { startDate: `${year}-01-01`, endDate: baseDate }
  return { startDate: monthStart(baseDate), endDate: baseDate }
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const groupKey = key(item)
    acc[groupKey] = acc[groupKey] ?? []
    acc[groupKey].push(item)
    return acc
  }, {})
}

function sumBy<T>(items: T[], amount: (item: T) => number) {
  return items.reduce((sum, item) => sum + amount(item), 0)
}

function inRange(date: string | undefined, filters: ReportingFilters) {
  if (!date) return false
  return date.slice(0, 10) >= filters.startDate && date.slice(0, 10) <= filters.endDate
}

function isBranchAllowed(branchId: string | undefined, filters: ReportingFilters) {
  if (!branchId) return filters.branchId === 'all' || !filters.branchId
  const authorized = filters.authorizedBranchIds?.length ? filters.authorizedBranchIds : undefined
  if (authorized && !authorized.includes(branchId)) return false
  return !filters.branchId || filters.branchId === 'all' || filters.branchId === branchId
}

function patientName(patient?: Patient) {
  if (!patient) return 'Unknown patient'
  return patient.fullName || [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')
}

function branchName(branches: Branch[], branchId?: string) {
  if (!branchId) return 'Unassigned'
  if (branchId === 'clinic_wide') return 'Clinic-wide'
  return branches.find((branch) => branch.id === branchId)?.name ?? branchId
}

function providerName(providers: Provider[], providerId?: string) {
  if (!providerId) return 'Unassigned'
  return providers.find((provider) => provider.id === providerId)?.displayName ?? providerId
}

function serviceName(services: Service[], serviceId?: string, fallback = 'Unknown service') {
  if (!serviceId) return fallback
  return services.find((service) => service.id === serviceId)?.name ?? fallback
}

function compare(current: number, previous: number): ReportPeriodComparison {
  return {
    currentCents: current,
    previousCents: previous,
    changePercent: previous === 0 ? null : ((current - previous) / previous) * 100,
  }
}

function compareCount(current: number, previous: number): CountPeriodComparison {
  return {
    current,
    previous,
    changePercent: previous === 0 ? null : ((current - previous) / previous) * 100,
  }
}

function immediatelyPrevious(filters: ReportingFilters) {
  const start = new Date(`${filters.startDate}T00:00:00+08:00`)
  const end = new Date(`${filters.endDate}T00:00:00+08:00`)
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  return { ...filters, startDate: addDays(filters.startDate, -days), endDate: addDays(filters.startDate, -1) }
}

function dateSeries(filters: ReportingFilters) {
  const start = new Date(`${filters.startDate}T00:00:00+08:00`)
  const end = new Date(`${filters.endDate}T00:00:00+08:00`)
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  return Array.from({ length: Math.min(days, 60) }, (_, index) => {
    const date = addDays(filters.startDate, Math.floor((index * days) / Math.min(days, 60)))
    return { date, label: days > 45 ? date.slice(5) : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
  })
}

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dayLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00+08:00`)
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : dayLabels[parsed.getDay()]
}

function hourLabel(time: string) {
  const hour = Number(time.slice(0, 2))
  if (!Number.isFinite(hour)) return 'Unknown'
  const hour12 = hour % 12 || 12
  return `${hour12} ${hour < 12 ? 'AM' : 'PM'}`
}

function agingBucket(invoice: Invoice, baseDate: string) {
  const dueDate = invoice.dueDate || invoice.invoiceDate
  const due = new Date(`${dueDate}T00:00:00+08:00`).getTime()
  const base = new Date(`${baseDate}T00:00:00+08:00`).getTime()
  if (Number.isNaN(due) || Number.isNaN(base)) return 'Unclassified'
  const age = Math.floor((base - due) / 86400000)
  if (age <= 0) return 'Current'
  if (age <= 30) return '1-30 days'
  if (age <= 60) return '31-60 days'
  if (age <= 90) return '61-90 days'
  return '90+ days'
}

export function buildReportSnapshot({
  patients = getStoredPatients(),
  appointments = getStoredAppointments(),
  invoices = getStoredInvoices(),
  payments = getStoredPayments(),
  services = getStoredServices(),
}: ReportInput = {}): ReportSnapshot {
  const now = new Date()
  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  const completedPayments = payments.filter((payment) => ['completed', 'partially_refunded', 'refunded'].includes(payment.status))
  const dailyTotal = sumBy(completedPayments.filter((payment) => payment.date === today), (payment) => payment.amountCents)
  const weeklyTotal = sumBy(completedPayments.filter((payment) => payment.date >= weekStart && payment.date <= today), (payment) => payment.amountCents)
  const monthlyTotal = sumBy(completedPayments.filter((payment) => payment.date >= monthStartDate && payment.date <= today), (payment) => payment.amountCents)
  const outstandingBalance = sumBy(invoices.filter((invoice) => invoice.status !== 'void'), (invoice) => invoice.balanceCents)
  const paymentMethods = Object.entries(groupBy(completedPayments, (payment) => payment.paymentMethod))
    .map(([method, rows]) => ({ method: method as PaymentMethod, total: sumBy(rows, (payment) => payment.amountCents) }))
    .sort((a, b) => b.total - a.total)
  const topRequested = Object.entries(groupBy(appointments, (appointment) => appointment.serviceId))
    .map(([serviceId, rows]) => {
      const service = services.find((entry) => entry.id === serviceId)
      return { serviceId, name: service?.name ?? 'Unknown service', count: rows.length, revenue: (service?.price ?? 0) * rows.length }
    })
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
    .slice(0, 5)

  return {
    revenue: { dailyTotal, weeklyTotal, monthlyTotal, outstandingBalance, paymentMethods },
    patients: {
      total: patients.length,
      newThisMonth: patients.filter((patient) => patient.registrationDate >= monthStartDate).length,
      returning: patients.filter((patient) => patient.registrationDate < monthStartDate).length,
    },
    appointments: {
      statusCounts: appointments.reduce<Record<'completed' | 'cancelled' | 'no_show' | 'pending', number>>((counts, appointment) => {
        if (appointment.status === 'completed' || appointment.status === 'cancelled' || appointment.status === 'no_show' || appointment.status === 'pending') counts[appointment.status] += 1
        return counts
      }, { completed: 0, cancelled: 0, no_show: 0, pending: 0 }),
    },
    services: { topRequested },
  }
}

export function buildEnterpriseReportSnapshot(input: EnterpriseReportInput = {}): EnterpriseReportSnapshot {
  const presetRange = getReportingDatePresetRange(input.filters?.preset ?? 'this_month')
  const filters: ReportingFilters = {
    preset: input.filters?.preset ?? 'this_month',
    startDate: input.filters?.startDate ?? presetRange.startDate,
    endDate: input.filters?.endDate ?? presetRange.endDate,
    branchId: input.filters?.branchId ?? 'all',
    ...input.filters,
  }
  const branches = input.branches ?? getStoredBranches()
  const providers = input.providers ?? getStoredProviders()
  const providerBranchAssignments = input.providerBranchAssignments ?? getProviderBranchAssignments()
  const patients = input.patients ?? getStoredPatients()
  const services = input.services ?? getStoredServices()
  const rawInvoices = input.invoices ?? getStoredInvoices()
  const invoiceMap = new Map(rawInvoices.map((invoice) => [invoice.id, invoice]))
  const patientMap = new Map(patients.map((patient) => [patient.id, patient]))
  const appointments = (input.appointments ?? getStoredAppointments()).filter((appointment) => (
    inRange(appointment.date, filters)
    && isBranchAllowed(appointment.branchId, filters)
    && (!filters.providerId || filters.providerId === 'all' || appointment.providerId === filters.providerId)
    && (!filters.serviceId || filters.serviceId === 'all' || appointment.serviceId === filters.serviceId)
    && (!filters.appointmentStatus || filters.appointmentStatus === 'all' || appointment.status === filters.appointmentStatus)
    && (!filters.patientId || filters.patientId === 'all' || appointment.patientId === filters.patientId)
  ))
  const invoices = rawInvoices.filter((invoice) => (
    inRange(invoice.invoiceDate, filters)
    && invoice.status !== 'void'
    && isBranchAllowed(invoice.branchId ?? invoice.items.find((item) => item.branchId)?.branchId, filters)
    && (!filters.invoiceStatus || filters.invoiceStatus === 'all' || invoice.status === filters.invoiceStatus)
    && (!filters.patientId || filters.patientId === 'all' || invoice.patientId === filters.patientId)
  ))
  const payments = (input.payments ?? getStoredPayments()).filter((payment) => {
    const invoice = invoiceMap.get(payment.invoiceId)
    return inRange(payment.date, filters)
      && ['completed', 'partially_refunded', 'refunded'].includes(payment.status)
      && isBranchAllowed(payment.branchId ?? invoice?.branchId, filters)
      && (!filters.paymentMethod || filters.paymentMethod === 'all' || payment.paymentMethod === filters.paymentMethod)
      && (!filters.patientId || filters.patientId === 'all' || payment.patientId === filters.patientId)
  })
  const refunds = (input.refunds ?? getStoredRefunds()).filter((refund) => inRange(refund.processedAt, filters) && refund.status === 'completed' && isBranchAllowed(refund.branchId, filters))
  const charges = (input.charges ?? getStoredCharges()).filter((charge) => inRange(charge.createdAt, filters) && charge.status !== 'void' && isBranchAllowed(charge.branchId, filters))
  const treatments = (input.treatments ?? getStoredTreatments()).filter((treatment) => (
    inRange(treatment.treatmentDate, filters)
    && isBranchAllowed(treatment.branchId, filters)
    && (!filters.providerId || filters.providerId === 'all' || treatment.providerId === filters.providerId)
    && (!filters.serviceId || filters.serviceId === 'all' || treatment.serviceId === filters.serviceId)
    && (!filters.treatmentStatus || filters.treatmentStatus === 'all' || treatment.status === filters.treatmentStatus)
  ))
  const expenses = (input.expenses ?? getExpenses()).filter((expense) => (
    inRange(expense.expenseDate, filters)
    && expense.status !== 'void'
    && expense.status !== 'cancelled'
    && isBranchAllowed(expense.scope === 'clinic_wide' ? 'clinic_wide' : expense.branchId, filters)
    && (!filters.expenseCategoryId || filters.expenseCategoryId === 'all' || expense.categoryId === filters.expenseCategoryId)
    && (!filters.vendorId || filters.vendorId === 'all' || expense.vendorId === filters.vendorId)
  ))
  const expensePayments = (input.expensePayments ?? getExpensePayments()).filter((payment) => inRange(payment.paymentDate, filters) && expenses.some((expense) => expense.id === payment.expenseId))
  const items = input.inventoryItems ?? getInventoryItems()
  const inventoryCategories = input.inventoryCategories ?? getInventoryCategories()
  const branchInventory = (input.branchInventory ?? getBranchInventory()).filter((stock) => isBranchAllowed(stock.branchId, filters))
  const stockMovements = (input.stockMovements ?? getStockMovements()).filter((movement) => inRange(movement.createdAt, filters) && isBranchAllowed(movement.branchId, filters))
  const purchaseOrders = (input.purchaseOrders ?? getPurchaseOrders()).filter((order) => inRange(order.orderDate, filters) && isBranchAllowed(order.branchId, filters) && (!filters.supplierId || filters.supplierId === 'all' || order.supplierId === filters.supplierId))
  const purchaseReceipts = (input.purchaseReceipts ?? getPurchaseReceipts()).filter((receipt) => inRange(receipt.receivedDate, filters) && isBranchAllowed(receipt.branchId, filters) && (!filters.supplierId || filters.supplierId === 'all' || receipt.supplierId === filters.supplierId))
  const suppliers = input.suppliers ?? getSuppliers()
  const expenseCategories = input.expenseCategories ?? getExpenseCategories()
  const expenseVendors = input.expenseVendors ?? getExpenseVendors()

  const billedRevenueCents = sumBy(invoices, (invoice) => invoice.totalCents)
  const collectedCashCents = sumBy(payments, (payment) => payment.amountCents)
  const refundsCents = sumBy(refunds, (refund) => refund.amountCents)
  const discountCents = sumBy(invoices, (invoice) => invoice.discountCents ?? 0)
  const outstandingReceivablesCents = sumBy(invoices, (invoice) => invoice.balanceCents)
  const operatingExpensesCents = sumBy(expenses, (expense) => expense.totalCents)
  const expensePaymentsCents = sumBy(expensePayments, (payment) => payment.amountCents)
  const completedVisits = appointments.filter((appointment) => appointment.status === 'completed').length
  const cancelledCount = appointments.filter((appointment) => appointment.status === 'cancelled').length
  const noShowCount = appointments.filter((appointment) => appointment.status === 'no_show').length
  const previous = immediatelyPrevious(filters)
  const previousInvoices = rawInvoices.filter((invoice) => inRange(invoice.invoiceDate, previous) && invoice.status !== 'void' && isBranchAllowed(invoice.branchId ?? invoice.items.find((item) => item.branchId)?.branchId, previous))
  const previousAppointments = (input.appointments ?? getStoredAppointments()).filter((appointment) => inRange(appointment.date, previous) && isBranchAllowed(appointment.branchId, previous))
  const previousRevenue = sumBy(previousInvoices, (invoice) => invoice.totalCents)
  const previousCollections = sumBy((input.payments ?? getStoredPayments()).filter((payment) => inRange(payment.date, previous) && ['completed', 'partially_refunded', 'refunded'].includes(payment.status) && isBranchAllowed(payment.branchId ?? invoiceMap.get(payment.invoiceId)?.branchId, previous)), (payment) => payment.amountCents)
  const previousExpenses = sumBy((input.expenses ?? getExpenses()).filter((expense) => inRange(expense.expenseDate, previous) && expense.status !== 'void' && expense.status !== 'cancelled' && isBranchAllowed(expense.scope === 'clinic_wide' ? 'clinic_wide' : expense.branchId, previous)), (expense) => expense.totalCents)
  const previousOperatingResult = previousCollections - previousExpenses
  const patientIdsSeen = new Set(appointments.filter((appointment) => appointment.status === 'completed').map((appointment) => appointment.patientId))
  const priorCompletedPatientIds = new Set((input.appointments ?? getStoredAppointments()).filter((appointment) => appointment.status === 'completed' && appointment.date < filters.startDate).map((appointment) => appointment.patientId))
  const newSeenPatientIds = new Set([...patientIdsSeen].filter((patientId) => !priorCompletedPatientIds.has(patientId)))
  const returningSeenPatientIds = new Set([...patientIdsSeen].filter((patientId) => priorCompletedPatientIds.has(patientId)))
  const inventoryOverview = getInventoryOverview(filters.branchId === 'all' ? undefined : filters.branchId)

  const stockRows = branchInventory
    .map((stock) => {
      const item = items.find((entry) => entry.id === stock.itemId)
      const status = stock.quantityOnHand <= 0 ? 'out_of_stock' : stock.quantityOnHand <= stock.reorderLevel ? 'low_stock' : 'in_stock'
      return {
        itemId: stock.itemId,
        itemName: item?.name ?? stock.itemId,
        branchName: branchName(branches, stock.branchId),
        categoryName: inventoryCategories.find((category) => category.id === item?.categoryId)?.name ?? item?.categoryId ?? 'Uncategorized',
        quantityOnHand: stock.quantityOnHand,
        reorderLevel: stock.reorderLevel,
        status,
        valuationCents: stock.quantityOnHand * stock.averageUnitCostCents,
      }
    })
    .filter((row) => {
      if (!filters.inventoryCategoryId || filters.inventoryCategoryId === 'all') return true
      return items.find((item) => item.id === row.itemId)?.categoryId === filters.inventoryCategoryId
    })
    .filter((row) => !filters.stockStatus || filters.stockStatus === 'all' || row.status === filters.stockStatus)

  const appointmentDenominator = appointments.filter((appointment) => ['confirmed', 'checked_in', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(appointment.status)).length
  const trend = dateSeries(filters).map((entry) => {
    const dateAppointments = appointments.filter((appointment) => appointment.date === entry.date)
    const dateCompletedPatientIds = new Set(dateAppointments.filter((appointment) => appointment.status === 'completed').map((appointment) => appointment.patientId))
    const dateNewPatients = [...dateCompletedPatientIds].filter((patientId) => !priorCompletedPatientIds.has(patientId)).length
    const dateReturningPatients = [...dateCompletedPatientIds].filter((patientId) => priorCompletedPatientIds.has(patientId)).length
    const entryBilled = sumBy(invoices.filter((invoice) => invoice.invoiceDate === entry.date), (invoice) => invoice.totalCents)
    const entryCollections = sumBy(payments.filter((payment) => payment.date === entry.date), (payment) => payment.amountCents)
    const entryExpenses = sumBy(expenses.filter((expense) => expense.expenseDate === entry.date), (expense) => expense.totalCents)
    return {
      ...entry,
      billedRevenueCents: entryBilled,
      collectionsCents: entryCollections,
      expensesCents: entryExpenses,
      operatingResultCents: entryCollections - entryExpenses,
      newPatients: dateNewPatients,
      returningPatients: dateReturningPatients,
      noShows: dateAppointments.filter((appointment) => appointment.status === 'no_show').length,
    }
  })
  const noShowsByProvider = providers.map((provider) => {
    const providerAppointments = appointments.filter((appointment) => appointment.providerId === provider.id)
    const providerEligible = providerAppointments.filter((appointment) => ['confirmed', 'checked_in', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(appointment.status)).length
    const count = providerAppointments.filter((appointment) => appointment.status === 'no_show').length
    return { providerId: provider.id, providerName: provider.displayName, count, rate: providerEligible ? count / providerEligible : 0 }
  }).filter((provider) => provider.count > 0).sort((a, b) => b.count - a.count || b.rate - a.rate)
  const busiestDays = dayLabels.map((day) => ({ day, count: appointments.filter((appointment) => dayLabel(appointment.date) === day).length }))
  const hourGroups = Object.entries(groupBy(appointments, (appointment) => hourLabel(appointment.startTime))).map(([hour, rows]) => ({ hour, count: rows.length }))
    .sort((a, b) => {
      const hourA = Number(a.hour.split(' ')[0]) % 12 + (a.hour.endsWith('PM') ? 12 : 0)
      const hourB = Number(b.hour.split(' ')[0]) % 12 + (b.hour.endsWith('PM') ? 12 : 0)
      return hourA - hourB
    })
  const heatmap = dayLabels.flatMap((day) => hourGroups.map((hour) => ({
    day,
    hour: hour.hour,
    count: appointments.filter((appointment) => dayLabel(appointment.date) === day && hourLabel(appointment.startTime) === hour.hour).length,
  })))
  const accountReceivableRows = invoices.filter((invoice) => invoice.balanceCents > 0).map((invoice) => ({
    invoiceNumber: invoice.invoiceNumber,
    patientName: patientName(patientMap.get(invoice.patientId)),
    branchName: branchName(branches, invoice.branchId),
    invoiceDate: invoice.invoiceDate,
    status: invoice.status,
    totalCents: invoice.totalCents,
    paidCents: invoice.amountPaidCents,
    balanceCents: invoice.balanceCents,
  })).sort((a, b) => b.balanceCents - a.balanceCents)
  const receivableAging = Object.entries(groupBy(invoices.filter((invoice) => invoice.balanceCents > 0), (invoice) => agingBucket(invoice, filters.endDate)))
    .map(([bucket, rows]) => ({ bucket, count: rows.length, balanceCents: sumBy(rows, (invoice) => invoice.balanceCents) }))
  const expenseDetails = expenses.map((expense) => ({
    expenseNumber: expense.expenseNumber,
    branchName: expense.scope === 'clinic_wide' ? 'Clinic-wide' : branchName(branches, expense.branchId),
    categoryName: expenseCategories.find((category) => category.id === expense.categoryId)?.name ?? expense.categoryId,
    payeeName: expense.payeeName,
    expenseDate: expense.expenseDate,
    status: expense.status,
    totalCents: expense.totalCents,
    paidCents: expense.amountPaidCents,
    balanceCents: expense.balanceCents,
  }))
  const treatmentGroups = Object.entries(groupBy(treatments, (treatment) => treatment.serviceId)).map(([serviceId, rows]) => {
    const relatedCharges = charges.filter((charge) => charge.serviceId === serviceId)
    const relatedInvoiceIds = new Set(invoices.filter((invoice) => invoice.items.some((item) => item.serviceId === serviceId)).map((invoice) => invoice.id))
    const performedCount = rows.filter((treatment) => treatment.status === 'completed').length
    const treatmentRevenue = sumBy(relatedCharges, (charge) => charge.finalAmountCents)
    return {
      serviceId,
      serviceName: serviceName(services, serviceId, rows[0]?.serviceNameSnapshot ?? 'Unknown service'),
      performedCount,
      plannedCount: rows.filter((treatment) => treatment.status !== 'completed' && treatment.status !== 'voided').length,
      billedRevenueCents: treatmentRevenue,
      collectionsCents: sumBy(payments.filter((payment) => relatedInvoiceIds.has(payment.invoiceId)), (payment) => payment.amountCents),
      averageServiceValueCents: performedCount ? Math.round(treatmentRevenue / performedCount) : 0,
      revenueShare: billedRevenueCents ? treatmentRevenue / billedRevenueCents : 0,
    }
  }).sort((a, b) => b.billedRevenueCents - a.billedRevenueCents || b.performedCount - a.performedCount)
  const dataQuality = [
    { severity: 'review' as const, area: 'Billing', count: invoices.filter((invoice) => !invoice.branchId && !invoice.items.some((item) => item.branchId)).length, message: 'Invoices without branch context may affect branch reconciliation.' },
    { severity: 'review' as const, area: 'Payments', count: payments.filter((payment) => !payment.branchId && !invoiceMap.get(payment.invoiceId)?.branchId).length, message: 'Payments without branch context need review before branch reporting.' },
    { severity: 'review' as const, area: 'Clinical', count: treatments.filter((treatment) => !treatment.providerId).length, message: 'Treatments without provider attribution affect provider performance.' },
    { severity: 'warning' as const, area: 'Expenses', count: expenses.filter((expense) => !expense.categoryId).length, message: 'Expenses without categories reduce expense analytics quality.' },
  ].filter((issue) => issue.count > 0)
  const bestBranch = [...branches.filter((branch) => branch.status === 'active').map((branch) => {
    const matched = branches.find((entry) => entry.id === branch.id)
    return { branchName: matched?.name ?? branch.name, collectionsCents: sumBy(payments.filter((payment) => payment.branchId === branch.id || invoiceMap.get(payment.invoiceId)?.branchId === branch.id), (payment) => payment.amountCents) }
  })].sort((a, b) => b.collectionsCents - a.collectionsCents)[0]
  const insights = [
    {
      tone: (compare(collectedCashCents, previousCollections).changePercent ?? 0) >= 0 ? 'positive' as const : 'warning' as const,
      title: 'Collections movement',
      detail: compare(collectedCashCents, previousCollections).changePercent === null ? 'No previous-period collections available for comparison.' : `Collections changed ${compare(collectedCashCents, previousCollections).changePercent!.toFixed(1)}% against the previous equivalent period.`,
    },
    bestBranch && bestBranch.collectionsCents > 0 ? {
      tone: 'neutral' as const,
      title: 'Branch collection leader',
      detail: `${bestBranch.branchName} recorded the highest collections in this filter context.`,
    } : null,
    treatmentGroups[0] ? {
      tone: 'neutral' as const,
      title: 'Top service',
      detail: `${treatmentGroups[0].serviceName} leads service revenue for the selected period.`,
    } : null,
    noShowCount > 0 ? {
      tone: 'warning' as const,
      title: 'No-show review',
      detail: `${noShowCount} no-show appointment${noShowCount === 1 ? '' : 's'} need schedule and reminder review.`,
    } : null,
  ].filter((insight): insight is { tone: 'positive' | 'neutral' | 'warning'; title: string; detail: string } => Boolean(insight))

  return {
    filters,
    executive: {
      appointments: appointments.length,
      completedVisits,
      uniquePatientsSeen: patientIdsSeen.size,
      newPatients: newSeenPatientIds.size,
      returningPatients: returningSeenPatientIds.size,
      activePatients: patients.filter((patient) => patient.status === 'active' && isBranchAllowed(patient.preferredBranchId, filters)).length,
      billedRevenueCents,
      collectedCashCents,
      outstandingReceivablesCents,
      refundsCents,
      discountCents,
      operatingExpensesCents,
      expensePaymentsCents,
      netOperatingResultCents: collectedCashCents - operatingExpensesCents,
      completionRate: appointmentDenominator ? completedVisits / appointmentDenominator : 0,
      cancellationRate: appointmentDenominator ? cancelledCount / appointmentDenominator : 0,
      noShowRate: appointmentDenominator ? noShowCount / appointmentDenominator : 0,
      revenueComparison: compare(billedRevenueCents, previousRevenue),
      collectionsComparison: compare(collectedCashCents, previousCollections),
      expensesComparison: compare(operatingExpensesCents, previousExpenses),
      operatingResultComparison: compare(collectedCashCents - operatingExpensesCents, previousOperatingResult),
      appointmentsComparison: compareCount(appointments.length, previousAppointments.length),
    },
    trend,
    branches: branches.filter((branch) => branch.status === 'active' && isBranchAllowed(branch.id, filters)).map((branch) => {
      const branchAppointments = appointments.filter((appointment) => appointment.branchId === branch.id)
      const branchInvoices = invoices.filter((invoice) => (invoice.branchId ?? invoice.items.find((item) => item.branchId)?.branchId) === branch.id)
      const branchPayments = payments.filter((payment) => (payment.branchId ?? invoiceMap.get(payment.invoiceId)?.branchId) === branch.id)
      const branchExpenses = expenses.filter((expense) => expense.branchId === branch.id)
      const branchReceipts = purchaseReceipts.filter((receipt) => receipt.branchId === branch.id)
      const collectionsCents = sumBy(branchPayments, (payment) => payment.amountCents)
      const expensesCents = sumBy(branchExpenses, (expense) => expense.totalCents)
      return {
        branchId: branch.id,
        branchName: branch.name,
        appointments: branchAppointments.length,
        completedVisits: branchAppointments.filter((appointment) => appointment.status === 'completed').length,
        newPatients: patients.filter((patient) => patient.preferredBranchId === branch.id && inRange(patient.registrationDate, filters)).length,
        billedRevenueCents: sumBy(branchInvoices, (invoice) => invoice.totalCents),
        collectionsCents,
        outstandingReceivablesCents: sumBy(branchInvoices, (invoice) => invoice.balanceCents),
        expensesCents,
        noShows: branchAppointments.filter((appointment) => appointment.status === 'no_show').length,
        noShowRate: branchAppointments.length ? branchAppointments.filter((appointment) => appointment.status === 'no_show').length / branchAppointments.length : 0,
        inventoryPurchasesCents: sumBy(branchReceipts, (receipt) => receipt.totalCostCents),
        netOperatingResultCents: collectionsCents - expensesCents,
      }
    }),
    revenue: {
      billedRevenueCents,
      collectedCashCents,
      refundsCents,
      outstandingReceivablesCents,
      discountCents,
      byPaymentMethod: Object.entries(groupBy(payments, (payment) => payment.paymentMethod)).map(([method, rows]) => ({ method: method as PaymentMethod, totalCents: sumBy(rows, (payment) => payment.amountCents) })).sort((a, b) => b.totalCents - a.totalCents),
      invoicesByStatus: Object.entries(groupBy(invoices, (invoice) => invoice.status)).map(([status, rows]) => ({ status: status as InvoiceStatus, count: rows.length, totalCents: sumBy(rows, (invoice) => invoice.totalCents), balanceCents: sumBy(rows, (invoice) => invoice.balanceCents) })),
      accountsReceivable: accountReceivableRows,
      receivableAging,
      refundCount: refunds.length,
    },
    expenses: {
      recordedExpensesCents: operatingExpensesCents,
      paidExpensesCents: expensePaymentsCents,
      outstandingPayablesCents: sumBy(expenses, (expense) => expense.balanceCents),
      byCategory: Object.entries(groupBy(expenses, (expense) => expense.categoryId)).map(([categoryId, rows]) => ({ categoryId, categoryName: expenseCategories.find((category) => category.id === categoryId)?.name ?? categoryId, totalCents: sumBy(rows, (expense) => expense.totalCents), count: rows.length })).sort((a, b) => b.totalCents - a.totalCents),
      byVendor: Object.entries(groupBy(expenses, (expense) => expense.vendorId ?? expense.payeeName)).map(([vendorId, rows]) => ({ vendorId, vendorName: expenseVendors.find((vendor) => vendor.id === vendorId)?.name ?? rows[0]?.payeeName ?? vendorId, totalCents: sumBy(rows, (expense) => expense.totalCents), count: rows.length })).sort((a, b) => b.totalCents - a.totalCents),
      details: expenseDetails,
      largest: [...expenseDetails].sort((a, b) => b.totalCents - a.totalCents).slice(0, 8).map((expense) => ({
        expenseNumber: expense.expenseNumber,
        branchName: expense.branchName,
        categoryName: expense.categoryName,
        payeeName: expense.payeeName,
        expenseDate: expense.expenseDate,
        totalCents: expense.totalCents,
      })),
    },
    appointments: {
      total: appointments.length,
      byStatus: Object.entries(groupBy(appointments, (appointment) => appointment.status)).map(([status, rows]) => ({ status: status as AppointmentStatus, count: rows.length })),
      noShowsByBranch: Object.entries(groupBy(appointments.filter((appointment) => appointment.status === 'no_show'), (appointment) => appointment.branchId ?? 'unassigned')).map(([branchId, rows]) => ({ branchId, branchName: branchName(branches, branchId), count: rows.length })),
      noShowsByProvider,
      busiestDays,
      busiestHours: hourGroups,
      heatmap,
      details: appointments.map((appointment) => ({
        appointmentNumber: appointment.appointmentNumber ?? appointment.id,
        patientName: patientName(patientMap.get(appointment.patientId)),
        branchName: branchName(branches, appointment.branchId),
        providerName: providerName(providers, appointment.providerId),
        serviceName: serviceName(services, appointment.serviceId),
        date: appointment.date,
        time: `${appointment.startTime} - ${appointment.endTime}`,
        bookingSource: appointment.bookingSource ?? 'staff_entry',
        status: appointment.status,
        createdDate: appointment.createdAt.slice(0, 10),
        completedDate: appointment.completedAt?.slice(0, 10) ?? '',
      })),
    },
    patients: {
      totalPatients: patients.filter((patient) => isBranchAllowed(patient.preferredBranchId, filters)).length,
      newPatients: patients.filter((patient) => inRange(patient.registrationDate, filters) && isBranchAllowed(patient.preferredBranchId, filters)).length,
      returningPatients: patients.filter((patient) => patient.registrationDate < filters.startDate && isBranchAllowed(patient.preferredBranchId, filters)).length,
      patientsSeen: patientIdsSeen.size,
      activePatients: patients.filter((patient) => patient.status === 'active' && isBranchAllowed(patient.preferredBranchId, filters)).length,
      byOrigin: Object.entries(groupBy(patients.filter((patient) => inRange(patient.registrationDate, filters)), (patient) => patient.origin ?? 'staff_created')).map(([origin, rows]) => ({ origin, count: rows.length })),
      growthTrend: trend.map((entry) => ({ label: entry.label, date: entry.date, newPatients: entry.newPatients, returningPatients: entry.returningPatients })),
    },
    providers: providers.map((provider) => {
      const providerAppointments = appointments.filter((appointment) => appointment.providerId === provider.id)
      const providerTreatments = treatments.filter((treatment) => treatment.providerId === provider.id)
      const providerCharges = charges.filter((charge) => charge.providerId === provider.id)
      const providerPayments = payments.filter((payment) => invoiceMap.get(payment.invoiceId)?.items.some((item) => item.providerId === provider.id))
      const providerPatientIds = new Set(providerAppointments.filter((appointment) => appointment.status === 'completed').map((appointment) => appointment.patientId))
      const providerEligible = providerAppointments.filter((appointment) => ['confirmed', 'checked_in', 'waiting', 'in_progress', 'completed', 'cancelled', 'no_show'].includes(appointment.status)).length
      const providerRevenue = sumBy(providerCharges, (charge) => charge.finalAmountCents)
      return {
        providerId: provider.id,
        providerName: provider.displayName,
        branchNames: providerBranchAssignments.filter((assignment) => assignment.providerId === provider.id && assignment.status === 'active').map((assignment) => branchName(branches, assignment.branchId)).join(', ') || 'Unassigned',
        patientsSeen: providerPatientIds.size,
        appointments: providerAppointments.length,
        completedVisits: providerAppointments.filter((appointment) => appointment.status === 'completed').length,
        treatments: providerTreatments.length,
        collectionsCents: sumBy(providerPayments, (payment) => payment.amountCents),
        billedRevenueCents: providerRevenue,
        averageTreatmentValueCents: providerTreatments.length ? Math.round(providerRevenue / providerTreatments.length) : 0,
        noShows: providerAppointments.filter((appointment) => appointment.status === 'no_show').length,
        noShowRate: providerEligible ? providerAppointments.filter((appointment) => appointment.status === 'no_show').length / providerEligible : 0,
      }
    }).filter((provider) => provider.appointments || provider.treatments || provider.collectionsCents || provider.billedRevenueCents),
    treatments: treatmentGroups,
    inventory: {
      activeItems: inventoryOverview.totalActiveItems,
      lowStockItems: stockRows.filter((stock) => stock.status === 'low_stock').length,
      outOfStockItems: stockRows.filter((stock) => stock.status === 'out_of_stock').length,
      expiringSoon: inventoryOverview.expiringSoon,
      inventoryValuationCents: filters.branchId === 'all' ? getInventoryValuation() : getInventoryValuation(filters.branchId),
      stockRows,
      movementCount: stockMovements.length,
      consumption: Object.entries(groupBy(stockMovements.filter((movement) => movement.movementType === 'consumption'), (movement) => `${movement.itemId}|${movement.branchId}`)).map(([key, rows]) => {
        const [itemId, branchId] = key.split('|')
        return {
          itemId,
          itemName: items.find((item) => item.id === itemId)?.name ?? itemId,
          branchName: branchName(branches, branchId),
          quantity: sumBy(rows, (movement) => Math.abs(movement.quantity)),
        }
      }).sort((a, b) => b.quantity - a.quantity),
      purchaseTotalCents: sumBy(purchaseReceipts, (receipt) => receipt.totalCostCents),
      purchaseOrders: purchaseOrders.map((order) => ({
        poNumber: order.poNumber,
        branchName: branchName(branches, order.branchId),
        supplierName: suppliers.find((supplier) => supplier.id === order.supplierId)?.name ?? order.supplierId,
        orderDate: order.orderDate,
        status: order.status,
        totalCents: order.totalCents,
      })),
      supplierTotals: Object.entries(groupBy(purchaseReceipts, (receipt) => receipt.supplierId)).map(([supplierId, rows]) => {
        const totalCents = sumBy(rows, (receipt) => receipt.totalCostCents)
        return {
          supplierId,
          supplierName: suppliers.find((supplier) => supplier.id === supplierId)?.name ?? supplierId,
          totalCents,
          receipts: rows.length,
          averageReceiptCents: rows.length ? Math.round(totalCents / rows.length) : 0,
          lastPurchaseDate: rows.map((receipt) => receipt.receivedDate).sort().at(-1) ?? '',
        }
      }).sort((a, b) => b.totalCents - a.totalCents),
    },
    dataQuality,
    insights,
  }
}

export function exportEnterpriseReportCsv(snapshot: EnterpriseReportSnapshot) {
  const rows = [
    ['Section', 'Metric', 'Value', 'Notes'],
    ['Executive', 'Billed revenue', snapshot.executive.billedRevenueCents, 'Invoice totals, not cash collected'],
    ['Executive', 'Collected cash', snapshot.executive.collectedCashCents, 'Completed payments only'],
    ['Executive', 'Outstanding receivables', snapshot.executive.outstandingReceivablesCents, 'Open invoice balances'],
    ['Executive', 'Discounts', snapshot.executive.discountCents, 'Invoice discount totals'],
    ['Executive', 'Refunds', snapshot.executive.refundsCents, `${snapshot.revenue.refundCount} completed refunds`],
    ['Executive', 'Recorded operating expenses', snapshot.executive.operatingExpensesCents, 'Expense totals'],
    ['Executive', 'Net operating result', snapshot.executive.netOperatingResultCents, 'Collections - recorded operating expenses'],
    ['Executive', 'Completed appointments', snapshot.executive.completedVisits, `${(snapshot.executive.completionRate * 100).toFixed(1)}% completion rate`],
    ['Executive', 'No-show rate', `${(snapshot.executive.noShowRate * 100).toFixed(1)}%`, 'No-shows / eligible scheduled appointments'],
    ...snapshot.branches.map((branch) => ['Branch', branch.branchName, branch.collectionsCents, `Appointments: ${branch.appointments}; Expenses: ${branch.expensesCents}`]),
    ...snapshot.appointments.busiestDays.map((day) => ['Busiest days', day.day, day.count, 'Appointment count']),
    ...snapshot.appointments.busiestHours.map((hour) => ['Busiest hours', hour.hour, hour.count, 'Appointment count']),
    ...snapshot.providers.map((provider) => ['Provider', provider.providerName, provider.billedRevenueCents, `Patients: ${provider.patientsSeen}; Completed: ${provider.completedVisits}; Treatments: ${provider.treatments}`]),
    ...snapshot.treatments.map((service) => ['Service', service.serviceName, service.billedRevenueCents, `Completed: ${service.performedCount}; Average: ${service.averageServiceValueCents}`]),
    ...snapshot.revenue.accountsReceivable.map((invoice) => ['Accounts receivable', invoice.invoiceNumber, invoice.balanceCents, invoice.patientName]),
    ...snapshot.expenses.details.map((expense) => ['Expense', expense.expenseNumber, expense.totalCents, `${expense.categoryName}; ${expense.payeeName}`]),
    ...snapshot.inventory.stockRows.map((stock) => ['Inventory', stock.itemName, stock.quantityOnHand, `${stock.branchName}; ${stock.status}`]),
    ...snapshot.dataQuality.map((issue) => ['Data quality', issue.area, issue.count, issue.message]),
  ]
  return rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')
}

export function getReportsOverview() {
  return buildEnterpriseReportSnapshot()
}

export function getRevenueReport() {
  return buildEnterpriseReportSnapshot().revenue
}

export function getPatientsReport() {
  return buildEnterpriseReportSnapshot().patients
}

export function getAppointmentsReport() {
  return buildEnterpriseReportSnapshot().appointments
}

export function getServicesReport() {
  return buildEnterpriseReportSnapshot().treatments
}
