import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { clearAllQueryCache } from '../../lib/queryCache'
import { AuthContext, type AuthContextValue, type SocialAuthProvider } from './AuthContext'
import type { AccountStatus, AuthUser, UserRole } from './authTypes'
import { getRolePermissions } from './permissions'
import { findStaffByEmail } from './staffStore'

const STORAGE_KEY = 'plamenco.auth.user'
const SOCIAL_INTENT_KEY = 'plamenco.auth.social-intent'
const AUTH_OPERATION_TIMEOUT_MS = 12000
const allowLegacyLocalAuth = import.meta.env.DEV && import.meta.env.VITE_ENABLE_LEGACY_LOCAL_AUTH === 'true'

type SessionUser = {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
  app_metadata?: Record<string, unknown>
}

type ProfileRow = {
  id: string
  full_name?: string | null
  role?: string | null
  status?: string | null
  permissions?: string[] | null
}

function readStoredUser(): AuthUser | null {
  if (!allowLegacyLocalAuth) return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as AuthUser) : null
  } catch {
    return null
  }
}

function clearCachedUser() {
  window.localStorage.removeItem(STORAGE_KEY)
}

function cacheUser(user: AuthUser) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

function withAuthTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), AUTH_OPERATION_TIMEOUT_MS)
  })

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  })
}

function readSupabaseHashCallback() {
  if (typeof window === 'undefined' || !window.location.hash) return null
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const error = params.get('error_description') || params.get('error')
  if (error) return { error, accessToken: '', refreshToken: '' }
  const accessToken = params.get('access_token') ?? ''
  const refreshToken = params.get('refresh_token') ?? ''
  if (!accessToken || !refreshToken) return null
  return { error: '', accessToken, refreshToken }
}

function clearSupabaseHashCallback() {
  if (typeof window === 'undefined' || !window.location.hash) return
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const hasSupabaseCallback = ['access_token', 'refresh_token', 'error', 'error_description'].some((key) => params.has(key))
  if (!hasSupabaseCallback) return
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`)
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'super_admin' || value === 'dentist' || value === 'associate_dentist' || value === 'staff' || value === 'patient'
}

function normalizeProfileRole(value: unknown): UserRole | null {
  if (value === 'admin') return 'staff'
  return isUserRole(value) ? value : null
}

function isAccountStatus(value: unknown): value is AccountStatus {
  return value === 'active' || value === 'inactive' || value === 'suspended'
}

function getSessionProvider(sessionUser: SessionUser) {
  const provider = sessionUser.app_metadata?.provider
  return typeof provider === 'string' ? provider.toLowerCase() : 'email'
}

function isSocialSession(sessionUser: SessionUser) {
  const provider = getSessionProvider(sessionUser)
  return provider === 'google' || provider === 'facebook'
}

function getNameParts(metadata: Record<string, unknown>) {
  const explicitFirst = typeof metadata.first_name === 'string' ? metadata.first_name.trim() : ''
  const explicitLast = typeof metadata.last_name === 'string' ? metadata.last_name.trim() : ''
  if (explicitFirst || explicitLast) return { firstName: explicitFirst || 'Patient', lastName: explicitLast || 'User' }

  const fullName = [metadata.full_name, metadata.name]
    .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    ?.trim() ?? ''
  const parts = fullName.split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: 'Patient', lastName: 'User' }
  if (parts.length === 1) return { firstName: parts[0], lastName: 'Patient' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function buildPatientUserFromSupabase(sessionUser: SessionUser, patientId: string, status: AccountStatus = 'active'): AuthUser | null {
  if (!sessionUser.email || !patientId) return null
  const metadata = sessionUser.user_metadata ?? {}
  const { firstName, lastName } = getNameParts(metadata)
  return {
    id: sessionUser.id,
    name: `${firstName} ${lastName}`.trim() || sessionUser.email.split('@')[0] || 'Patient',
    email: sessionUser.email.toLowerCase(),
    role: 'patient',
    status,
    permissions: getRolePermissions('patient'),
    patientId,
  }
}

async function getSupabaseProfileForSession(sessionUser: SessionUser): Promise<ProfileRow | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, status, permissions')
    .eq('id', sessionUser.id)
    .maybeSingle()
  if (error) {
    if (import.meta.env.DEV) console.debug('[profile lookup failed]', error.message)
    return null
  }
  return data as ProfileRow | null
}

function buildProfileUserFromSupabase(sessionUser: SessionUser, profile: ProfileRow | null): AuthUser | null {
  const normalizedRole = normalizeProfileRole(profile?.role)
  if (!sessionUser.email || !profile || !normalizedRole) return null
  const status = isAccountStatus(profile.status) ? profile.status : 'active'
  const metadata = sessionUser.user_metadata ?? {}
  const { firstName, lastName } = getNameParts(metadata)
  const name = profile.full_name?.trim() || `${firstName} ${lastName}`.trim() || sessionUser.email.split('@')[0] || 'User'
  return {
    id: sessionUser.id,
    name,
    email: sessionUser.email.toLowerCase(),
    role: normalizedRole,
    status,
    permissions: Array.isArray(profile.permissions) && profile.permissions.length > 0 ? profile.permissions : getRolePermissions(normalizedRole),
  }
}

async function ensurePatientProfileForSession(sessionUser: SessionUser) {
  if (!supabase) return null
  const { data: existingProfile, error: lookupError } = await supabase
    .from('patients')
    .select('patient_id, status')
    .eq('auth_user_id', sessionUser.id)
    .maybeSingle()

  if (lookupError) {
    console.error('Failed to load patient profile:', lookupError)
    return null
  }
  if (existingProfile?.patient_id) {
    return { patientId: existingProfile.patient_id as string, status: isAccountStatus(existingProfile.status) ? existingProfile.status : 'active' }
  }

  const metadata = sessionUser.user_metadata ?? {}
  const { firstName, lastName } = getNameParts(metadata)
  const email = sessionUser.email?.trim().toLowerCase()
  if (!email) return null

  // Never attach a new auth identity to an existing patient row solely because the email text matches.
  // Supabase-supported identity linking must produce the same auth_user_id first.
  const { data: emailOwner } = await supabase.from('patients').select('auth_user_id').eq('email', email).maybeSingle()
  if (emailOwner?.auth_user_id && emailOwner.auth_user_id !== sessionUser.id) return null

  const generatedPatientId = typeof metadata.patient_id === 'string' && metadata.patient_id.trim()
    ? metadata.patient_id.trim()
    : `PT-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

  const { data: createdProfile, error: insertError } = await supabase
    .from('patients')
    .insert([{
      auth_user_id: sessionUser.id,
      patient_id: generatedPatientId,
      first_name: firstName,
      middle_name: typeof metadata.middle_name === 'string' ? metadata.middle_name.trim() : '',
      last_name: lastName,
      phone: typeof metadata.phone === 'string' ? metadata.phone.trim() : '',
      email,
      date_of_birth: typeof metadata.date_of_birth === 'string' ? metadata.date_of_birth : null,
      registration_date: new Date().toISOString().slice(0, 10),
      status: 'active',
      medical_notes: isSocialSession(sessionUser)
        ? 'Patient account created through a verified social authentication provider. Complete missing profile details in the patient portal.'
        : 'Patient account created via Supabase Auth registration.',
    }])
    .select('patient_id, status')
    .single()

  if (insertError || !createdProfile?.patient_id) {
    console.error('Failed to create patient profile for authenticated user:', insertError)
    return null
  }
  return { patientId: createdProfile.patient_id as string, status: isAccountStatus(createdProfile.status) ? createdProfile.status : 'active' }
}

async function buildUserFromSupabaseSession(sessionUser: SessionUser): Promise<AuthUser | null> {
  const profile = await getSupabaseProfileForSession(sessionUser)
  const profileUser = buildProfileUserFromSupabase(sessionUser, profile)

  // Google/Facebook is intentionally patient-only. A social provider never elevates an
  // authenticated identity into Staff, Dentist, Associate Dentist, or Super Admin.
  if (profileUser && profileUser.role !== 'patient') return isSocialSession(sessionUser) ? null : profileUser

  const metadataRole = sessionUser.user_metadata?.role
  if (!profile && isUserRole(metadataRole) && metadataRole !== 'patient') return null

  const patientProfile = await ensurePatientProfileForSession(sessionUser)
  if (!patientProfile) return null
  return buildPatientUserFromSupabase(sessionUser, patientProfile.patientId, patientProfile.status)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser())
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const client = supabase
    if (!client) {
      if (!allowLegacyLocalAuth) { clearCachedUser(); setUser(null) }
      setIsLoading(false)
      return undefined
    }

    let isMounted = true
    const authStateTimers = new Set<number>()
    const applySession = async (sessionUser: SessionUser | null | undefined) => {
      if (!isMounted) return
      if (!sessionUser) {
        if (allowLegacyLocalAuth) setUser(readStoredUser())
        else { clearCachedUser(); setUser(null) }
        setIsLoading(false)
        return
      }

      try {
        const nextUser = await withAuthTimeout(
          buildUserFromSupabaseSession(sessionUser),
          'Clinic account lookup took too long. Please refresh or sign in again.',
        )
        if (!isMounted) return
        if (nextUser) {
          cacheUser(nextUser)
          setUser(nextUser)
          setAuthError(null)
          if (typeof window !== 'undefined') window.sessionStorage.removeItem(SOCIAL_INTENT_KEY)
          setIsLoading(false)
          return
        }
        const social = isSocialSession(sessionUser)
        clearCachedUser()
        clearAllQueryCache()
        setUser(null)
        setAuthError(social
          ? 'Social sign-in is available for patient accounts only. If this email belongs to a clinic team account, sign in with your clinic-managed password.'
          : 'Unable to load an authorized clinic account for this session.')
        if (social) void client.auth.signOut()
      } catch (cause) {
        if (!isMounted) return
        console.error('[auth session restore failed]', cause)
        clearCachedUser()
        clearAllQueryCache()
        setUser(null)
        setAuthError(cause instanceof Error ? cause.message : 'Unable to restore your secure clinic session. Please sign in again.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    const applySupabaseSession = async () => {
      try {
        const callback = readSupabaseHashCallback()
        if (callback?.error) {
          clearSupabaseHashCallback()
          clearCachedUser(); clearAllQueryCache(); setUser(null)
          setAuthError(callback.error)
          setIsLoading(false)
          return
        }
        if (callback?.accessToken && callback.refreshToken) {
          const { data, error } = await withAuthTimeout(
            client.auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken }),
            'Secure sign-in callback took too long. Please refresh or sign in again.',
          )
          clearSupabaseHashCallback()
          if (!isMounted) return
          if (error) {
            clearCachedUser(); clearAllQueryCache(); setUser(null)
            setAuthError('Unable to complete secure sign-in. Please sign in again.')
            setIsLoading(false)
            return
          }
          await applySession(data.session?.user)
          return
        }
        const { data: { session }, error } = await withAuthTimeout(
          client.auth.getSession(),
          'Secure session restore took too long. Please refresh or sign in again.',
        )
        if (!isMounted) return
        if (error) {
          clearCachedUser(); clearAllQueryCache(); setUser(null)
          setAuthError('Unable to restore your secure session. Please sign in again.')
          setIsLoading(false)
          return
        }
        await applySession(session?.user)
      } catch (cause) {
        if (!isMounted) return
        console.error('[auth session load failed]', cause)
        clearCachedUser(); clearAllQueryCache(); setUser(null)
        setAuthError(cause instanceof Error ? cause.message : 'Unable to restore your secure session. Please sign in again.')
        setIsLoading(false)
      }
    }

    void applySupabaseSession()
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const timer = window.setTimeout(() => {
        authStateTimers.delete(timer)
        void applySession(session?.user)
      }, 0)
      authStateTimers.add(timer)
    })
    return () => {
      isMounted = false
      authStateTimers.forEach((timer) => window.clearTimeout(timer))
      authStateTimers.clear()
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    authError,
    isLoading,
    isAuthenticated: Boolean(user),
    signIn: async (email, password) => {
      setIsLoading(true)
      setAuthError(null)
      clearAllQueryCache()
      const normalizedEmail = email.trim().toLowerCase()
      const staff = allowLegacyLocalAuth ? findStaffByEmail(normalizedEmail) : undefined
      if (staff && staff.password === password && staff.status === 'active') {
        const nextUser: AuthUser = { id: staff.id, name: staff.name, email: staff.email, role: staff.role, status: staff.status, permissions: getRolePermissions(staff.role) }
        cacheUser(nextUser); setUser(nextUser); setIsLoading(false); return true
      }
      if (!supabase) {
        clearCachedUser(); setUser(null); setAuthError('Supabase authentication is not configured.'); setIsLoading(false); return false
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      if (error || !data.user) {
        clearCachedUser(); setUser(null)
        const message = error?.message.toLowerCase() ?? ''
        setAuthError(message.includes('confirm') || message.includes('email not confirmed') ? 'Please confirm your account through the email we sent you.' : 'Invalid email or password.')
        setIsLoading(false); return false
      }
      const nextUser = await buildUserFromSupabaseSession(data.user)
      if (!nextUser) {
        await supabase.auth.signOut(); clearCachedUser(); setUser(null); setAuthError('Unable to load an authorized clinic account for this session.'); setIsLoading(false); return false
      }
      cacheUser(nextUser); setUser(nextUser); setIsLoading(false); return true
    },
    signInWithSocial: async (provider: SocialAuthProvider) => {
      setAuthError(null)
      clearAllQueryCache()
      if (!supabase) {
        const message = 'Supabase authentication is not configured.'
        setAuthError(message)
        return { success: false, message }
      }
      try {
        window.sessionStorage.setItem(SOCIAL_INTENT_KEY, provider)
        const redirectTo = `${window.location.origin}/login?oauth=callback`
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo,
            ...(provider === 'facebook' ? { scopes: 'email public_profile' } : {}),
            ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
          },
        })
        if (error) {
          window.sessionStorage.removeItem(SOCIAL_INTENT_KEY)
          const message = error.message || `Unable to continue with ${provider}.`
          setAuthError(message)
          return { success: false, message }
        }
        return { success: true, message: `Redirecting to ${provider === 'google' ? 'Google' : 'Facebook'}…` }
      } catch (error) {
        window.sessionStorage.removeItem(SOCIAL_INTENT_KEY)
        const message = error instanceof Error ? error.message : `Unable to continue with ${provider}.`
        setAuthError(message)
        return { success: false, message }
      }
    },
    registerPatient: async (values) => {
      setAuthError(null)
      if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim()) { const message='Please complete all required profile details.'; setAuthError(message); return {success:false,message} }
      if (values.password.length < 8) { const message='Password must be at least 8 characters long.'; setAuthError(message); return {success:false,message} }
      if (values.password !== values.confirmPassword) { const message='Passwords do not match.'; setAuthError(message); return {success:false,message} }
      if (!values.acceptedTerms) { const message='Please accept the terms to create your account.'; setAuthError(message); return {success:false,message} }
      if (!supabase) { const message='Supabase authentication is not configured.'; setAuthError(message); return {success:false,message} }
      const email = values.email.trim().toLowerCase()
      const generatedPatientId = `PT-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2,7).toUpperCase()}`
      const { data, error } = await supabase.auth.signUp({ email, password: values.password, options: { data: { first_name: values.firstName.trim(), middle_name: values.middleName.trim(), last_name: values.lastName.trim(), phone: values.phone.trim(), date_of_birth: values.dateOfBirth, role: 'patient', patient_id: generatedPatientId } } })
      if (error || !data.user) { const message=error?.message ?? 'Unable to create your account right now.'; setAuthError(message); return {success:false,message} }
      const { error: profileError } = await supabase.from('patients').upsert({ auth_user_id:data.user.id, patient_id:generatedPatientId, first_name:values.firstName.trim(), middle_name:values.middleName.trim(), last_name:values.lastName.trim(), date_of_birth:values.dateOfBirth||null, phone:values.phone.trim(), email, registration_date:new Date().toISOString().slice(0,10), status:'active', medical_notes:'Patient account created via Supabase Auth registration.' }, { onConflict:'auth_user_id' })
      if (profileError) { console.error('Supabase patient profile creation failed:', profileError); const message='Your sign-in account was created, but we could not create the linked patient profile. Please contact the clinic before logging in.'; setAuthError(message); return {success:false,message} }
      return { success:true, message:`Welcome to Plamenco Dental Co., ${values.firstName.trim()}. Please confirm your account through the email we sent you.` }
    },
    requestPasswordReset: async (email) => {
      setAuthError(null)
      if (!supabase) { const message='Supabase authentication is not configured.'; setAuthError(message); return {success:false,message} }
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo:`${window.location.origin}/reset-password` })
      if (error) { setAuthError(error.message); return {success:false,message:error.message} }
      return { success:true, message:'A password reset email has been sent to your address.' }
    },
    resetPassword: async (newPassword, confirmPassword) => {
      setAuthError(null)
      if (!newPassword || !confirmPassword) { const message='Both fields are required.'; setAuthError(message); return {success:false,message} }
      if (newPassword.length < 8) { const message='Password must be at least 8 characters long.'; setAuthError(message); return {success:false,message} }
      if (newPassword !== confirmPassword) { const message='Passwords do not match.'; setAuthError(message); return {success:false,message} }
      if (!supabase) { const message='Supabase authentication is not configured.'; setAuthError(message); return {success:false,message} }
      const { error } = await supabase.auth.updateUser({ password:newPassword })
      if (error) { setAuthError(error.message); return {success:false,message:error.message} }
      return { success:true, message:'Password updated successfully.' }
    },
    signOut: async () => {
      clearAllQueryCache()
      if (supabase) await supabase.auth.signOut()
      clearCachedUser(); setUser(null); setAuthError(null)
      if (typeof window !== 'undefined') window.sessionStorage.removeItem(SOCIAL_INTENT_KEY)
    },
    clearAuthError: () => setAuthError(null),
  }), [authError, isLoading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
