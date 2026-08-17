export type TreatmentStatus = 'planned' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export type Treatment = {
  id: string
  patientId: string
  dentalRecordId?: string
  serviceId: string
  toothNumber?: number
  description: string
  cost: number
  status: TreatmentStatus
  treatmentDate: string
  notes: string
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
