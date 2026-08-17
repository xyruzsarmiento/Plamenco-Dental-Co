import type { AppNotification, NotificationAction, NotificationKind, ReminderChannel } from './notificationTypes'

const NOTIFICATION_STORAGE_KEY = 'plamenco.notifications'

const seedNotifications: AppNotification[] = []

function safeParseNotifications(value: string | null): AppNotification[] | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as AppNotification[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
    return globalThis.localStorage
  }

  const globalWithMemory = globalThis as typeof globalThis & {
    __plamencoNotificationMemoryStorage?: Storage
  }

  if (globalWithMemory.__plamencoNotificationMemoryStorage) {
    return globalWithMemory.__plamencoNotificationMemoryStorage
  }

  const store = new Map<string, string>()
  const memory: Storage = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage

  globalWithMemory.__plamencoNotificationMemoryStorage = memory
  return memory
}

export function getStoredNotifications(): AppNotification[] {
  const stored = safeParseNotifications(getStorage().getItem(NOTIFICATION_STORAGE_KEY))
  if (stored?.length) {
    return stored
  }

  getStorage().setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(seedNotifications))
  return seedNotifications
}

export function saveStoredNotifications(notifications: AppNotification[]) {
  getStorage().setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications))
}

export function getUnreadNotifications(userId: string): AppNotification[] {
  return getStoredNotifications()
    .filter((notification) => notification.userId === userId && !notification.isRead)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function getNotificationsByUser(userId: string): AppNotification[] {
  return getStoredNotifications()
    .filter((notification) => notification.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function createNotification(input: {
  userId: string
  kind: NotificationKind
  action: NotificationAction
  title: string
  message: string
  priority?: 'low' | 'normal' | 'high'
  status?: 'draft' | 'published' | 'archived'
  author?: string
  publishedAt?: string
  relatedId?: string
  reminderChannels?: ReminderChannel[]
  reminderDueAt?: string
}): AppNotification {
  const notification: AppNotification = {
    id: `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId,
    kind: input.kind,
    action: input.action,
    title: input.title,
    message: input.message,
    priority: input.priority ?? 'normal',
    status: input.status ?? 'published',
    author: input.author,
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    relatedId: input.relatedId,
    isRead: false,
    createdAt: new Date().toISOString(),
    reminder: input.reminderDueAt
      ? {
          id: `reminder-${Date.now()}`,
          title: input.title,
          channels: input.reminderChannels ?? ['email'],
          dueAt: input.reminderDueAt,
          status: 'scheduled',
        }
      : undefined,
  }

  const notifications = getStoredNotifications()
  notifications.unshift(notification)
  saveStoredNotifications(notifications)
  return notification
}

export function updateNotification(id: string, updates: Partial<AppNotification>): AppNotification | null {
  const notifications = getStoredNotifications()
  const index = notifications.findIndex((notification) => notification.id === id)

  if (index === -1) return null

  const updated = {
    ...notifications[index],
    ...updates,
  }

  notifications[index] = updated
  saveStoredNotifications(notifications)
  return updated
}

export function deleteNotification(id: string): boolean {
  const notifications = getStoredNotifications()
  const nextNotifications = notifications.filter((notification) => notification.id !== id)

  if (nextNotifications.length === notifications.length) {
    return false
  }

  saveStoredNotifications(nextNotifications)
  return true
}

export function markNotificationAsRead(id: string): AppNotification | null {
  const notifications = getStoredNotifications()
  const index = notifications.findIndex((notification) => notification.id === id)

  if (index === -1) return null

  notifications[index] = {
    ...notifications[index],
    isRead: true,
    readAt: new Date().toISOString(),
  }

  saveStoredNotifications(notifications)
  return notifications[index]
}

export function markAllNotificationsAsRead(userId: string): AppNotification[] {
  const notifications = getStoredNotifications().map((notification) => {
    if (notification.userId !== userId) return notification
    return {
      ...notification,
      isRead: true,
      readAt: notification.readAt ?? new Date().toISOString(),
    }
  })

  saveStoredNotifications(notifications)
  return notifications.filter((notification) => notification.userId === userId)
}

export function getUnreadCount(userId: string): number {
  return getUnreadNotifications(userId).length
}

export { NOTIFICATION_STORAGE_KEY }
