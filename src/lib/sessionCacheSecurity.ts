import { clearAllQueryCache } from './queryCache'
import { supabase } from './supabase'

const PUBLIC_CACHE_KEYS = new Set([
  'plamenco.services',
  'plamenco.branches',
  'plamenco.providers',
  'plamenco.dentists',
  'plamenco.admin.clinicConfiguration',
  'plamenco.admin.bookingConfiguration',
  'plamenco.clinic.closures',
])

export function clearSensitiveClinicCaches() {
  clearAllQueryCache()
  if (typeof window === 'undefined') return

  const removals: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key || !key.startsWith('plamenco.')) continue
    if (PUBLIC_CACHE_KEYS.has(key)) continue
    removals.push(key)
  }

  removals.forEach((key) => window.localStorage.removeItem(key))
}

export function registerSessionCacheSecurity() {
  if (typeof window === 'undefined') return

  if (!supabase) {
    clearSensitiveClinicCaches()
    return
  }

  let activeUserId = ''

  void supabase.auth.getSession().then(({ data, error }) => {
    if (error || !data.session?.user) {
      clearSensitiveClinicCaches()
      activeUserId = ''
      return
    }
    activeUserId = data.session.user.id
  })

  supabase.auth.onAuthStateChange((_event, session) => {
    const nextUserId = session?.user?.id ?? ''
    if (!nextUserId || (activeUserId && activeUserId !== nextUserId)) clearSensitiveClinicCaches()
    activeUserId = nextUserId
  })
}
