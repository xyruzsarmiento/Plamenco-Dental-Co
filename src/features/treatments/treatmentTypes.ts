export type TreatmentStatus = 'planned' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'voided'

export type Treatment = {
  id: string
  patientId: string
  dentalRecordId?: string
  appointmentId?: string
  appointmentNumber?: string
  branchId?: string
  providerId?: string
  providerNameSnapshot?: string
  serviceId: string
  serviceNameSnapshot?: string
  toothNumber?: number
  description: string
  cost: number
  priceSnapshotCents: number
  quantity: number
  status: TreatmentStatus
  treatmentDate: string
  notes: string
  performedBy: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type TreatmentPlan = {
  id: string
  patientId: string
  planNumber?: string
  branchId?: string
  providerId?: string
  providerNameSnapshot?: string
  clinicalVisitId?: string
  name: string
  description: string
  treatments: string[]
  overallCost: number
  amountPaid: number
  versionNumber?: number
  patientNotes?: string
  internalNotes?: string
  quotedSubtotalCents?: number
  discountCents?: number
  quotedTotalCents?: number
  presentedAt?: string
  decisionAt?: string
  decisionSource?: string
  status: TreatmentStatus
  createdAt: string
  updatedAt: string
}

export type TreatmentFormValues = Omit<Treatment, 'id' | 'createdAt' | 'updatedAt'>
export type TreatmentPlanFormValues = Omit<TreatmentPlan, 'id' | 'createdAt' | 'updatedAt'>
