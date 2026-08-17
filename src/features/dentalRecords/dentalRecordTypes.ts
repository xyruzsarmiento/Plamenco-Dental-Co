export type DentalRecordStatus = 'draft' | 'active' | 'follow_up' | 'completed'
export type DentalVisitType = 'consultation' | 'cleaning' | 'filling' | 'extraction' | 'root_canal' | 'crown' | 'follow_up' | 'other'

export type DentalRecord = {
  id: string
  patientId: string
  recordDate: string
  visitType: DentalVisitType
  chiefComplaint: string
  diagnosis: string
  treatmentPlan: string
  findings: string
  treatmentNotes: string
  followUpDate: string
  status: DentalRecordStatus
  relatedAppointmentId?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type DentalRecordFormValues = Omit<DentalRecord, 'id' | 'createdAt' | 'updatedAt'>
