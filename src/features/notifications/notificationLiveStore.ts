import { supabase } from '../../lib/supabase'
import type { AppNotification, NotificationAction, NotificationKind, NotificationPriority } from './notificationTypes'

type NotificationRow = {
  id: string
  kind: string | null
  priority: string | null
  title: string
  message: string
  related_id: string | null
  action_path: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

function kind(value: string | null): NotificationKind {
  if (
    value === 'appointment'
    || value === 'payment'
    || value === 'treatment'
    || value === 'clinical'
    || value === 'financial'
    || value === 'document'
    || value === 'inventory'
    || value === 'expense'
  ) return value
  return 'clinical'
}

function actionForKind(value: NotificationKind): NotificationAction {
  if (value === 'appointment') return 'appointment_requested'
  if (value === 'payment' || value === 'financial') return 'payment_received'
  if (value === 'document') return 'document_uploaded'
  if (value === 'inventory') return 'inventory_alert'
  if (value === 'expense') return 'expense_alert'
  return 'treatment_reminder'
}

function priority(value: string | null): NotificationPriority {
  if (value === 'low' || value === 'normal' || value === 'high') return value
  return 'normal'
}

export function mapLiveNotificationRow(row: NotificationRow): AppNotification {
  const notificationKind = kind(row.kind)
  return {
    id: row.id,
    userId: '',
    kind: notificationKind,
    action: actionForKind(notificationKind),
    title: row.title,
    message: row.message,
    priority: priority(row.priority),
    status: 'published',
    relatedId: row.related_id ?? undefined,
    isRead: row.is_read,
    readAt: row.read_at ?? undefined,
    createdAt: row.created_at,
  }
}

export async function loadCurrentUserNotifications(limit = 50) {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_current_user_notifications_v135', { p_limit: limit })
  if (error) throw new Error(error.message || 'Notifications could not be loaded.')
  return ((data ?? []) as NotificationRow[]).map(mapLiveNotificationRow)
}

export async function markLiveNotificationRead(id: string) {
  if (!supabase) return false
  const { error } = await supabase.rpc('mark_notification_read_v135', { p_notification_id: id })
  if (error) throw new Error(error.message || 'Could not mark this notification as read.')
  return true
}

export async function markAllLiveNotificationsRead() {
  if (!supabase) return false
  const { error } = await supabase.rpc('mark_all_notifications_read_v135')
  if (error) throw new Error(error.message || 'Could not mark notifications as read.')
  return true
}
