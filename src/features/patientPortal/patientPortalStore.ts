import { supabase } from '../../lib/supabase.ts'
import { getAppointmentsByDate } from '../appointments/appointmentStore.ts'
import { getAvailableAppointmentSlots } from '../appointments/availabilityEngine.ts'
import { getStoredPatients } from '../patients/patientStore.ts'
import { getStoredServices } from '../services/serviceStore.ts'

export type PublicBookingInput = {
  serviceId: string
  branchId?: string
  providerId?: string
  date: string
  startTime: string
  firstName: string
  lastName: string
  email: string
  phone: string
  notes?: string
}

export type PublicBookingResult = {
  id: string
  appointmentNumber: string
  patientId?: string
  duplicate: boolean
}

export function getAvailableBookingTimes(serviceId: string, date: string, branchId?: string, providerId?: string): string[] {
  if (branchId) {
    return getAvailableAppointmentSlots({ branchId, providerId, serviceId, date }).map((slot) => slot.startTime)
  }

  const service = getStoredServices().find((item) => item.id === serviceId)
  const durationMinutes = service?.duration ?? 30
  const busy = getAppointmentsByDate(date)
    .filter((appointment) => appointment.status !== 'cancelled' && appointment.status !== 'no_show')
    .map((appointment) => ({ start: appointment.startTime, end: appointment.endTime }))

  const slots: string[] = []
  const startHour = 8
  const endHour = 18

  for (let hour = startHour; hour < endHour; hour += 1) {
    const start = `${String(hour).padStart(2, '0')}:00`
    const candidateEndMinutes = timeToMinutes(start) + durationMinutes
    if (candidateEndMinutes > endHour * 60) continue

    const overlaps = busy.some((appointment) => {
      const appointmentStart = timeToMinutes(appointment.start)
      const appointmentEnd = timeToMinutes(appointment.end)
      return timeToMinutes(start) < appointmentEnd && candidateEndMinutes > appointmentStart
    })

    if (!overlaps) slots.push(start)
  }

  return slots
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export async function createPublicBooking(input: PublicBookingInput): Promise<PublicBookingResult> {
  if (!supabase) {
    throw new Error('Online booking is temporarily unavailable because the clinic database is not configured.')
  }
  if (!input.branchId) throw new Error('Please select a clinic branch.')

  const { data, error } = await supabase.rpc('create_public_booking', {
    p_branch_id: input.branchId,
    p_service_id: input.serviceId,
    p_provider_id: input.providerId || null,
    p_appointment_date: input.date,
    p_start_time: input.startTime,
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim(),
    p_email: input.email.trim().toLowerCase(),
    p_phone: input.phone.trim(),
    p_notes: input.notes?.trim() ?? '',
  })

  if (error) {
    throw new Error(error.message || 'Unable to save this appointment to the clinic database.')
  }

  const result = data as {
    id?: unknown
    appointment_number?: unknown
    patient_id?: unknown
    duplicate?: unknown
  } | null

  if (!result?.id || !result.appointment_number) {
    throw new Error('The clinic database did not confirm the appointment. Please try again.')
  }

  return {
    id: String(result.id),
    appointmentNumber: String(result.appointment_number),
    patientId: result.patient_id ? String(result.patient_id) : undefined,
    duplicate: Boolean(result.duplicate),
  }
}

export function getPublicPatientDashboard(patientId: string) {
  return {
    patient: getStoredPatients().find((entry) => entry.patientId === patientId) ?? null,
  }
}
