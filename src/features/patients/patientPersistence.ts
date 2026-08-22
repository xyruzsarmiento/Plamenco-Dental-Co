import { createUuid } from '../../lib/id'
import { supabase } from '../../lib/supabase'
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

function numericPatientSequence(patientId: string) {
  const match = /^PT-(\d+)$/.exec(patientId.trim())
  return match ? Number(match[1]) : null
}

async function getNextPatientId() {
  if (!supabase) throw new Error('Clinic database is not configured. Patient records cannot be saved safely.')

  const { data, error } = await supabase.from('patients').select('patient_id')
  if (error) throw new Error(`Unable to generate a patient number: ${error.message}`)

  const highest = (data ?? []).reduce((max, row) => {
    const sequence = numericPatientSequence(String(row.patient_id ?? ''))
    return sequence == null || !Number.isFinite(sequence) ? max : Math.max(max, sequence)
  }, 0)

  return `PT-${String(highest + 1).padStart(6, '0')}`
}

function buildPatient(values: PatientFormValues & { patientId?: string }, patientId: string): Patient {
  const now = new Date().toISOString()
  return {
    id: createUuid(),
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
    if (options.strict) throw new Error(`Unable to load patient records from the clinic database: ${error.message}`)
    return getStoredPatients()
  }

  const patients = (data ?? []).map((row) => mapSupabasePatientRow(row as Record<string, unknown>))
  saveStoredPatients(patients)
  return patients
}

export async function createPatientPersisted(values: PatientFormValues & { patientId?: string }): Promise<Patient> {
  if (!supabase) throw new Error('Clinic database is not configured. Patient records cannot be saved safely.')

  let requestedPatientId = values.patientId?.trim() || await getNextPatientId()
  let lastError: { code?: string; message?: string } | null = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const patient = buildPatient(values, requestedPatientId)
    const { data, error } = await supabase
      .from('patients')
      .insert(mapPatientToRemoteRow(patient))
      .select('*')
      .single()

    if (!error && data) {
      const confirmed = mapSupabasePatientRow(data as Record<string, unknown>)
      const cached = getStoredPatients().filter((entry) => entry.id !== confirmed.id && entry.patientId !== confirmed.patientId)
      saveStoredPatients([confirmed, ...cached])
      return confirmed
    }

    lastError = error
    const duplicatePatientNumber = error?.code === '23505' && String(error.message ?? '').includes('patient_id')
    if (!values.patientId?.trim() && duplicatePatientNumber) {
      requestedPatientId = await getNextPatientId()
      continue
    }
    break
  }

  throw new Error(`Patient was not saved to Supabase${lastError?.message ? `: ${lastError.message}` : '.'}`)
}
