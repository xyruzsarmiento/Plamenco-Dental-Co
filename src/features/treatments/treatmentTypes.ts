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
  name: string
  description: string
  treatments: string[]
  overallCost: number
  amountPaid: number
  status: TreatmentStatus
  createdAt: string
  updatedAt: string
}

export type TreatmentFormValues = Omit<Treatment, 'id' | 'createdAt' | 'updatedAt'>
export type TreatmentPlanFormValues = Omit<TreatmentPlan, 'id' | 'createdAt' | 'updatedAt'>
