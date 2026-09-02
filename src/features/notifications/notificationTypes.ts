export type NotificationKind = 'appointment' | 'payment' | 'treatment' | 'clinical' | 'financial' | 'document' | 'inventory' | 'expense'
export type NotificationAction =
  | 'booking_received'
  | 'appointment_requested'
  | 'appointment_confirmed'
  | 'appointment_rejected'
  | 'appointment_reminder'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'appointment_no_show'
  | 'no_show_follow_up'
  | 'payment_received'
  | 'receipt_issued'
  | 'refund_completed'
  | 'document_uploaded'
  | 'inventory_alert'
  | 'expense_alert'
  | 'outstanding_balance'
  | 'treatment_reminder'
  | 'follow_up_reminder'

export type NotificationPriority = 'low' | 'normal' | 'high'
export type NotificationStatus = 'draft' | 'published' | 'archived'
export type ReminderChannel = 'email' | 'sms' | 'messenger' | 'in_app'

export type ReminderDeliveryPlan = {
  id: string
  title: string
  channels: ReminderChannel[]
  dueAt: string
  status: 'scheduled' | 'sent' | 'failed'
}

export type AppNotification = {
  id: string
  userId: string
  kind: NotificationKind
  action: NotificationAction
  title: string
  message: string
  priority: NotificationPriority
  status?: NotificationStatus
  author?: string
  publishedAt?: string
  relatedId?: string
  isRead: boolean
  createdAt: string
  readAt?: string
  reminder?: ReminderDeliveryPlan
}
