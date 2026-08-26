import type { Branch } from '../branches/branchTypes'
import { getStoredBranches } from '../branches/branchStore'
import type { Provider } from '../dentists/dentistTypes'
import {
  getProviderAvailabilityOverrides,
  getProviderBranchAssignments,
  getProviderScheduleBlocks,
  getStoredProviders,
} from '../dentists/dentistStore'
import type { Service } from '../services/serviceTypes'
import { getStoredServices } from '../services/serviceStore'
import { isBookingBusy } from './bookingBusyStore'
import { addMinutesToTime, checkScheduleConflict, getOperatories, getScheduleConflictDetail, getStoredAppointments } from './appointmentStore'

export type ProviderChoice = Provider & { label: string }

export type AvailabilitySlot = {
  startTime: string
  endTime: string
  providerId: string
  providerName: string
  operatoryId?: string
  operatoryName?: string
}

export type AppointmentAvailabilityStatus =
  | 'missing_context'
  | 'no_eligible_provider'
  | 'no_schedule'
  | 'provider_unavailable'
  | 'no_slots'
  | 'ready'

export type AppointmentAvailabilityResult = {
  status: AppointmentAvailabilityStatus
n  slots: AvailabilitySlot[]
  eligibleProviderCount: number
  scheduledProviderCount: number
}

type AvailabilityInput = {
  branchId: string
  serviceId: string
  date: string
  providerId?: string
  operatoryId?: string
  excludeAppointmentId?: string
  slotIntervalMinutes?: number
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

function minutesToTime(minutes: number) {
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function intervalsOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && endA > startB
}

function getDayOfWeek(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

export function formatAppointmentTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

export function getEligibleProviders(branchId: string): ProviderChoice[] {
  const assignments = getProviderBranchAssignments().filter(
    (assignment) => assignment.branchId === branchId && assignment.status === 'active',
  )
  const assignedProviderIds = new Set(assignments.map((assignment) => assignment.providerId))

  return getStoredProviders()
    .filter((provider) => provider.status === 'active' && assignedProviderIds.has(provider.id))
    .map((provider) => ({ ...provider, label: provider.displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

function getActiveBranch(branchId: string): Branch | null {
  return getStoredBranches().find((branch) => branch.id === branchId && branch.status === 'active') ?? null
}

function getService(serviceId: string): Service | null {
  return getStoredServices().find((service) => service.id === serviceId && service.status === 'active') ?? null
}

function getProviderWindows(providerId: string, branchId: string, date: string) {
  const dayOfWeek = getDayOfWeek(date)
  const regularBlocks = getProviderScheduleBlocks().filter(
    (block) =>
      block.providerId === providerId &&
      block.branchId === branchId &&
      block.dayOfWeek === dayOfWeek &&
      block.status === 'active',
  )

  const overrides = getProviderAvailabilityOverrides().filter(
    (override) =>
      override.providerId === providerId &&
      override.date === date &&
      (!override.branchId || override.branchId === branchId),
  )

  const timedSpecialHours = overrides.filter(
    (override) =>
      (override.type === 'special_hours' || override.type === 'available') &&
      Boolean(override.startTime) &&
      Boolean(override.endTime),
  )
  const baseWindows = timedSpecialHours.length
    ? timedSpecialHours.map((override) => ({ startTime: override.startTime!, endTime: override.endTime! }))
    : regularBlocks.map((block) => ({ startTime: block.startTime, endTime: block.endTime }))

  const blockers = overrides.filter((override) => override.type === 'unavailable' || override.type === 'leave')
  return { baseWindows, blockers }
}

function isWindowFullyBlocked(
  window: { startTime: string; endTime: string },
  blockers: ReturnType<typeof getProviderWindows>['blockers'],
) {
  return blockers.some((override) => {
    if (!override.startTime || !override.endTime) return true
    return override.startTime <= window.startTime && override.endTime >= window.endTime
  })
}

export function isProviderAvailable({
  branchId,
  date,
  endTime,
  excludeAppointmentId,
  operatoryId,
  providerId,
  startTime,
}: {
  branchId: string
  providerId: string
  operatoryId?: string
  date: string
  startTime: string
  endTime: string
  excludeAppointmentId?: string
}) {
  const branch = getActiveBranch(branchId)
  if (!branch) return false

  const provider = getStoredProviders().find((entry) => entry.id === providerId && entry.status === 'active')
  if (!provider) return false

  if (!getEligibleProviders(branchId).some((entry) => entry.id === providerId)) return false
  if (startTime < branch.openingTime || endTime > branch.closingTime) return false

  const { baseWindows, blockers } = getProviderWindows(providerId, branchId, date)
  const withinWorkingWindow = baseWindows.some((window) => startTime >= window.startTime && endTime <= window.endTime)
  if (!withinWorkingWindow) return false

  const blockedByOverride = blockers.some((override) => {
    if (!override.startTime || !override.endTime) return true
    return intervalsOverlap(startTime, endTime, override.startTime, override.endTime)
  })
  if (blockedByOverride) return false

  if (isBookingBusy({ branchId, providerId, operatoryId, date, startTime, endTime, excludeAppointmentId })) return false
  if (getScheduleConflictDetail(date, startTime, endTime, excludeAppointmentId, providerId, branchId, operatoryId)) return false

  return !checkScheduleConflict(date, startTime, endTime, excludeAppointmentId, providerId, branchId, operatoryId)
}

export function getAppointmentAvailability({
  branchId,
  date,
  excludeAppointmentId,
  operatoryId,
  providerId,
  serviceId,
  slotIntervalMinutes = 30,
}: AvailabilityInput): AppointmentAvailabilityResult {
  const branch = getActiveBranch(branchId)
  const service = getService(serviceId)
  if (!branch || !service || !date || service.duration <= 0) {
    return { status: 'missing_context', slots: [], eligibleProviderCount: 0, scheduledProviderCount: 0 }
  }

  const eligibleProviders = getEligibleProviders(branchId)
  const providers = providerId
    ? eligibleProviders.filter((provider) => provider.id === providerId)
    : eligibleProviders

  if (!providers.length) {
    return {
      status: providerId ? 'provider_unavailable' : 'no_eligible_provider',
      slots: [],
      eligibleProviderCount: eligibleProviders.length,
      scheduledProviderCount: 0,
    }
  }

  const operatories = getOperatories().filter((operatory) => operatory.branchId === branchId && operatory.status === 'active')
  const candidateOperatories = operatoryId ? operatories.filter((operatory) => operatory.id === operatoryId) : operatories
  const slots: AvailabilitySlot[] = []
  let scheduledProviderCount = 0
  let hasUnblockedWindow = false

  providers.forEach((provider) => {
    const { baseWindows, blockers } = getProviderWindows(provider.id, branchId, date)
    if (baseWindows.length) scheduledProviderCount += 1
    if (baseWindows.some((window) => !isWindowFullyBlocked(window, blockers))) hasUnblockedWindow = true

    baseWindows.forEach((window) => {
      const windowStart = Math.max(timeToMinutes(window.startTime), timeToMinutes(branch.openingTime))
      const windowEnd = Math.min(timeToMinutes(window.endTime), timeToMinutes(branch.closingTime))

      for (let cursor = windowStart; cursor + service.duration <= windowEnd; cursor += slotIntervalMinutes) {
        const startTime = minutesToTime(cursor)
        const endTime = addMinutesToTime(startTime, service.duration)
        if (candidateOperatories.length) {
          candidateOperatories.forEach((operatory) => {
            if (isProviderAvailable({ branchId, providerId: provider.id, operatoryId: operatory.id, date, startTime, endTime, excludeAppointmentId })) {
              slots.push({
                startTime,
                endTime,
                providerId: provider.id,
                providerName: provider.displayName,
                operatoryId: operatory.id,
                operatoryName: operatory.name,
              })
            }
          })
        } else if (isProviderAvailable({ branchId, providerId: provider.id, date, startTime, endTime, excludeAppointmentId })) {
          slots.push({
            startTime,
            endTime,
            providerId: provider.id,
            providerName: provider.displayName,
          })
        }
      }
    })
  })

  const unique = new Map<string, AvailabilitySlot>()
  slots
    .sort((a, b) => `${a.startTime}-${a.providerName}-${a.operatoryName ?? ''}`.localeCompare(`${b.startTime}-${b.providerName}-${b.operatoryName ?? ''}`))
    .forEach((slot) => unique.set(`${slot.startTime}-${slot.providerId}-${slot.operatoryId ?? 'no-operatory'}`, slot))

  const availableSlots = Array.from(unique.values())
  if (availableSlots.length) {
    return {
      status: 'ready',
      slots: availableSlots,
      eligibleProviderCount: eligibleProviders.length,
      scheduledProviderCount,
    }
  }

  if (scheduledProviderCount === 0) {
    return {
      status: 'no_schedule',
      slots: [],
      eligibleProviderCount: eligibleProviders.length,
      scheduledProviderCount,
    }
  }

  if (!hasUnblockedWindow) {
    return {
      status: 'provider_unavailable',
      slots: [],
      eligibleProviderCount: eligibleProviders.length,
      scheduledProviderCount,
    }
  }

  return {
    status: 'no_slots',
    slots: [],
    eligibleProviderCount: eligibleProviders.length,
    scheduledProviderCount,
  }
}

export function getAvailableAppointmentSlots(input: AvailabilityInput): AvailabilitySlot[] {
  return getAppointmentAvailability(input).slots
}

export function getCalendarOperatingHours(branchId?: string) {
  const branches = branchId ? getStoredBranches().filter((branch) => branch.id === branchId) : getStoredBranches()
  const activeBranches = branches.filter((branch) => branch.status === 'active')
  if (!activeBranches.length) return { openingTime: '08:00', closingTime: '18:00' }

  return {
    openingTime: activeBranches.reduce((earliest, branch) => (branch.openingTime < earliest ? branch.openingTime : earliest), activeBranches[0].openingTime),
    closingTime: activeBranches.reduce((latest, branch) => (branch.closingTime > latest ? branch.closingTime : latest), activeBranches[0].closingTime),
  }
}

export function getProviderAppointmentLoad(providerId: string, date: string) {
  return getStoredAppointments().filter((appointment) => appointment.providerId === providerId && appointment.date === date).length
}
