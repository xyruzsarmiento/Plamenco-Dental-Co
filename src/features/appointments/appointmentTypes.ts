export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'checked_in'
  | 'waiting'
  | 'in_progress'
  | 'completed'

export type AppointmentBookingSource = 'patient_portal' | 'walk_in' | 'phone' | 'facebook' | 'staff_entry' | 'imported'
export type AppointmentPaymentStatus = 'not_billed' | 'unpaid' | 'partially_paid' | 'paid' | 'refunded'
export type AppointmentDepositStatus = 'not_required' | 'pending' | 'paid' | 'partially_paid' | 'refunded' | 'forfeited'
export type OperatoryStatus = 'active' | 'inactive' | 'maintenance'
export type ScheduleBlockType =
  | 'meeting'
  | 'training'
  | 'equipment_maintenance'
  | 'personal'
  | 'clinic_event'
  | 'holiday'
  | 'emergency_closure'
  | 'other'
export type WaitlistStatus = 'waiting' | 'contacted' | 'scheduled' | 'declined' | 'cancelled'
export type AppointmentHistoryEventType =
  | 'created'
  | 'status_changed'
  | 'checked_in'
  | 'moved_to_waiting'
  | 'started'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled'
  | 'provider_changed'

export type Appointment = {
  id: string
  appointmentNumber?: string
  patientId: string
  branchId?: string
  providerId?: string
  proposedProviderId?: string
  providerAcceptedAt?: string
  providerAcceptedBy?: string
  providerDeclinedAt?: string
  providerDeclinedBy?: string
  serviceId: string
  operatoryId?: string
  date: string
  startTime: string
  endTime: string
  durationMinutes?: number
  estimatedAmountCents?: number
  paymentStatus?: AppointmentPaymentStatus
  depositStatus?: AppointmentDepositStatus
  depositRequiredCents?: number
  depositPaidCents?: number
  reasonForVisit?: string
  patientNotes?: string
  internalNotes?: string
  bookingSource?: AppointmentBookingSource
  checkedInAt?: string
  checkedInBy?: string
  waitingAt?: string
  startedAt?: string
  startedBy?: string
  completedAt?: string
  completedBy?: string
  cancelledAt?: string
  cancelledBy?: string
  noShowAt?: string
  noShowBy?: string
  rescheduledAt?: string
  rescheduledBy?: string
  notes: string
  status: AppointmentStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type AppointmentFormValues = Omit<Appointment, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>

export type AppointmentSortKey = 'date' | 'patient' | 'status'

export type AppointmentStatusHistoryEntry = {
  id: string
  appointmentId: string
  appointmentNumber?: string
  eventType: AppointmentHistoryEventType
  fromStatus?: AppointmentStatus
  toStatus?: AppointmentStatus
  changedBy: string
  changedAt: string
  reason?: string
  notes?: string
  metadata?: Record<string, string | number | boolean | null | undefined>
}

export type Operatory = {
  id: string
  name: string
  branchId: string
  status: OperatoryStatus
  notes: string
  createdAt: string
  updatedAt: string
}

export type ScheduleBlock = {
  id: string
  branchId: string
  providerId?: string
  operatoryId?: string
  date: string
  startTime?: string
  endTime?: string
  fullDay: boolean
  type: ScheduleBlockType
  reason: string
  notes: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type AppointmentWaitlistEntry = {
  id: string
  patientId: string
  branchId: string
  serviceId: string
  preferredProviderId?: string
  preferredDateStart: string
  preferredDateEnd: string
  preferredTimeStart?: string
  preferredTimeEnd?: string
  priority: 'normal' | 'high' | 'urgent'
  status: WaitlistStatus
  notes: string
  createdBy: string
  createdAt: string
  updatedAt: string
}
