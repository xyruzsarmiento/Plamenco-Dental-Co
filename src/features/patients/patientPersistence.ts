import { supabase } from '../../lib/supabase'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import type { Patient, PatientFormValues } from './patientTypes'
import {
  getPatientDisplayName,
  getStoredPatients,
  mapSupabasePatientRow,
  normalizePatientEmail,
  normalizePatientPhone,
  saveStoredPatients,
} from './patientStore'

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

function buildPatient(values: PatientFormValues & { patientId?: string }, patientId = '', id = ''): Patient {
  const now = new Date().toISOString()
  return {
    id,
    ...values,
    patientId,
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
}

function replaceCachedPatient(confirmed: Patient) {
  const cached = getStoredPatients().filter(
    (entry) => entry.id !== confirmed.id && entry.patientId !== confirmed.patientId,
  )
  saveStoredPatients([confirmed, ...cached])
}

function userFacingDatabaseError(prefix: string, cause: { message?: string } | null | undefined) {
  if (import.meta.env.DEV && cause?.message) {
    console.error(`[patient persistence] ${prefix}`, cause)
  }
  return new Error(prefix)
}

export async function loadPatientsFromSupabase(options: { strict?: boolean } = {}): Promise<Patient[]> {
  if (!supabase) {
    if (options.strict) throw new Error('Clinic database is not configured. Unable to load patient records.')
    return getStoredPatients()
  }

  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    if (options.strict) throw userFacingDatabaseError('Unable to load patient records from the clinic database.', error)
    return getStoredPatients()
  }

  const patients = (data ?? []).map((row) => mapSupabasePatientRow(row as Record<string, unknown>))
  saveStoredPatients(patients)
  return patients
}

export async function createPatientPersisted(values: PatientFormValues & { patientId?: string }): Promise<Patient> {
  if (!supabase) throw new Error('Clinic database is not configured. Patient records cannot be saved safely.')

  const requestedPatientId = values.patientId?.trim() ?? ''
  const draft = buildPatient(values, requestedPatientId)
  const remoteRow = mapPatientToRemoteRow(draft) as Record<string, unknown>

  // PostgreSQL owns the durable UUID and, unless explicitly supplied for a
  // controlled import, the PT-xxxxxx patient number.
  delete remoteRow.id
  if (!requestedPatientId) delete remoteRow.patient_id

  const { data, error } = await supabase
    .from('patients')
    .insert(remoteRow)
    .select('*')
    .single()

  if (error || !data) {
    throw userFacingDatabaseError('Unable to save the patient. Your changes were not submitted.', error)
  }

  const confirmed = mapSupabasePatientRow(data as Record<string, unknown>)
  replaceCachedPatient(confirmed)

  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'patient_created',
    entity: 'patient',
    entityId: confirmed.patientId,
    metadata: { patientId: confirmed.patientId, createdAt: confirmed.createdAt },
  })

  return confirmed
}

export async function updatePatientPersisted(id: string, values: PatientFormValues): Promise<Patient> {
  if (!supabase) throw new Error('Clinic database is not configured. Patient changes cannot be saved safely.')

  let current = getStoredPatients().find((patient) => patient.id === id)
  if (!current) {
    const { data, error } = await supabase.from('patients').select('*').eq('id', id).maybeSingle()
    if (error) throw userFacingDatabaseError('Unable to load the patient before saving changes.', error)
    if (!data) throw new Error('Patient record was not found.')
    current = mapSupabasePatientRow(data as Record<string, unknown>)
  }

  const candidate: Patient = {
    ...current,
    ...values,
    id: current.id,
    patientId: current.patientId,
    authUserId: current.authUserId,
    fullName: values.fullName ?? [values.firstName, values.middleName, values.lastName].filter(Boolean).join(' '),
    email: normalizePatientEmail(values.email ?? ''),
    phone: normalizePatientPhone(values.phone),
    profileImage: values.profileImage ?? current.profileImage ?? '',
    emergencyContactRelationship: values.emergencyContactRelationship ?? current.emergencyContactRelationship ?? '',
    city: values.city ?? '',
    province: values.province ?? '',
    preferredBranchId: values.preferredBranchId ?? '',
    origin: values.origin ?? current.origin ?? 'staff_created',
    administrativeNotes: values.administrativeNotes ?? '',
    updatedAt: current.updatedAt,
  }

  const remoteRow = mapPatientToRemoteRow(candidate) as Record<string, unknown>
  delete remoteRow.id
  delete remoteRow.patient_id
  delete remoteRow.auth_user_id

  const { data, error } = await supabase
    .from('patients')
    .update(remoteRow)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) {
    throw userFacingDatabaseError('Unable to save the patient. Your changes were not submitted.', error)
  }

  const confirmed = mapSupabasePatientRow(data as Record<string, unknown>)
  replaceCachedPatient(confirmed)

  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'patient_updated',
    entity: 'patient',
    entityId: confirmed.patientId,
    metadata: { patientId: confirmed.patientId, updatedAt: confirmed.updatedAt },
  })

  return confirmed
}

export async function archivePatientPersisted(id: string): Promise<Patient> {
  if (!supabase) throw new Error('Clinic database is not configured. Patient archival cannot be saved safely.')

  const { data, error } = await supabase
    .from('patients')
    .update({ status: 'inactive' })
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) {
    throw userFacingDatabaseError('Unable to archive the patient. No records were removed or changed locally.', error)
  }

  const confirmed = mapSupabasePatientRow(data as Record<string, unknown>)
  replaceCachedPatient(confirmed)

  recordAuditEntry({
    user: getCurrentSessionUserName(),
    action: 'patient_archived',
    entity: 'patient',
    entityId: confirmed.patientId,
    metadata: { patientId: confirmed.patientId, archivedAt: (data as Record<string, unknown>).archived_at ?? confirmed.updatedAt },
  })

  return confirmed
}

export type PatientSelfServiceProfileUpdate = {
  firstName: string
  middleName: string
  lastName: string
  dateOfBirth: string
  email: string
  phone: string
  address: string
  emergencyContact: string
  emergencyContactPhone: string
  emergencyContactRelationship: string
  profileImage?: string
}

export async function updateMyPatientProfilePersisted(values: PatientSelfServiceProfileUpdate): Promise<Patient> {
  if (!supabase) throw new Error('Clinic database is not configured. Profile changes cannot be saved safely.')

  const { data: authData, error: authError } = await supabase.auth.getUser()
  const authUser = authData.user
  if (authError || !authUser) throw new Error('Your session is no longer valid. Please sign in again.')

  const fullName = [values.firstName, values.middleName, values.lastName].filter(Boolean).join(' ').trim()
  const { data, error } = await supabase
    .from('patients')
    .update({
      first_name: values.firstName.trim(),
      middle_name: values.middleName.trim(),
      last_name: values.lastName.trim(),
      full_name: fullName,
      date_of_birth: values.dateOfBirth || null,
      email: normalizePatientEmail(values.email),
      phone: normalizePatientPhone(values.phone),
      address: values.address.trim(),
      emergency_contact: values.emergencyContact.trim(),
      emergency_contact_phone: values.emergencyContactPhone.trim(),
      emergency_contact_relationship: values.emergencyContactRelationship.trim(),
      ...(values.profileImage !== undefined ? { profile_image: values.profileImage } : {}),
    })
    .eq('auth_user_id', authUser.id)
    .select('*')
    .single()

  if (error || !data) {
    throw userFacingDatabaseError('Unable to save your profile. Your changes were not submitted.', error)
  }

  const confirmed = mapSupabasePatientRow(data as Record<string, unknown>)
  replaceCachedPatient(confirmed)
  return confirmed
}
