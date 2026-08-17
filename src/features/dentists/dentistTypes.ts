import type { UserRole } from '../auth/authTypes'

export type ProviderRole = Extract<UserRole, 'dentist' | 'associate_dentist'>
export type ProviderStatus = 'active' | 'inactive' | 'on_leave'
export type AssignmentStatus = 'active' | 'inactive'
export type ScheduleStatus = 'active' | 'inactive'
export type AvailabilityOverrideType = 'available' | 'unavailable' | 'special_hours' | 'leave'

export type Provider = {
  id: string
  profileId?: string
  displayName: string
  role: ProviderRole
  email: string
  phone: string
  specialization: string
  licenseNumber: string
  bio: string
  photoUrl: string
  status: ProviderStatus
  createdAt: string
  updatedAt: string
}

export type ProviderBranchAssignment = {
  id: string
  providerId: string
  branchId: string
  isPrimary: boolean
  status: AssignmentStatus
  createdAt: string
  updatedAt: string
}

export type ProviderScheduleBlock = {
  id: string
  providerId: string
  branchId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  status: ScheduleStatus
  createdAt: string
  updatedAt: string
}

export type ProviderAvailabilityOverride = {
  id: string
  providerId: string
  branchId?: string
  date: string
  type: AvailabilityOverrideType
  startTime?: string
  endTime?: string
  reason: string
  privateNotes: string
  createdAt: string
  updatedAt: string
}

export type ProviderFormValues = Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>
