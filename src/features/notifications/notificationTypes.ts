export type NotificationKind = 'appointment' | 'payment' | 'treatment'
export type NotificationAction =
  | 'booking_received'
  | 'appointment_confirmed'
  | 'appointment_reminder'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'payment_received'
  | 'outstanding_balance'
  | 'treatment_reminder'
  | 'follow_up_reminder'

export type NotificationPriority = 'low' | 'normal' | 'high'
export type NotificationStatus = 'draft' | 'published' | 'archived'
export type ReminderChannel = 'email' | 'sms'

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
