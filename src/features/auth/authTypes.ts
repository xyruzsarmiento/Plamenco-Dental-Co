export type UserRole = 'admin' | 'staff' | 'patient'

export type AuthUser = {
  id: string
  name: string
  email: string
  role: UserRole
  patientId?: string
}

export type StaffStatus = 'active' | 'inactive'

export type StaffMember = {
  id: string
  name: string
  email: string
  phone: string
  position: string
  role: UserRole
  status: StaffStatus
  password: string
  createdAt: string
  updatedAt: string
}
