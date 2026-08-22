import { supabase } from '../../lib/supabase'
import type { Appointment } from './appointmentTypes'
import { getStoredAppointments, saveStoredAppointments } from './appointmentStore'

function mapAppointmentRow(row: Record<string, any>): Appointment {
  return {
    id: String(row.id),
    appointmentNumber: row.appointment_number ?? undefined,
    patientId: String(row.patient_id ?? ''),
    branchId: row.branch_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    serviceId: String(row.service_id ?? ''),
    operatoryId: row.operatory_id ?? undefined,
    date: row.appointment_date ?? '',
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : '',
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : '',
    durationMinutes: row.duration_minutes == null ? undefined : Number(row.duration_minutes),
    estimatedAmountCents: row.estimated_amount_cents == null ? undefined : Number(row.estimated_amount_cents),
    paymentStatus: row.payment_status ?? 'not_billed',
    depositStatus: row.deposit_status ?? 'not_required',
    depositRequiredCents: Number(row.deposit_required_cents ?? 0),
    depositPaidCents: Number(row.deposit_paid_cents ?? 0),
    reasonForVisit: row.reason_for_visit ?? '',
    patientNotes: row.patient_notes ?? '',
    internalNotes: row.internal_notes ?? '',
    bookingSource: row.booking_source ?? 'staff_entry',
    checkedInAt: row.checked_in_at ?? undefined,
    checkedInBy: row.checked_in_by ?? undefined,
    waitingAt: row.waiting_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    startedBy: row.started_by ?? undefined,
    completedAt: row.completed_at ?? undefined,
    completedBy: row.completed_by ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelledBy: row.cancelled_by ?? undefined,
    noShowAt: row.no_show_at ?? undefined,
    noShowBy: row.no_show_by ?? undefined,
    rescheduledAt: row.rescheduled_at ?? undefined,
    rescheduledBy: row.rescheduled_by ?? undefined,
    notes: row.notes ?? '',
    status: row.status ?? 'pending',
    createdBy: row.created_by ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

export async function loadAppointmentsFromSupabase(options: { strict?: boolean } = {}): Promise<Appointment[]> {
  if (!supabase) {
    if (options.strict) throw new Error('Clinic database is not configured. Unable to load appointments.')
    return getStoredAppointments()
  }

  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .order('appointment_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    if (options.strict) throw new Error(`Unable to load appointments from Supabase: ${error.message}`)
    return getStoredAppointments()
  }

  const appointments = (data ?? []).map((row) => mapAppointmentRow(row as Record<string, any>))
  saveStoredAppointments(appointments)
  return appointments
}
