import type { Appointment, AppointmentStatus } from './appointmentTypes'
import type { Provider } from '../dentists/dentistTypes'

export type FrontDeskQueueEntry = {
  appointment: Appointment
  queueStatus: 'pending' | 'scheduled' | 'checked_in' | 'waiting' | 'in_treatment' | 'completed' | 'no_show'
  waitingMinutes: number | null
  isLate: boolean
}

export type FrontDeskSummary = {
  appointments: number
  pending: number
  checkedIn: number
  waiting: number
  inTreatment: number
  completed: number
  noShow: number
}

export type ProviderOperationalStatus = {
  providerId: string
  label: string
  currentAppointment?: Appointment
  nextAppointment?: Appointment
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function isoDateInManila(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function manilaClockMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

function minutesSinceTimestamp(value?: string, now = new Date()) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000))
}

export function getFrontDeskQueueStatus(status: AppointmentStatus): FrontDeskQueueEntry['queueStatus'] | null {
  if (status === 'pending') return 'pending'
  if (status === 'confirmed') return 'scheduled'
  if (status === 'checked_in') return 'checked_in'
  if (status === 'waiting') return 'waiting'
  if (status === 'in_progress') return 'in_treatment'
  if (status === 'completed') return 'completed'
  if (status === 'no_show') return 'no_show'
  return null
}

export function buildFrontDeskQueue(
  appointments: Appointment[],
  options: {
    date?: string
    branchId?: string
    lateThresholdMinutes?: number | null
    now?: Date
  } = {},
): FrontDeskQueueEntry[] {
  const now = options.now ?? new Date()
  const date = options.date ?? isoDateInManila(now)
  const currentMinutes = manilaClockMinutes(now)
  const lateThreshold = options.lateThresholdMinutes

  return appointments
    .filter((appointment) => appointment.date === date)
    .filter((appointment) => !options.branchId || options.branchId === 'all' || appointment.branchId === options.branchId)
    .map((appointment) => {
      const queueStatus = getFrontDeskQueueStatus(appointment.status)
      if (!queueStatus) return null
      const arrivalTimestamp = appointment.waitingAt ?? appointment.checkedInAt
      const waitingMinutes = ['checked_in', 'waiting'].includes(appointment.status)
        ? minutesSinceTimestamp(arrivalTimestamp, now)
        : null
      const eligibleForLateIndicator = appointment.status === 'confirmed' && lateThreshold !== null && lateThreshold !== undefined
      const isLate = eligibleForLateIndicator && currentMinutes > toMinutes(appointment.startTime) + Math.max(0, lateThreshold)
      return { appointment, queueStatus, waitingMinutes, isLate }
    })
    .filter((entry): entry is FrontDeskQueueEntry => Boolean(entry))
    .sort((left, right) => {
      const leftArrival = left.appointment.waitingAt ?? left.appointment.checkedInAt
      const rightArrival = right.appointment.waitingAt ?? right.appointment.checkedInAt
      if (leftArrival && rightArrival) return new Date(leftArrival).getTime() - new Date(rightArrival).getTime()
      if (leftArrival) return -1
      if (rightArrival) return 1
      return left.appointment.startTime.localeCompare(right.appointment.startTime)
    })
}

export function summarizeFrontDeskDay(entries: FrontDeskQueueEntry[]): FrontDeskSummary {
  return entries.reduce<FrontDeskSummary>((summary, entry) => {
    summary.appointments += 1
    if (entry.appointment.status === 'pending') summary.pending += 1
    if (entry.appointment.status === 'checked_in') summary.checkedIn += 1
    if (entry.appointment.status === 'waiting') summary.waiting += 1
    if (entry.appointment.status === 'in_progress') summary.inTreatment += 1
    if (entry.appointment.status === 'completed') summary.completed += 1
    if (entry.appointment.status === 'no_show') summary.noShow += 1
    return summary
  }, {
    appointments: 0,
    pending: 0,
    checkedIn: 0,
    waiting: 0,
    inTreatment: 0,
    completed: 0,
    noShow: 0,
  })
}

export function getProviderOperationalStatus(
  provider: Provider,
  appointments: Appointment[],
  options: { date?: string; branchId?: string; now?: Date } = {},
): ProviderOperationalStatus {
  const now = options.now ?? new Date()
  const date = options.date ?? isoDateInManila(now)
  const currentMinutes = manilaClockMinutes(now)
  const providerAppointments = appointments
    .filter((appointment) => appointment.providerId === provider.id)
    .filter((appointment) => appointment.date === date)
    .filter((appointment) => !options.branchId || options.branchId === 'all' || appointment.branchId === options.branchId)
    .filter((appointment) => !['cancelled', 'rejected', 'rescheduled', 'no_show'].includes(appointment.status))
    .sort((left, right) => left.startTime.localeCompare(right.startTime))

  const currentAppointment = providerAppointments.find((appointment) => (
    ['checked_in', 'waiting', 'in_progress'].includes(appointment.status) ||
    (toMinutes(appointment.startTime) <= currentMinutes && currentMinutes < toMinutes(appointment.endTime) && appointment.status !== 'completed')
  ))
  if (currentAppointment) {
    return {
      providerId: provider.id,
      label: currentAppointment.status === 'in_progress' ? 'With patient' : 'Patient in active flow',
      currentAppointment,
      nextAppointment: providerAppointments.find((appointment) => toMinutes(appointment.startTime) > currentMinutes),
    }
  }

  const nextAppointment = providerAppointments.find((appointment) => toMinutes(appointment.startTime) > currentMinutes)
  return {
    providerId: provider.id,
    label: nextAppointment ? `Next appointment at ${formatFrontDeskTime(nextAppointment.startTime)}` : 'No current appointment',
    nextAppointment,
  }
}

export function formatFrontDeskTime(value: string) {
  const [hourValue, minuteValue] = value.split(':').map(Number)
  if (!Number.isFinite(hourValue) || !Number.isFinite(minuteValue)) return value
  const period = hourValue >= 12 ? 'PM' : 'AM'
  const hour = hourValue % 12 || 12
  return `${hour}:${String(minuteValue).padStart(2, '0')} ${period}`
}
