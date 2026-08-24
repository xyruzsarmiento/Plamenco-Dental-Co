import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { AuthContext, type AuthContextValue } from './AuthContext'
import type { AccountStatus, AuthUser, UserRole } from './authTypes'
import { getRolePermissions } from './permissions'
import { findStaffByEmail } from './staffStore'

const STORAGE_KEY = 'plamenco.auth.user'
const allowLegacyLocalAuth = import.meta.env.DEV && import.meta.env.VITE_ENABLE_LEGACY_LOCAL_AUTH === 'true'

type SessionUser = {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown>
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

function isUserRole(value: unknown): value is UserRole {
  return (
    value === 'super_admin' ||
    value === 'dentist' ||
    value === 'associate_dentist' ||
    value === 'staff' ||
    value === 'patient'
  )
}

function normalizeProfileRole(value: unknown): UserRole | null {
  if (value === 'admin') return 'staff'
  return isUserRole(value) ? value : null
}

function isAccountStatus(value: unknown): value is AccountStatus {
  return value === 'active' || value === 'inactive' || value === 'suspended'
}

function buildPatientUserFromSupabase(
  sessionUser: SessionUser,
  patientId: string,
  status: AccountStatus = 'active',
): AuthUser | null {
  if (!sessionUser.email || !patientId) return null

  const metadata = sessionUser.user_metadata ?? {}
  const firstName = typeof metadata.first_name === 'string' ? metadata.first_name.trim() : ''
  const lastName = typeof metadata.last_name === 'string' ? metadata.last_name.trim() : ''

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
  const metadataName = [metadata.first_name, metadata.last_name]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .join(' ')
  const name = profile.full_name?.trim() || metadataName || sessionUser.email.split('@')[0] || 'User'

  return {
    id: sessionUser.id,
    name,
    email: sessionUser.email.toLowerCase(),
    role: normalizedRole,
    status,
    permissions:
      Array.isArray(profile.permissions) && profile.permissions.length > 0
        ? profile.permissions
        : getRolePermissions(normalizedRole),
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
    return {
      patientId: existingProfile.patient_id as string,
      status: isAccountStatus(existingProfile.status) ? existingProfile.status : 'active',
    }
  }

  const metadata = sessionUser.user_metadata ?? {}
  const firstName = typeof metadata.first_name === 'string' ? metadata.first_name.trim() : 'Patient'
  const lastName = typeof metadata.last_name === 'string' ? metadata.last_name.trim() : 'User'
  const email = sessionUser.email?.trim().toLowerCase()
  if (!email) return null

  const generatedPatientId =
    typeof metadata.patient_id === 'string' && metadata.patient_id.trim()
      ? metadata.patient_id.trim()
      : `PT-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

  const { data: createdProfile, error: insertError } = await supabase
    .from('patients')
    .insert([
      {
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
        medical_notes: 'Patient account created via Supabase Auth registration.',
      },
    ])
    .select('patient_id, status')
    .single()

  if (insertError || !createdProfile?.patient_id) {
    console.error('Failed to create patient profile for authenticated user:', insertError)
    return null
  }

  return {
    patientId: createdProfile.patient_id as string,
    status: isAccountStatus(createdProfile.status) ? createdProfile.status : 'active',
  }
}

async function buildUserFromSupabaseSession(sessionUser: SessionUser): Promise<AuthUser | null> {
  const profile = await getSupabaseProfileForSession(sessionUser)
  const profileUser = buildProfileUserFromSupabase(sessionUser, profile)

  if (profileUser && profileUser.role !== 'patient') return profileUser

  // Never authorize an internal role from user-editable metadata. Internal roles
  // require a matching database profile row.
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
      if (!allowLegacyLocalAuth) {
        clearCachedUser()
        setUser(null)
      }
      setIsLoading(false)
      return undefined
    }

    let isMounted = true

    const applySession = async (sessionUser: SessionUser | null | undefined) => {
      if (!isMounted) return

      if (!sessionUser) {
        if (allowLegacyLocalAuth) {
          setUser(readStoredUser())
        } else {
          clearCachedUser()
          setUser(null)
        }
        setIsLoading(false)
        return
      }

      const nextUser = await buildUserFromSupabaseSession(sessionUser)
      if (!isMounted) return

      if (nextUser) {
        cacheUser(nextUser)
        setUser(nextUser)
        setAuthError(null)
      } else {
        clearCachedUser()
        setUser(null)
        setAuthError('Unable to load an authorized clinic account for this session.')
      }
      setIsLoading(false)
    }

    const applySupabaseSession = async () => {
      const {
        data: { session },
        error,
      } = await client.auth.getSession()

      if (!isMounted) return
      if (error) {
        clearCachedUser()
        setUser(null)
        setAuthError('Unable to restore your secure session. Please sign in again.')
        setIsLoading(false)
        return
      }

      await applySession(session?.user)
    }

    void applySupabaseSession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      void applySession(session?.user)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authError,
      isLoading,
      isAuthenticated: Boolean(user),
      signIn: async (email, password) => {
        setIsLoading(true)
        setAuthError(null)

        const normalizedEmail = email.trim().toLowerCase()

        const staff = allowLegacyLocalAuth ? findStaffByEmail(normalizedEmail) : undefined
        if (staff && staff.password === password && staff.status === 'active') {
          const nextUser: AuthUser = {
            id: staff.id,
            name: staff.name,
            email: staff.email,
            role: staff.role,
            status: staff.status,
            permissions: getRolePermissions(staff.role),
          }
          cacheUser(nextUser)
          setUser(nextUser)
          setIsLoading(false)
          return true
        }

        if (!supabase) {
          clearCachedUser()
          setUser(null)
          setAuthError('Supabase authentication is not configured.')
          setIsLoading(false)
          return false
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        if (error || !data.user) {
          clearCachedUser()
          setUser(null)
          const message = error?.message.toLowerCase() ?? ''
          setAuthError(
            message.includes('confirm') || message.includes('email not confirmed')
              ? 'Please confirm your account through the email we sent you.'
              : 'Invalid email or password.',
          )
          setIsLoading(false)
          return false
        }

        const nextUser = await buildUserFromSupabaseSession(data.user)
        if (!nextUser) {
          await supabase.auth.signOut()
          clearCachedUser()
          setUser(null)
          setAuthError('Unable to load an authorized clinic account for this session.')
          setIsLoading(false)
          return false
        }

        cacheUser(nextUser)
        setUser(nextUser)
        setIsLoading(false)
        return true
      },
      registerPatient: async (values) => {
        setAuthError(null)

        if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim()) {
          const message = 'Please complete all required profile details.'
          setAuthError(message)
          return { success: false, message }
        }
        if (values.password.length < 8) {
          const message = 'Password must be at least 8 characters long.'
          setAuthError(message)
          return { success: false, message }
        }
        if (values.password !== values.confirmPassword) {
          const message = 'Passwords do not match.'
          setAuthError(message)
          return { success: false, message }
        }
        if (!values.acceptedTerms) {
          const message = 'Please accept the terms to create your account.'
          setAuthError(message)
          return { success: false, message }
        }
        if (!supabase) {
          const message = 'Supabase authentication is not configured.'
          setAuthError(message)
          return { success: false, message }
        }

        const email = values.email.trim().toLowerCase()
        const generatedPatientId = `PT-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
        const { data, error } = await supabase.auth.signUp({
          email,
          password: values.password,
          options: {
            data: {
              first_name: values.firstName.trim(),
              middle_name: values.middleName.trim(),
              last_name: values.lastName.trim(),
              phone: values.phone.trim(),
              date_of_birth: values.dateOfBirth,
              role: 'patient',
              patient_id: generatedPatientId,
            },
          },
        })

        if (error || !data.user) {
          const message = error?.message ?? 'Unable to create your account right now.'
          setAuthError(message)
          return { success: false, message }
        }

        const { error: profileError } = await supabase.from('patients').upsert(
          {
            auth_user_id: data.user.id,
            patient_id: generatedPatientId,
            first_name: values.firstName.trim(),
            middle_name: values.middleName.trim(),
            last_name: values.lastName.trim(),
            date_of_birth: values.dateOfBirth || null,
            phone: values.phone.trim(),
            email,
            registration_date: new Date().toISOString().slice(0, 10),
            status: 'active',
            medical_notes: 'Patient account created via Supabase Auth registration.',
          },
          { onConflict: 'auth_user_id' },
        )

        if (profileError) {
          console.error('Supabase patient profile creation failed:', profileError)
          const message = 'Your sign-in account was created, but we could not create the linked patient profile. Please contact the clinic before logging in.'
          setAuthError(message)
          return { success: false, message }
        }

        return {
          success: true,
          message: `Welcome to Plamenco Dental Co., ${values.firstName.trim()}. Please confirm your account through the email we sent you.`,
        }
      },
      requestPasswordReset: async (email) => {
        setAuthError(null)
        if (!supabase) {
          const message = 'Supabase authentication is not configured.'
          setAuthError(message)
          return { success: false, message }
        }
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) {
          setAuthError(error.message)
          return { success: false, message: error.message }
        }
        return { success: true, message: 'A password reset email has been sent to your address.' }
      },
      resetPassword: async (newPassword, confirmPassword) => {
        setAuthError(null)
        if (!newPassword || !confirmPassword) {
          const message = 'Both fields are required.'
          setAuthError(message)
          return { success: false, message }
        }
        if (newPassword.length < 8) {
          const message = 'Password must be at least 8 characters long.'
          setAuthError(message)
          return { success: false, message }
        }
        if (newPassword !== confirmPassword) {
          const message = 'Passwords do not match.'
          setAuthError(message)
          return { success: false, message }
        }
        if (!supabase) {
          const message = 'Supabase authentication is not configured.'
          setAuthError(message)
          return { success: false, message }
        }
        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) {
          setAuthError(error.message)
          return { success: false, message: error.message }
        }
        return { success: true, message: 'Password updated successfully.' }
      },
      signOut: async () => {
        if (supabase) await supabase.auth.signOut()
        clearCachedUser()
        setUser(null)
        setAuthError(null)
      },
      clearAuthError: () => setAuthError(null),
    }),
    [authError, isLoading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
