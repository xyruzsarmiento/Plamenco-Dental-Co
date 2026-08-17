import type { UserRole } from '../auth/authTypes'

function readAuthSession() {
  try {
    const storage = globalThis.localStorage
    const raw = storage?.getItem('plamenco.auth.user')
    if (!raw) return null
    return JSON.parse(raw) as { role?: UserRole; name?: string }
  } catch {
    return null
  }
}

export function getCurrentSessionRole(): UserRole | null {
  return readAuthSession()?.role ?? null
}

export function requireRole(role: UserRole | undefined, allowedRoles: UserRole[], action: string) {
  const canProceed = Boolean(role && allowedRoles.includes(role))
  if (!canProceed) {
    throw new Error(`Unauthorized attempt: ${action}.`)
  }
}

export function getCurrentSessionUserName(): string {
  return readAuthSession()?.name ?? 'system'
}

export function sanitizeSensitiveText(value: string | undefined) {
  if (!value) return ''
  return value.trim()
}
