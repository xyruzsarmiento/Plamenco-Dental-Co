export type DentalRecordStatus = 'draft' | 'finalized' | 'amended' | 'voided' | 'active' | 'follow_up' | 'completed'
export type DentalVisitType = 'consultation' | 'cleaning' | 'filling' | 'extraction' | 'root_canal' | 'crown' | 'follow_up' | 'other'
export type ClinicalRecordSource = 'native' | 'walk_in' | 'historical_import'

export type DentalRecord = {
  id: string
  patientId: string
  relatedAppointmentId?: string
  appointmentNumber?: string
  branchId?: string
  providerId?: string
  providerNameSnapshot?: string
  recordDate: string
  visitType: DentalVisitType
  chiefComplaint: string
  clinicalFindings: string
  assessment: string
  treatmentPerformed: string
  recommendations: string
  patientVisibleSummary: string
  findings: string
  diagnosis: string
  treatmentPlan: string
  treatmentNotes: string
  clinicalNotes: string
  followUpRequired: boolean
  followUpDate: string
  followUpNotes: string
  status: DentalRecordStatus
  source: ClinicalRecordSource
  historicalProviderText?: string
  finalizedAt?: string
  finalizedBy?: string
  lastUpdatedBy: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type DentalRecordFormValues = Omit<DentalRecord, 'id' | 'createdAt' | 'updatedAt'>

export type ClinicalRecordAmendment = {
  id: string
  dentalRecordId: string
  patientId: string
  providerId?: string
  amendmentText: string
  reason: string
  author: string
  createdAt: string
}

export type ClinicalRecordAmendmentFormValues = Pick<ClinicalRecordAmendment, 'amendmentText' | 'reason' | 'author' | 'providerId'>
