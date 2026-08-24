export type UserRole = 'super_admin' | 'dentist' | 'associate_dentist' | 'staff' | 'patient'

export type AccountStatus = 'active' | 'inactive' | 'suspended'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: UserRole
  status?: AccountStatus
  permissions?: string[]
  patientId?: string
  avatarUrl?: string
}

export type StaffStatus = 'active' | 'inactive'

export type StaffMember = {
  id: string
  name: string
  email: string
  phone: string
  position: string
  role: Exclude<UserRole, 'patient'>
  status: StaffStatus
  password: string
  createdAt: string
  updatedAt: string
}
