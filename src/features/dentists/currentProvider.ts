import type { AuthUser } from '../auth/authTypes'
import type { Provider } from './dentistTypes'

/**
 * Resolves the provider identity for an authenticated Dentist/Associate Dentist.
 * A profile_id link is authoritative. Email is a legacy fallback only when no
 * provider is linked to the authenticated profile, and only for an unlinked row.
 */
export function resolveProviderForAuthUser(providers: Provider[], user: AuthUser | null | undefined) {
  if (!user) return undefined

  const linked = providers.find((provider) => provider.profileId === user.id)
  if (linked) return linked

  const email = user.email?.trim().toLowerCase()
  if (!email) return undefined

  return providers.find((provider) => !provider.profileId && provider.email.trim().toLowerCase() === email)
}
