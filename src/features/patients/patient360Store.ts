import { getAppointmentsByPatient, getAppointmentHistory } from '../appointments/appointmentStore'
import type { Appointment, AppointmentStatus } from '../appointments/appointmentTypes'
import {
  getInvoicesByPatient,
  getLedgerByPatient,
  getOutstandingBalanceByPatient,
  getPaymentsByPatient,
  getReceiptsByPatient,
  getRefundsByPatient,
} from '../billing/billingStore'
import { getStoredBranches } from '../branches/branchStore'
import { getCommunicationLogsByPatient } from '../communications/communicationStore'
import { getDentalRecordsByPatientId } from '../dentalRecords/dentalRecordStore'
import { getStoredProviders } from '../dentists/dentistStore'
import { getDentalImagesByPatient, getDocumentsByPatient } from '../documents/documentStore'
import { getPrescriptionsByPatient } from '../prescriptions/prescriptionStore'
import { formatAuditAction, getStoredAuditLogs } from '../security/auditLogStore'
import { getStoredServices } from '../services/serviceStore'
import { getTreatmentsByPatient } from '../treatments/treatmentStore'
import { findPotentialPatientDuplicates, getPatientDisplayName } from './patientStore'
import type { Patient } from './patientTypes'

export type Patient360Activity = {
  id: string
  date: string
  module: 'Profile' | 'Appointments' | 'Clinical' | 'Treatments' | 'Billing' | 'Documents' | 'Communications'
  label: string
  description: string
  actor?: string
}

function isActiveAppointment(status: AppointmentStatus) {
  return !['cancelled', 'no_show', 'completed', 'rejected'].includes(status)
}

function appointmentTimestamp(appointment: Appointment) {
  return `${appointment.date}T${appointment.startTime || '00:00'}:00`
}

function appointmentLabel(status: AppointmentStatus) {
  const labels: Record<AppointmentStatus, string> = {
    pending: 'Appointment requested',
    confirmed: 'Appointment confirmed',
    rejected: 'Appointment rejected',
    checked_in: 'Patient checked in',
    waiting: 'Patient moved to waiting',
    rescheduled: 'Appointment rescheduled',
    in_progress: 'Visit started',
    completed: 'Appointment completed',
    cancelled: 'Appointment cancelled',
    no_show: 'Appointment marked no show',
  }
  return labels[status]
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ')
}

export function getPatient360Summary(patient: Patient) {
  const patientId = patient.patientId
  const today = new Date().toISOString().slice(0, 10)
  const branches = getStoredBranches()
  const providers = getStoredProviders()
  const services = getStoredServices()
  const branchMap = new Map(branches.map((branch) => [branch.id, branch.name]))
  const providerMap = new Map(providers.map((provider) => [provider.id, provider.displayName]))
  const serviceMap = new Map(services.map((service) => [service.id, service.name]))

  const appointments = getAppointmentsByPatient(patientId).sort((a, b) => appointmentTimestamp(b).localeCompare(appointmentTimestamp(a)))
  const upcomingAppointments = appointments
    .filter((appointment) => appointment.date >= today && isActiveAppointment(appointment.status))
    .sort((a, b) => appointmentTimestamp(a).localeCompare(appointmentTimestamp(b)))
  const pastAppointments = appointments.filter((appointment) => appointment.date < today || !isActiveAppointment(appointment.status))
  const nextAppointment = upcomingAppointments[0]
  const lastVisit = appointments.find((appointment) => appointment.date < today || appointment.status === 'completed')

  const clinicalVisits = getDentalRecordsByPatientId(patientId)
  const treatments = getTreatmentsByPatient(patientId)
  const prescriptions = getPrescriptionsByPatient(patientId)
  const invoices = getInvoicesByPatient(patientId)
  const payments = getPaymentsByPatient(patientId)
  const receipts = getReceiptsByPatient(patientId)
  const refunds = getRefundsByPatient(patientId)
  const documents = getDocumentsByPatient(patientId)
  const dentalImages = getDentalImagesByPatient(patientId)
  const communications = getCommunicationLogsByPatient(patientId)
  const ledger = getLedgerByPatient(patientId)

  const branchIds = new Set<string>()
  if (patient.preferredBranchId) branchIds.add(patient.preferredBranchId)
  appointments.forEach((appointment) => appointment.branchId && branchIds.add(appointment.branchId))
  clinicalVisits.forEach((visit) => visit.branchId && branchIds.add(visit.branchId))
  treatments.forEach((treatment) => treatment.branchId && branchIds.add(treatment.branchId))
  invoices.forEach((invoice) => invoice.branchId && branchIds.add(invoice.branchId))
  payments.forEach((payment) => payment.branchId && branchIds.add(payment.branchId))

  const providerNames = new Map<string, { name: string; lastDate: string }>()
  appointments.forEach((appointment) => {
    const name = appointment.providerId ? providerMap.get(appointment.providerId) : undefined
    if (name) providerNames.set(`appointment-${appointment.providerId}`, { name, lastDate: appointment.date })
  })
  clinicalVisits.forEach((visit) => {
    const name = visit.providerNameSnapshot || (visit.providerId ? providerMap.get(visit.providerId) : '') || visit.historicalProviderText || visit.createdBy
    if (name) providerNames.set(`clinical-${name}`, { name, lastDate: visit.recordDate })
  })
  treatments.forEach((treatment) => {
    const name = treatment.providerNameSnapshot || treatment.performedBy || (treatment.providerId ? providerMap.get(treatment.providerId) : '')
    if (name) providerNames.set(`treatment-${name}`, { name, lastDate: treatment.treatmentDate })
  })

  const providerHistory = Array.from(providerNames.values())
    .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime())
  const branchHistory = Array.from(branchIds).map((id) => ({ id, name: branchMap.get(id) ?? 'Unknown branch' }))
  const duplicateCandidates = findPotentialPatientDuplicates(patient).filter((match) => match.patient.id !== patient.id)

  const totalBilledCents = invoices.filter((invoice) => invoice.status !== 'void').reduce((sum, invoice) => sum + invoice.totalCents, 0)
  const totalPaidCents = payments
    .filter((payment) => ['completed', 'partially_refunded', 'refunded'].includes(payment.status))
    .reduce((sum, payment) => sum + payment.allocatedCents, 0)
  const totalRefundedCents = refunds.filter((refund) => refund.status === 'completed').reduce((sum, refund) => sum + refund.amountCents, 0)
  const outstandingBalanceCents = getOutstandingBalanceByPatient(patientId)

  const auditActivities = getStoredAuditLogs()
    .filter((entry) => entry.entityId === patientId || entry.metadata.patientId === patientId)
    .map((entry): Patient360Activity => {
      const label = formatAuditAction(entry.action)
      return {
        id: entry.id,
        date: entry.timestamp,
        module: 'Profile',
        label: label.label,
        description: label.description,
        actor: entry.user,
      }
    })

  const activities: Patient360Activity[] = [
    {
      id: `patient-created-${patient.id}`,
      date: patient.createdAt,
      module: 'Profile' as const,
      label: 'Patient record created',
      description: `${getPatientDisplayName(patient)} was added as ${statusLabel(patient.origin ?? 'staff_created')}.`,
    },
    ...(patient.updatedAt && patient.updatedAt !== patient.createdAt ? [{
      id: `patient-updated-${patient.id}`,
      date: patient.updatedAt,
      module: 'Profile' as const,
      label: 'Patient information updated',
      description: 'Basic patient profile information was updated.',
    }] : []),
    ...appointments.flatMap((appointment) => [
      {
        id: `appointment-${appointment.id}`,
        date: appointmentTimestamp(appointment),
        module: 'Appointments' as const,
        label: appointmentLabel(appointment.status),
        description: `${serviceMap.get(appointment.serviceId) ?? 'Appointment'} at ${appointment.branchId ? branchMap.get(appointment.branchId) ?? 'Unknown branch' : 'unassigned branch'}.`,
        actor: appointment.createdBy,
      },
      ...getAppointmentHistory(appointment.id).map((history) => ({
        id: history.id,
        date: history.changedAt,
        module: 'Appointments' as const,
        label: history.toStatus ? appointmentLabel(history.toStatus) : 'Appointment activity recorded',
        description: history.reason || history.notes || `${serviceMap.get(appointment.serviceId) ?? 'Appointment'} status history updated.`,
        actor: history.changedBy,
      })),
    ]),
    ...clinicalVisits.map((visit) => ({
      id: `clinical-${visit.id}`,
      date: visit.recordDate,
      module: 'Clinical' as const,
      label: visit.source === 'historical_import' ? 'Historical clinical visit imported' : 'Clinical visit recorded',
      description: visit.chiefComplaint || visit.assessment || visit.patientVisibleSummary || 'Clinical visit documentation exists.',
      actor: visit.providerNameSnapshot || visit.createdBy,
    })),
    ...treatments.map((treatment) => ({
      id: `treatment-${treatment.id}`,
      date: treatment.treatmentDate,
      module: 'Treatments' as const,
      label: 'Treatment recorded',
      description: `${treatment.serviceNameSnapshot || serviceMap.get(treatment.serviceId) || treatment.description || 'Treatment'} - ${statusLabel(treatment.status)}.`,
      actor: treatment.providerNameSnapshot || treatment.performedBy,
    })),
    ...prescriptions.map((prescription) => ({
      id: `prescription-${prescription.id}`,
      date: prescription.prescriptionDate,
      module: 'Clinical' as const,
      label: 'Prescription created',
      description: prescription.medication || `${prescription.items.length} medication item${prescription.items.length === 1 ? '' : 's'}.`,
      actor: prescription.providerNameSnapshot || prescription.prescribedBy,
    })),
    ...invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      date: invoice.invoiceDate,
      module: 'Billing' as const,
      label: 'Invoice created',
      description: `${invoice.invoiceNumber} - ${statusLabel(invoice.status)}.`,
      actor: invoice.createdBy,
    })),
    ...payments.map((payment) => ({
      id: `payment-${payment.id}`,
      date: payment.date,
      module: 'Billing' as const,
      label: payment.status === 'completed' ? 'Payment recorded' : `Payment ${statusLabel(payment.status)}`,
      description: `${payment.paymentNumber} via ${statusLabel(payment.paymentMethod)}.`,
      actor: payment.recordedBy,
    })),
    ...receipts.map((receipt) => ({
      id: `receipt-${receipt.id}`,
      date: receipt.issuedAt,
      module: 'Billing' as const,
      label: 'Receipt generated',
      description: receipt.receiptNumber,
      actor: receipt.issuedBy,
    })),
    ...documents.map((document) => ({
      id: `document-${document.id}`,
      date: document.uploadDate,
      module: 'Documents' as const,
      label: 'Document uploaded',
      description: `${document.fileName} - ${statusLabel(document.category)}.`,
      actor: document.uploadedBy,
    })),
    ...dentalImages.map((image) => ({
      id: `image-${image.id}`,
      date: image.uploadDate,
      module: 'Documents' as const,
      label: 'Clinical image uploaded',
      description: `${image.fileName} - ${statusLabel(image.kind)}.`,
      actor: image.uploadedBy,
    })),
    ...communications.map((log) => ({
      id: `communication-${log.id}`,
      date: log.deliveredAt || log.sentAt || log.queuedAt || log.createdAt,
      module: 'Communications' as const,
      label: `${statusLabel(log.channel)} communication ${statusLabel(log.status)}`,
      description: `${statusLabel(log.templateKey)} to ${log.recipient}.`,
    })),
    ...auditActivities,
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return {
    patient,
    patientType: appointments.some((appointment) => appointment.status === 'completed') || clinicalVisits.length || treatments.length ? 'Returning Patient' : 'New Patient',
    nextAppointment,
    lastVisit,
    appointments,
    upcomingAppointments,
    pastAppointments,
    clinicalVisits,
    treatments,
    prescriptions,
    invoices,
    payments,
    receipts,
    refunds,
    documents,
    dentalImages,
    communications,
    ledger,
    providerHistory,
    branchHistory,
    duplicateCandidates,
    billing: {
      totalBilledCents,
      totalPaidCents,
      totalRefundedCents,
      outstandingBalanceCents,
    },
    appointmentStats: {
      total: appointments.length,
      upcoming: upcomingAppointments.length,
      completed: appointments.filter((appointment) => appointment.status === 'completed').length,
      cancelled: appointments.filter((appointment) => appointment.status === 'cancelled').length,
      noShow: appointments.filter((appointment) => appointment.status === 'no_show').length,
      rescheduled: appointments.filter((appointment) => appointment.status === 'rescheduled').length,
    },
    legacy: {
      isHistorical: patient.origin === 'historical_import' || Boolean(patient.importBatchId),
      importBatchId: patient.importBatchId,
      importSourceRow: patient.importSourceRow,
      originalImportedName: patient.originalImportedName,
    },
    activities,
  }
}
