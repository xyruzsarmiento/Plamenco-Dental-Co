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
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function normalizePatientEmail(email: string) {
  return email.trim().toLowerCase()
}

export function normalizePatientPhone(phone: string) {
  return phone.replace(/[^\d+]/g, '').trim()
}

function normalizeComparable(value: string | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function getPatientDisplayName(patient: Pick<Patient, 'firstName' | 'middleName' | 'lastName' | 'fullName'>) {
  const structuredName = [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ').trim()
  return structuredName || patient.fullName || 'Unnamed patient'
}

function mapPatientToRemoteRow(patient: Patient) {
  return {
    id: patient.id,
    patient_id: patient.patientId,
    auth_user_id: patient.authUserId || null,
    first_name: patient.firstName,
    middle_name: patient.middleName,
    last_name: patient.lastName,
    full_name: patient.fullName ?? getPatientDisplayName(patient),
    date_of_birth: patient.dateOfBirth || null,
    sex: patient.sex,
    phone: patient.phone,
    email: patient.email,
    address: patient.address,
    city: patient.city ?? '',
    province: patient.province ?? '',
    emergency_contact: patient.emergencyContact,
    emergency_contact_phone: patient.emergencyContactPhone,
    emergency_contact_relationship: patient.emergencyContactRelationship ?? '',
    preferred_branch_id: patient.preferredBranchId || null,
    origin: patient.origin ?? 'staff_created',
    registration_date: patient.registrationDate,
    status: patient.status,
    allergies: patient.allergies,
    medical_conditions: patient.medicalConditions,
    current_medications: patient.currentMedications,
    previous_surgeries: patient.previousSurgeries,
    medical_notes: patient.medicalNotes,
    administrative_notes: patient.administrativeNotes ?? '',
    import_batch_id: patient.importBatchId || null,
    import_source_row: patient.importSourceRow ?? null,
    original_imported_name: patient.originalImportedName ?? '',
    profile_image: patient.profileImage ?? '',
  }
}

export function getStoredPatients(): Patient[] {
  const stored = safeParsePatients(window.localStorage.getItem(PATIENT_STORAGE_KEY))

  if (stored?.length) {
    return stored.map((patient) => ({
      ...patient,
      origin: patient.origin ?? (patient.authUserId ? 'online_registration' : 'staff_created'),
    }))
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
    authUserId: row.auth_user_id ?? undefined,
    firstName: row.first_name ?? '',
    middleName: row.middle_name ?? '',
    lastName: row.last_name ?? '',
    fullName: row.full_name ?? '',
    dateOfBirth: row.date_of_birth ?? '',
    sex: row.sex ?? 'prefer_not_to_say',
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    province: row.province ?? '',
    emergencyContact: row.emergency_contact ?? '',
    emergencyContactPhone: row.emergency_contact_phone ?? '',
    emergencyContactRelationship: row.emergency_contact_relationship ?? '',
    preferredBranchId: row.preferred_branch_id ?? '',
    origin: row.origin ?? (row.auth_user_id ? 'online_registration' : 'staff_created'),
    registrationDate: row.registration_date ?? '',
    status: row.status ?? 'active',
    allergies: row.allergies ?? '',
    medicalConditions: row.medical_conditions ?? '',
    currentMedications: row.current_medications ?? '',
    previousSurgeries: row.previous_surgeries ?? '',
    medicalNotes: row.medical_notes ?? '',
    administrativeNotes: row.administrative_notes ?? '',
    importBatchId: row.import_batch_id ?? undefined,
    importSourceRow: row.import_source_row ?? undefined,
    originalImportedName: row.original_imported_name ?? '',
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
  if (!normalizedEmail) return undefined
  return getStoredPatients().find((patient) => normalizePatientEmail(patient.email) === normalizedEmail)
}

export function generatePatientId(patients: Patient[]) {
  const highest = patients.reduce((max, patient) => {
    const numericId = Number(patient.patientId.replace('PT-', ''))
    return Number.isFinite(numericId) ? Math.max(max, numericId) : max
  }, 0)

  return `PT-${String(highest + 1).padStart(6, '0')}`
}

export type DuplicateSignal =
  | 'patient_number'
  | 'email'
  | 'phone'
  | 'name_dob'
  | 'name_phone'
  | 'full_name_dob'

export type PotentialPatientDuplicate = {
  patient: Patient
  signals: DuplicateSignal[]
}

export function findPotentialPatientDuplicates(
  values: Partial<PatientFormValues> & { patientId?: string },
  candidates = getStoredPatients(),
): PotentialPatientDuplicate[] {
  const email = normalizePatientEmail(values.email ?? '')
  const phone = normalizePatientPhone(values.phone ?? '')
  const patientNumber = normalizeComparable(values.patientId)
  const firstName = normalizeComparable(values.firstName)
  const lastName = normalizeComparable(values.lastName)
  const fullName = normalizeComparable(values.fullName)
  const dateOfBirth = values.dateOfBirth ?? ''

  return candidates
    .map((patient) => {
      const signals: DuplicateSignal[] = []
      const existingEmail = normalizePatientEmail(patient.email)
      const existingPhone = normalizePatientPhone(patient.phone)
      const existingFirstName = normalizeComparable(patient.firstName)
      const existingLastName = normalizeComparable(patient.lastName)
      const existingFullName = normalizeComparable(getPatientDisplayName(patient))

      if (patientNumber && normalizeComparable(patient.patientId) === patientNumber) signals.push('patient_number')
      if (email && existingEmail === email) signals.push('email')
      if (phone && existingPhone === phone) signals.push('phone')
      if (firstName && lastName && dateOfBirth && existingFirstName === firstName && existingLastName === lastName && patient.dateOfBirth === dateOfBirth) signals.push('name_dob')
      if (firstName && lastName && phone && existingFirstName === firstName && existingLastName === lastName && existingPhone === phone) signals.push('name_phone')
      if (fullName && dateOfBirth && existingFullName === fullName && patient.dateOfBirth === dateOfBirth) signals.push('full_name_dob')

      return signals.length ? { patient, signals } : null
    })
    .filter((match): match is PotentialPatientDuplicate => Boolean(match))
}

export function createPatient(values: PatientFormValues & { patientId?: string }): Patient {
  const patients = getStoredPatients()
  const now = new Date().toISOString()

  const patient: Patient = {
    id: generateUUID(),
    patientId: values.patientId?.trim() || generatePatientId(patients),
    ...values,
    authUserId: values.authUserId ?? undefined,
    fullName: values.fullName ?? [values.firstName, values.middleName, values.lastName].filter(Boolean).join(' '),
    email: normalizePatientEmail(values.email ?? ''),
    phone: normalizePatientPhone(values.phone),
    city: values.city ?? '',
    province: values.province ?? '',
    preferredBranchId: values.preferredBranchId ?? '',
    origin: values.origin ?? 'staff_created',
    administrativeNotes: values.administrativeNotes ?? '',
    importBatchId: values.importBatchId,
    importSourceRow: values.importSourceRow,
    originalImportedName: values.originalImportedName ?? '',
    profileImage: values.profileImage ?? '',
    createdAt: now,
    updatedAt: now,
  }

  const nextPatients = [...patients, patient]
  saveStoredPatients(nextPatients)

  void insertRemoteTableRow('patients', mapPatientToRemoteRow(patient))

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
    fullName: values.fullName ?? [values.firstName, values.middleName, values.lastName].filter(Boolean).join(' '),
    email: normalizePatientEmail(values.email ?? ''),
    phone: normalizePatientPhone(values.phone),
    profileImage: values.profileImage ?? patients[index].profileImage ?? '',
    emergencyContactRelationship: values.emergencyContactRelationship ?? patients[index].emergencyContactRelationship ?? '',
    city: values.city ?? '',
    province: values.province ?? '',
    preferredBranchId: values.preferredBranchId ?? '',
    origin: values.origin ?? patients[index].origin ?? 'staff_created',
    administrativeNotes: values.administrativeNotes ?? '',
    updatedAt: now,
  }

  const nextPatients = patients.map((patient) => (patient.id === id ? updated : patient))
  saveStoredPatients(nextPatients)

  void updateRemoteTableRow('patients', id, mapPatientToRemoteRow(updated))

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
