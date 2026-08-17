import type { Appointment, AppointmentFormValues } from './appointmentTypes'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'

const APPOINTMENT_STORAGE_KEY = 'plamenco.appointments'

const seedAppointments: Appointment[] = []

function safeParseAppointments(value: string | null): Appointment[] | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Appointment[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function getStoredAppointments(): Appointment[] {
  const stored = safeParseAppointments(window.localStorage.getItem(APPOINTMENT_STORAGE_KEY))

  if (stored?.length) {
    return stored
  }

  window.localStorage.setItem(APPOINTMENT_STORAGE_KEY, JSON.stringify(seedAppointments))
  return seedAppointments
}

export function saveStoredAppointments(appointments: Appointment[]) {
  window.localStorage.setItem(APPOINTMENT_STORAGE_KEY, JSON.stringify(appointments))
}

export function getAppointmentById(id: string): Appointment | undefined {
  return getStoredAppointments().find((appt) => appt.id === id)
}

export function getAppointmentsByPatient(patientId: string): Appointment[] {
  return getStoredAppointments().filter((appt) => appt.patientId === patientId)
}

export function getAppointmentsByDate(date: string): Appointment[] {
  return getStoredAppointments().filter((appt) => appt.date === date)
}

export function getAppointmentsInDateRange(startDate: string, endDate: string): Appointment[] {
  return getStoredAppointments().filter((appt) => appt.date >= startDate && appt.date <= endDate)
}

export function getTodayAppointments(): Appointment[] {
  const today = new Date().toISOString().split('T')[0]
  return getAppointmentsByDate(today)
}

export function checkScheduleConflict(
  date: string,
  startTime: string,
  endTime: string,
  excludeId?: string
): boolean {
  const appointments = getAppointmentsByDate(date).filter(
    (appt) =>
      appt.status !== 'cancelled' &&
      appt.status !== 'no_show' &&
      (!excludeId || appt.id !== excludeId)
  )

  for (const appt of appointments) {
    const existingStart = appt.startTime
    const existingEnd = appt.endTime

    // Check if times overlap
    if (startTime < existingEnd && endTime > existingStart) {
      return true
    }
  }

  return false
}

export function createAppointment(
  values: AppointmentFormValues,
  createdBy: string
): Appointment | null {
  // Check for conflicts
  if (checkScheduleConflict(values.date, values.startTime, values.endTime)) {
    return null
  }

  const appointments = getStoredAppointments()
  const now = new Date().toISOString()
  const id = `appt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  const appointment: Appointment = {
    id,
    ...values,
    createdBy,
    createdAt: now,
    updatedAt: now,
  }

  appointments.push(appointment)
  saveStoredAppointments(appointments)
  
  // Persist to Supabase asynchronously
  void insertRemoteTableRow('appointments', {
    id: appointment.id,
    patient_id: appointment.patientId,
    service_id: appointment.serviceId,
    appointment_date: appointment.date,
    start_time: appointment.startTime,
    end_time: appointment.endTime,
    notes: appointment.notes,
    status: appointment.status,
    created_by: appointment.createdBy,
  })
  
  return appointment
}

export function updateAppointment(
  id: string,
  values: Partial<AppointmentFormValues>
): Appointment | null {
  const appointments = getStoredAppointments()
  const index = appointments.findIndex((appt) => appt.id === id)

  if (index === -1) {
    return null
  }

  const appointment = appointments[index]

  // Check for conflicts if date/time changed
  if (values.date || values.startTime || values.endTime) {
    const date = values.date ?? appointment.date
    const startTime = values.startTime ?? appointment.startTime
    const endTime = values.endTime ?? appointment.endTime

    if (checkScheduleConflict(date, startTime, endTime, id)) {
      return null
    }
  }

  const now = new Date().toISOString()
  const updated: Appointment = {
    ...appointment,
    ...values,
    updatedAt: now,
  }

  appointments[index] = updated
  saveStoredAppointments(appointments)
  
  // Persist to Supabase asynchronously
  void updateRemoteTableRow('appointments', id, {
    patient_id: updated.patientId,
    service_id: updated.serviceId,
    appointment_date: updated.date,
    start_time: updated.startTime,
    end_time: updated.endTime,
    notes: updated.notes,
    status: updated.status,
  })
  
  return updated
}

export function deleteAppointment(id: string): boolean {
  const appointments = getStoredAppointments()
  const index = appointments.findIndex((appt) => appt.id === id)

  if (index === -1) {
    return false
  }

  appointments.splice(index, 1)
  saveStoredAppointments(appointments)
  return true
}

export function searchAppointments(query: string): Appointment[] {
  if (!query.trim()) {
    return getStoredAppointments()
  }

  const lower = query.toLowerCase()
  return getStoredAppointments().filter((appt) => {
    return appt.id.toLowerCase().includes(lower) || appt.notes.toLowerCase().includes(lower)
  })
}

export function filterAppointments(
  appointments: Appointment[],
  filters: {
    status?: string
    dateFrom?: string
    dateTo?: string
    patientId?: string
  }
): Appointment[] {
  let result = appointments

  if (filters.status) {
    result = result.filter((a) => a.status === filters.status)
  }

  if (filters.dateFrom) {
    result = result.filter((a) => a.date >= filters.dateFrom!)
  }

  if (filters.dateTo) {
    result = result.filter((a) => a.date <= filters.dateTo!)
  }

  if (filters.patientId) {
    result = result.filter((a) => a.patientId === filters.patientId)
  }

  return result
}

export function sortAppointments(
  appointments: Appointment[],
  key: 'date' | 'patient' | 'status',
  direction: 'asc' | 'desc'
): Appointment[] {
  const sorted = [...appointments]

  sorted.sort((a, b) => {
    let aVal: string
    let bVal: string

    switch (key) {
      case 'date':
        aVal = `${a.date}T${a.startTime}`
        bVal = `${b.date}T${b.startTime}`
        break
      case 'patient':
        aVal = a.patientId
        bVal = b.patientId
        break
      case 'status':
        aVal = a.status
        bVal = b.status
        break
      default:
        return 0
    }

    const comparison = aVal.localeCompare(bVal)
    return direction === 'asc' ? comparison : -comparison
  })

  return sorted
}

export { APPOINTMENT_STORAGE_KEY }
