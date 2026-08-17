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
  serviceId: string
  date: string
  startTime: string
  endTime: string
  durationMinutes?: number
  estimatedAmountCents?: number
  paymentStatus?: AppointmentPaymentStatus
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
