import { supabase } from '../../lib/supabase'

const DENTAL_RECORD_STORAGE_KEY = 'plamenco.dentalRecords'

type PatientVisibleDentalRecordRow = {
  id: string
  patient_id: string
  record_date?: string | null
  visit_type?: string | null
  chief_complaint?: string | null
  diagnosis?: string | null
  treatment_plan?: string | null
  findings?: string | null
  treatment_notes?: string | null
  follow_up_date?: string | null
  status?: string | null
  related_appointment_id?: string | null
  created_by?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export async function loadPatientVisibleDentalRecords() {
  if (!supabase || typeof window === 'undefined') return []

  const { data, error } = await supabase.rpc('get_my_patient_visible_dental_records')
  if (error) throw new Error(`Unable to load patient-visible dental records: ${error.message}`)

  const records = ((data ?? []) as PatientVisibleDentalRecordRow[]).map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    recordDate: row.record_date ?? '',
    visitType: row.visit_type ?? 'consultation',
    chiefComplaint: row.chief_complaint ?? 'Dental visit summary',
    diagnosis: '',
    treatmentPlan: '',
    findings: '',
    treatmentNotes: '',
    clinicalFindings: '',
    assessment: '',
    treatmentPerformed: '',
    recommendations: row.chief_complaint ?? '',
    patientVisibleSummary: row.chief_complaint ?? '',
    clinicalNotes: '',
    followUpRequired: Boolean(row.follow_up_date),
    followUpDate: row.follow_up_date ?? '',
    followUpNotes: '',
    status: row.status ?? 'finalized',
    relatedAppointmentId: row.related_appointment_id ?? undefined,
    source: 'native',
    createdBy: row.created_by ?? '',
    lastUpdatedBy: '',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }))

  window.localStorage.setItem(DENTAL_RECORD_STORAGE_KEY, JSON.stringify(records))
  window.dispatchEvent(new CustomEvent('plamenco:dental-records-updated'))
  return records
}
