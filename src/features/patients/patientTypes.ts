export type PatientSex = 'female' | 'male' | 'other' | 'prefer_not_to_say'
export type PatientStatus = 'active' | 'inactive'
export type PatientOrigin = 'online_registration' | 'walk_in' | 'historical_import' | 'staff_created'

export type Patient = {
  id: string
  patientId: string
  authUserId?: string
  firstName: string
  middleName: string
  lastName: string
  fullName?: string
  dateOfBirth: string
  sex: PatientSex
  phone: string
  email: string
  address: string
  city?: string
  province?: string
  emergencyContact: string
  emergencyContactPhone: string
  emergencyContactRelationship?: string
  preferredBranchId?: string
  origin?: PatientOrigin
  registrationDate: string
  status: PatientStatus
  allergies: string
  medicalConditions: string
  currentMedications: string
  previousSurgeries: string
  medicalNotes: string
  administrativeNotes?: string
  importBatchId?: string
  importSourceRow?: number
  originalImportedName?: string
  profileImage?: string
  createdAt: string
  updatedAt: string
}

export type PatientFormValues = Omit<Patient, 'id' | 'patientId' | 'createdAt' | 'updatedAt'>

export type PatientFormMode = 'add' | 'edit'

export type PatientSortKey = 'name' | 'patientId' | 'registrationDate' | 'status'
export type SortDirection = 'asc' | 'desc'
