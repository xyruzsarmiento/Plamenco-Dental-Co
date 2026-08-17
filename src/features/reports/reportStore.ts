import { getStoredAppointments } from '../appointments/appointmentStore.ts'
import type { Appointment } from '../appointments/appointmentTypes.ts'
import { getStoredInvoices, getStoredPayments } from '../billing/billingStore.ts'
import type { Invoice, Payment, PaymentMethod } from '../billing/billingStore.ts'
import { getStoredPatients } from '../patients/patientStore.ts'
import type { Patient } from '../patients/patientTypes.ts'
import { getStoredServices } from '../services/serviceStore.ts'
import type { Service } from '../services/serviceTypes.ts'

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

type ReportInput = {
  patients?: Patient[]
  appointments?: Appointment[]
  invoices?: Invoice[]
  payments?: Payment[]
  services?: Service[]
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const groupKey = key(item)
    acc[groupKey] = acc[groupKey] ?? []
    acc[groupKey].push(item)
    return acc
  }, {})
}

export function buildReportSnapshot({
  patients = getStoredPatients(),
  appointments = getStoredAppointments(),
  invoices = getStoredInvoices(),
  payments = getStoredPayments(),
  services = getStoredServices(),
}: ReportInput = {}): ReportSnapshot {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const weekStart = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  const dailyTotal = payments
    .filter((payment) => payment.date === today)
    .reduce((sum, payment) => sum + payment.amountCents, 0)
  const weeklyTotal = payments
    .filter((payment) => payment.date >= weekStart && payment.date <= today)
    .reduce((sum, payment) => sum + payment.amountCents, 0)
  const monthlyTotal = payments
    .filter((payment) => payment.date >= monthStart && payment.date <= today)
    .reduce((sum, payment) => sum + payment.amountCents, 0)

  const outstandingBalance = invoices.reduce((sum, invoice) => sum + invoice.balanceCents, 0)

  const paymentTotals = payments.reduce<Record<string, number>>((acc, payment) => {
    acc[payment.paymentMethod] = (acc[payment.paymentMethod] ?? 0) + payment.amountCents
    return acc
  }, {})

  const paymentMethods = Object.entries(paymentTotals)
    .map(([method, total]) => ({ method: method as PaymentMethod, total }))
    .sort((a, b) => b.total - a.total)

  const totalPatients = patients.length
  const newThisMonth = patients.filter((patient) => patient.registrationDate >= monthStart).length
  const returning = patients.filter((patient) => patient.registrationDate < monthStart).length

  const appointmentStatusCounts = appointments.reduce<Record<'completed' | 'cancelled' | 'no_show' | 'pending', number>>(
    (counts, appointment) => {
      const status = appointment.status
      if (status === 'completed' || status === 'cancelled' || status === 'no_show' || status === 'pending') {
        counts[status] += 1
      }
      return counts
    },
    { completed: 0, cancelled: 0, no_show: 0, pending: 0 },
  )

  const serviceUsage = groupBy(appointments, (appointment) => appointment.serviceId)

  const topRequested = Object.entries(serviceUsage)
    .map(([serviceId, usageEntries]) => {
      const service = services.find((entry) => entry.id === serviceId)
      const revenue = (service?.price ?? 0) * usageEntries.length
      return {
        serviceId,
        name: service?.name ?? 'Unknown service',
        count: usageEntries.length,
        revenue,
      }
    })
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
    .slice(0, 5)

  return {
    revenue: {
      dailyTotal,
      weeklyTotal,
      monthlyTotal,
      outstandingBalance,
      paymentMethods,
    },
    patients: {
      total: totalPatients,
      newThisMonth,
      returning,
    },
    appointments: {
      statusCounts: appointmentStatusCounts,
    },
    services: {
      topRequested,
    },
  }
}

export function getReportsOverview() {
  return buildReportSnapshot()
}

export function getRevenueReport() {
  return buildReportSnapshot().revenue
}

export function getPatientsReport() {
  return buildReportSnapshot().patients
}

export function getAppointmentsReport() {
  return buildReportSnapshot().appointments
}

export function getServicesReport() {
  return buildReportSnapshot().services
}
