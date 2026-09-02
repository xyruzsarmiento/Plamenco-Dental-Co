import type { Branch } from '../branches/branchTypes'
import { getStoredBranches } from '../branches/branchStore'
import type { Provider } from '../dentists/dentistTypes'
import {
  getProviderBranchAssignments,
  getStoredProviders,
} from '../dentists/dentistStore'
import type { Service } from '../services/serviceTypes'
import { getStoredServices } from '../services/serviceStore'
import { isBookingBusy } from './bookingBusyStore'
import { addMinutesToTime, checkScheduleConflict, getOperatories, getScheduleConflictDetail, getStoredAppointments, isBlockingAppointmentStatus } from './appointmentStore'

export type ProviderChoice = Provider & { label: string }

export type AvailabilitySlot = {
  startTime: string
  endTime: string
  providerId: string
  providerName: string
  operatoryId?: string
  operatoryName?: string
  remainingCapacity?: number
}

export type AppointmentAvailabilityStatus =
  | 'missing_context'
  | 'no_eligible_provider'
  | 'branch_closed'
  | 'provider_unavailable'
  | 'capacity_full'
  | 'no_slots'
  | 'ready'

export type AppointmentAvailabilityResult = {
  status: AppointmentAvailabilityStatus
  slots: AvailabilitySlot[]
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

function getBranchCapacity(branchId: string) {
  const activeOperatories = getOperatories().filter((operatory) => operatory.branchId === branchId && operatory.status === 'active')
  const branch = getStoredBranches().find((entry) => entry.id === branchId) as (Branch & { appointmentCapacity?: number; appointment_capacity?: number }) | undefined
  const configuredCapacity = Number(branch?.appointmentCapacity ?? branch?.appointment_capacity ?? 0)
  return {
    activeOperatories,
    capacity: activeOperatories.length || (Number.isFinite(configuredCapacity) && configuredCapacity > 0 ? configuredCapacity : 1),
  }
}

function branchOverlapCount(branchId: string, date: string, startTime: string, endTime: string, excludeAppointmentId?: string) {
  return getStoredAppointments().filter((appointment) =>
    appointment.id !== excludeAppointmentId &&
    appointment.branchId === branchId &&
    appointment.date === date &&
    isBlockingAppointmentStatus(appointment.status) &&
    intervalsOverlap(startTime, endTime, appointment.startTime, appointment.endTime),
  ).length
}

function isBranchSlotOpen({
  branchId,
  date,
  endTime,
  excludeAppointmentId,
  operatoryId,
  startTime,
}: {
  branchId: string
  date: string
  startTime: string
  endTime: string
  operatoryId?: string
  excludeAppointmentId?: string
}) {
  const branch = getActiveBranch(branchId)
  if (!branch) return false
  if (startTime < branch.openingTime || endTime > branch.closingTime) return false

  const { activeOperatories, capacity } = getBranchCapacity(branchId)
  if (activeOperatories.length) {
    const candidateOperatories = operatoryId ? activeOperatories.filter((operatory) => operatory.id === operatoryId) : activeOperatories
    return candidateOperatories.some((operatory) =>
      !checkScheduleConflict(date, startTime, endTime, excludeAppointmentId, undefined, branchId, operatory.id) &&
      !isBookingBusy({ branchId, operatoryId: operatory.id, date, startTime, endTime, excludeAppointmentId }),
    )
  }

  return branchOverlapCount(branchId, date, startTime, endTime, excludeAppointmentId) < capacity
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
  if (!isBranchSlotOpen({ branchId, date, startTime, endTime, excludeAppointmentId, operatoryId })) return false

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

  if (providerId && !providers.length) {
    return { status: 'provider_unavailable', slots: [], eligibleProviderCount: eligibleProviders.length, scheduledProviderCount: 0 }
  }

  const operatories = getBranchCapacity(branchId).activeOperatories
  const candidateOperatories = operatoryId ? operatories.filter((operatory) => operatory.id === operatoryId) : operatories
  const slots: AvailabilitySlot[] = []
  const windowStart = timeToMinutes(branch.openingTime)
  const windowEnd = timeToMinutes(branch.closingTime)

  for (let cursor = windowStart; cursor + service.duration <= windowEnd; cursor += slotIntervalMinutes) {
    const startTime = minutesToTime(cursor)
    const endTime = addMinutesToTime(startTime, service.duration)

    if (!providerId) {
      const availableProviders = providers.filter((provider) =>
        isProviderAvailable({ branchId, providerId: provider.id, date, startTime, endTime, excludeAppointmentId }),
      )
      if (availableProviders.length || isBranchSlotOpen({ branchId, date, startTime, endTime, excludeAppointmentId, operatoryId })) {
        const openOperatory = candidateOperatories.find((operatory) =>
          availableProviders.some((provider) =>
            isProviderAvailable({ branchId, providerId: provider.id, operatoryId: operatory.id, date, startTime, endTime, excludeAppointmentId }),
          ) || isBranchSlotOpen({ branchId, operatoryId: operatory.id, date, startTime, endTime, excludeAppointmentId }),
        )
        slots.push({
          startTime,
          endTime,
          providerId: '',
          providerName: 'Dentist to be assigned',
          operatoryId: openOperatory?.id,
          operatoryName: openOperatory?.name,
          remainingCapacity: availableProviders.length,
        })
      }
      continue
    }

    providers.forEach((provider) => {
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
    })
  }

  const unique = new Map<string, AvailabilitySlot>()
  slots
    .sort((a, b) => `${a.startTime}-${a.providerName}-${a.operatoryName ?? ''}`.localeCompare(`${b.startTime}-${b.providerName}-${b.operatoryName ?? ''}`))
    .forEach((slot) => unique.set(`${slot.startTime}-${slot.providerId ?? 'unassigned'}-${slot.operatoryId ?? 'no-operatory'}`, slot))

  const availableSlots = Array.from(unique.values())
  if (availableSlots.length) {
    return {
      status: 'ready',
      slots: availableSlots,
      eligibleProviderCount: eligibleProviders.length,
      scheduledProviderCount: providerId ? providers.length : eligibleProviders.length,
    }
  }

  return {
    status: 'no_slots',
    slots: [],
    eligibleProviderCount: eligibleProviders.length,
    scheduledProviderCount: providerId ? providers.length : eligibleProviders.length,
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
