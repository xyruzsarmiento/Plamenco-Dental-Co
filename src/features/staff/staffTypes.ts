import type { StaffMember, StaffStatus, UserRole } from '../auth/authTypes'

export type StaffFormValues = {
  name: string
  email: string
  phone: string
  position: string
  role: Exclude<UserRole, 'patient'>
  status: StaffStatus
  password: string
}

export type StaffFormMode = 'add' | 'edit'

export type { StaffMember, StaffStatus, UserRole }
