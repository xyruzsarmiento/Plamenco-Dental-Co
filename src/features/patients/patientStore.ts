import type { Patient, PatientFormValues } from './patientTypes'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { supabase } from '../../lib/supabase'
import { insertRemoteTableRow, updateRemoteTableRow, deleteRemoteTableRow } from '../../lib/supabaseSync'

const PATIENT_STORAGE_KEY = 'plamenco.patients'

// Real patient data should come from the app's registration flow and Supabase sync.
const seedPatients: Patient[] = []

function safeParsePatients(value: string | null): Patient[] | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Patient[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function generateUUID() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export function normalizePatientEmail(email: string) {
  return email.trim().toLowerCase()
}

export function getStoredPatients(): Patient[] {
  const stored = safeParsePatients(window.localStorage.getItem(PATIENT_STORAGE_KEY))

  if (stored?.length) {
    return stored
  }

  window.localStorage.setItem(PATIENT_STORAGE_KEY, JSON.stringify(seedPatients))
  return seedPatients
}

export function saveStoredPatients(patients: Patient[]) {
  window.localStorage.setItem(PATIENT_STORAGE_KEY, JSON.stringify(patients))
}

export function getPatientById(id: string) {
  return getStoredPatients().find((patient) => patient.id === id)
}

export function getPatientByPatientId(patientId: string) {
  return getStoredPatients().find((patient) => patient.patientId === patientId)
}

export function mapSupabasePatientRow(row: Record<string, any>): Patient {
  return {
    id: row.id,
    patientId: row.patient_id,
    firstName: row.first_name ?? '',
    middleName: row.middle_name ?? '',
    lastName: row.last_name ?? '',
    dateOfBirth: row.date_of_birth ?? '',
    sex: row.sex ?? 'prefer_not_to_say',
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    emergencyContact: row.emergency_contact ?? '',
    emergencyContactPhone: row.emergency_contact_phone ?? '',
    emergencyContactRelationship: row.emergency_contact_relationship ?? '',
    registrationDate: row.registration_date ?? '',
    status: row.status ?? 'active',
    allergies: row.allergies ?? '',
    medicalConditions: row.medical_conditions ?? '',
    currentMedications: row.current_medications ?? '',
    previousSurgeries: row.previous_surgeries ?? '',
    medicalNotes: row.medical_notes ?? '',
    profileImage: row.profile_image ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }
}

export async function getCurrentPatientForAuthenticatedUser(userId: string): Promise<Patient | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (error) {
    const message = String(error.message ?? '')
    if (message.toLowerCase().includes('auth_user_id') && message.toLowerCase().includes('does not exist')) {
      throw new Error('Supabase patients table is missing the required auth_user_id column. Apply the migration in supabase/migrations before accessing the patient portal.')
    }

    throw error
  }

  return data ? mapSupabasePatientRow(data) : null
}

export function findPatientByEmail(email: string) {
  const normalizedEmail = normalizePatientEmail(email)
  return getStoredPatients().find((patient) => normalizePatientEmail(patient.email) === normalizedEmail)
}

export function generatePatientId(patients: Patient[]) {
  const highest = patients.reduce((max, patient) => {
    const numericId = Number(patient.patientId.replace('PT-', ''))
    return Number.isFinite(numericId) ? Math.max(max, numericId) : max
  }, 0)

  return `PT-${String(highest + 1).padStart(6, '0')}`
}

export function createPatient(values: PatientFormValues): Patient {
  const patients = getStoredPatients()
  const now = new Date().toISOString()

  const patient: Patient = {
    id: generateUUID(),
    patientId: generatePatientId(patients),
    ...values,
    email: normalizePatientEmail(values.email),
    profileImage: values.profileImage ?? '',
    createdAt: now,
    updatedAt: now,
  }

  const nextPatients = [...patients, patient]
  saveStoredPatients(nextPatients)
  
  // Persist to Supabase asynchronously
  void insertRemoteTableRow('patients', {
    id: patient.id,
    patient_id: patient.patientId,
    first_name: patient.firstName,
    middle_name: patient.middleName,
    last_name: patient.lastName,
    date_of_birth: patient.dateOfBirth,
    sex: patient.sex,
    phone: patient.phone,
    email: patient.email,
    address: patient.address,
    emergency_contact: patient.emergencyContact,
    emergency_contact_phone: patient.emergencyContactPhone,
    emergency_contact_relationship: patient.emergencyContactRelationship ?? '',
    registration_date: patient.registrationDate,
    status: patient.status,
    allergies: patient.allergies,
    medical_conditions: patient.medicalConditions,
    current_medications: patient.currentMedications,
    previous_surgeries: patient.previousSurgeries,
    medical_notes: patient.medicalNotes,
    profile_image: patient.profileImage ?? '',
  })
  
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'patient_created',
    entity: 'patient',
    entityId: patient.patientId,
    metadata: { patientId: patient.patientId, createdAt: patient.createdAt },
  })
  return patient
}

export function updatePatient(id: string, values: PatientFormValues): Patient | null {
  const patients = getStoredPatients()
  const index = patients.findIndex((p) => p.id === id)

  if (index === -1) {
    return null
  }

  const now = new Date().toISOString()
  const updated: Patient = {
    ...patients[index],
    ...values,
    email: normalizePatientEmail(values.email),
    profileImage: values.profileImage ?? patients[index].profileImage ?? '',
    emergencyContactRelationship: values.emergencyContactRelationship ?? patients[index].emergencyContactRelationship ?? '',
    updatedAt: now,
  }

  const nextPatients = patients.map((patient) => (patient.id === id ? updated : patient))
  saveStoredPatients(nextPatients)
  
  // Persist to Supabase asynchronously
  void updateRemoteTableRow('patients', id, {
    first_name: updated.firstName,
    middle_name: updated.middleName,
    last_name: updated.lastName,
    date_of_birth: updated.dateOfBirth,
    sex: updated.sex,
    phone: updated.phone,
    email: updated.email,
    address: updated.address,
    emergency_contact: updated.emergencyContact,
    emergency_contact_phone: updated.emergencyContactPhone,
    emergency_contact_relationship: updated.emergencyContactRelationship ?? '',
    registration_date: updated.registrationDate,
    status: updated.status,
    allergies: updated.allergies,
    medical_conditions: updated.medicalConditions,
    current_medications: updated.currentMedications,
    previous_surgeries: updated.previousSurgeries,
    medical_notes: updated.medicalNotes,
    profile_image: updated.profileImage ?? '',
  })
  
  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'patient_updated',
    entity: 'patient',
    entityId: updated.patientId,
    metadata: { patientId: updated.patientId, updatedAt: updated.updatedAt },
  })
  return updated
}

export function deletePatient(id: string): boolean {
  const patients = getStoredPatients()
  const index = patients.findIndex((p) => p.id === id)
  
  if (index === -1) {
    return false
  }
  
  patients.splice(index, 1)
  saveStoredPatients(patients)
  
  // Delete from Supabase asynchronously
  void deleteRemoteTableRow('patients', id)
  
  return true
}

export function searchPatients(query: string): Patient[] {
  if (!query.trim()) {
    return getStoredPatients()
  }
  
  const lower = query.toLowerCase()
  return getStoredPatients().filter((patient) => {
    return (
      patient.firstName.toLowerCase().includes(lower) ||
      patient.middleName.toLowerCase().includes(lower) ||
      patient.lastName.toLowerCase().includes(lower) ||
      patient.patientId.toLowerCase().includes(lower) ||
      patient.phone.includes(query) ||
      patient.email.toLowerCase().includes(lower)
    )
  })
}

export function filterPatients(patients: Patient[], filters: { status?: string }): Patient[] {
  let result = patients
  
  if (filters.status) {
    result = result.filter((p) => p.status === filters.status)
  }
  
  return result
}

export type SortKey = 'name' | 'patientId' | 'registrationDate' | 'status' | 'dateOfBirth'

export function sortPatients(patients: Patient[], key: SortKey, direction: 'asc' | 'desc'): Patient[] {
  const sorted = [...patients]
  
  sorted.sort((a, b) => {
    let aVal: string | number
    let bVal: string | number
    
    switch (key) {
      case 'name':
        aVal = `${a.firstName} ${a.lastName}`.toLowerCase()
        bVal = `${b.firstName} ${b.lastName}`.toLowerCase()
        break
      case 'patientId':
        aVal = a.patientId
        bVal = b.patientId
        break
      case 'registrationDate':
        aVal = new Date(a.registrationDate).getTime()
        bVal = new Date(b.registrationDate).getTime()
        break
      case 'dateOfBirth':
        aVal = new Date(a.dateOfBirth).getTime()
        bVal = new Date(b.dateOfBirth).getTime()
        break
      case 'status':
        aVal = a.status
        bVal = b.status
        break
      default:
        return 0
    }
    
    if (typeof aVal === 'string') {
      return direction === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal)
    }
    
    return direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
  })
  
  return sorted
}

export function paginatePatients(patients: Patient[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize
  const end = start + pageSize
  return {
    items: patients.slice(start, end),
    total: patients.length,
    totalPages: Math.ceil(patients.length / pageSize),
    currentPage: page,
    pageSize,
  }
}

export { PATIENT_STORAGE_KEY }
