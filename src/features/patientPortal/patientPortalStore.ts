import { createPatient, getStoredPatients } from '../patients/patientStore.ts'
import { createAppointment, getAppointmentsByDate } from '../appointments/appointmentStore.ts'
import { getAvailableAppointmentSlots } from '../appointments/availabilityEngine.ts'
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

    if (candidateEndMinutes > 18 * 60) continue

    const overlaps = busy.some((appointment) => {
      const appointmentStart = timeToMinutes(appointment.start)
      const appointmentEnd = timeToMinutes(appointment.end)
      return timeToMinutes(start) < appointmentEnd && candidateEndMinutes > appointmentStart
    })

    if (!overlaps) {
      slots.push(start)
    }
  }

  return slots
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function createPublicBooking(input: PublicBookingInput) {
  const service = getStoredServices().find((item) => item.id === input.serviceId)
  if (!service) throw new Error('Selected service is not available.')
  if (input.branchId) {
    const available = getAvailableAppointmentSlots({
      branchId: input.branchId,
      providerId: input.providerId || undefined,
      serviceId: input.serviceId,
      date: input.date,
    }).some((slot) => slot.startTime === input.startTime && (!input.providerId || slot.providerId === input.providerId))
    if (!available) throw new Error('That time is no longer available. Please choose another time.')
  }

  const email = input.email.trim().toLowerCase()
  const phone = input.phone.trim()
  const patient = getStoredPatients().find((entry) => entry.email.toLowerCase() === email || (!!phone && entry.phone.trim() === phone))
  const nextPatient = patient ?? createPatient({
    firstName: input.firstName.trim(),
    middleName: '',
    lastName: input.lastName.trim(),
    dateOfBirth: '',
    sex: 'prefer_not_to_say',
    phone,
    email,
    address: '',
    emergencyContact: '',
    emergencyContactPhone: '',
    registrationDate: new Date().toISOString().split('T')[0],
    status: 'active',
    allergies: '',
    medicalConditions: '',
    currentMedications: '',
    previousSurgeries: '',
    medicalNotes: '',
  })

  const appointment = createAppointment(
    {
      patientId: nextPatient.patientId,
      branchId: input.branchId,
      providerId: input.providerId,
      serviceId: input.serviceId,
      date: input.date,
      startTime: input.startTime,
      endTime: minutesToTime(timeToMinutes(input.startTime) + service.duration),
      durationMinutes: service.duration,
      estimatedAmountCents: service.price,
      bookingSource: 'patient_portal',
      paymentStatus: 'not_billed',
      depositStatus: 'not_required',
      patientNotes: input.notes?.trim() ?? '',
      reasonForVisit: service.name,
      notes: input.notes?.trim() || `Online booking for ${service.name}.`,
      status: 'pending',
    },
    'public-booking'
  )

  if (!appointment) {
    throw new Error('The selected time is no longer available. Please choose another slot.')
  }

  return appointment
}

export function getPublicPatientDashboard(patientId: string) {
  return {
    patient: getStoredPatients().find((entry) => entry.patientId === patientId) ?? null,
  }
}
