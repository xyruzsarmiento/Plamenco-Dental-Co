export type PatientSex = 'female' | 'male' | 'other' | 'prefer_not_to_say'
export type PatientStatus = 'active' | 'inactive'

export type Patient = {
  id: string
  patientId: string
  firstName: string
  middleName: string
  lastName: string
  dateOfBirth: string
  sex: PatientSex
  phone: string
  email: string
  address: string
  emergencyContact: string
  emergencyContactPhone: string
  emergencyContactRelationship?: string
  registrationDate: string
  status: PatientStatus
  allergies: string
  medicalConditions: string
  currentMedications: string
  previousSurgeries: string
  medicalNotes: string
  profileImage?: string
  createdAt: string
  updatedAt: string
}

export type PatientFormValues = Omit<Patient, 'id' | 'patientId' | 'createdAt' | 'updatedAt'>

export type PatientFormMode = 'add' | 'edit'

export type PatientSortKey = 'name' | 'patientId' | 'registrationDate' | 'status'
export type SortDirection = 'asc' | 'desc'
