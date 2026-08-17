import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { AuthContext, type AuthContextValue } from './AuthContext'
import type { AccountStatus, AuthUser, UserRole } from './authTypes'
import { getRolePermissions } from './permissions'
import { findStaffByEmail } from './staffStore'

const STORAGE_KEY = 'plamenco.auth.user'

function readStoredUser(): AuthUser | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored ? (JSON.parse(stored) as AuthUser) : null
  } catch {
    return null
  }
}

function buildPatientUserFromSupabase(sessionUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }, patientId?: string): AuthUser | null {
  if (!sessionUser.email) {
    return null
  }

  const metadata = sessionUser.user_metadata ?? {}
  const firstName = typeof metadata.first_name === 'string' ? metadata.first_name.trim() : ''
  const lastName = typeof metadata.last_name === 'string' ? metadata.last_name.trim() : ''

  return {
    id: sessionUser.id,
    name: `${firstName} ${lastName}`.trim() || sessionUser.email.split('@')[0] || 'Patient',
    email: sessionUser.email.toLowerCase(),
    role: 'patient',
    status: 'active',
    permissions: getRolePermissions('patient'),
    patientId: patientId ?? (typeof metadata.patient_id === 'string' ? metadata.patient_id : undefined),
  }
}

function isUserRole(value: unknown): value is UserRole {
  return (
    value === 'super_admin' ||
    value === 'admin' ||
    value === 'dentist' ||
    value === 'associate_dentist' ||
    value === 'staff' ||
    value === 'patient'
  )
}

function isAccountStatus(value: unknown): value is AccountStatus {
  return value === 'active' || value === 'inactive' || value === 'suspended'
}

async function getSupabaseProfileForSession(sessionUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, status, permissions')
    .eq('id', sessionUser.id)
    .maybeSingle()

  if (error) {
    if (import.meta.env.DEV) {
      console.debug('[profile lookup skipped]', error.message)
    }
    return null
  }

  return data as {
    id: string
    full_name?: string | null
    role?: string | null
    status?: string | null
    permissions?: string[] | null
  } | null
}

function buildProfileUserFromSupabase(
  sessionUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  profile: Awaited<ReturnType<typeof getSupabaseProfileForSession>>,
): AuthUser | null {
  if (!sessionUser.email || !profile || !isUserRole(profile.role)) return null

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
    role: profile.role,
    status,
    permissions: Array.isArray(profile.permissions) && profile.permissions.length > 0 ? profile.permissions : getRolePermissions(profile.role),
  }
}

async function buildUserFromSupabaseSession(sessionUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  const profile = await getSupabaseProfileForSession(sessionUser)
  const profileUser = buildProfileUserFromSupabase(sessionUser, profile)

  if (profileUser && profileUser.role !== 'patient') {
    return profileUser
  }

  const patientId = await ensurePatientProfileForSession(sessionUser)
  return buildPatientUserFromSupabase(sessionUser, patientId)
}

async function ensurePatientProfileForSession(sessionUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> }) {
  if (!supabase) {
    return undefined
  }

  const { data: existingProfile, error: lookupError } = await supabase
    .from('patients')
    .select('patient_id')
    .eq('auth_user_id', sessionUser.id)
    .maybeSingle()

  if (!lookupError && existingProfile?.patient_id) {
    return existingProfile.patient_id as string
  }

  const metadata = sessionUser.user_metadata ?? {}
  const firstName = typeof metadata.first_name === 'string' ? metadata.first_name.trim() : 'Patient'
  const lastName = typeof metadata.last_name === 'string' ? metadata.last_name.trim() : 'User'
  const email = sessionUser.email?.trim().toLowerCase() ?? 'patient@plamencodental.local'
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
    .select('patient_id')
    .single()

  if (insertError) {
    console.error('Failed to create patient profile for authenticated user:', insertError)
    return generatedPatientId
  }

  return createdProfile?.patient_id ?? generatedPatientId
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser())
  const [authError, setAuthError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const client = supabase

    if (!client) {
      setIsLoading(false)
      return undefined
    }

    let isMounted = true

    const applySupabaseSession = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()

      if (!isMounted) return

      if (!session?.user) {
        setUser(readStoredUser())
        setIsLoading(false)
        return
      }

      const nextUser = await buildUserFromSupabaseSession(session.user)
      if (nextUser) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
      }
      setUser(nextUser)
      setIsLoading(false)
    }

    void applySupabaseSession()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return

      if (!session?.user) {
        setUser(readStoredUser())
        setIsLoading(false)
        return
      }

      const nextUser = await buildUserFromSupabaseSession(session.user)
      if (nextUser) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
      }
      setUser(nextUser)
      setIsLoading(false)
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

        const staff = findStaffByEmail(normalizedEmail)
        if (staff && staff.password === password && staff.status === 'active') {
          const nextUser: AuthUser = {
            id: staff.id,
            name: staff.name,
            email: staff.email,
            role: staff.role,
            status: staff.status,
            permissions: getRolePermissions(staff.role),
          }

          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
          setUser(nextUser)
          setIsLoading(false)
          return true
        }

        if (!supabase) {
          setAuthError('Supabase authentication is not configured.')
          setIsLoading(false)
          return false
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })

        if (error) {
          const message = error.message.toLowerCase()
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
          setAuthError('Unable to load your patient account.')
          setIsLoading(false)
          return false
        }

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
        setUser(nextUser)
        setIsLoading(false)
        return true
      },
      registerPatient: async (values) => {
        setAuthError(null)

        if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim()) {
          setAuthError('Please complete all required profile details.')
          return { success: false, message: 'Please complete all required profile details.' }
        }

        if (values.password.length < 8) {
          setAuthError('Password must be at least 8 characters long.')
          return { success: false, message: 'Password must be at least 8 characters long.' }
        }

        if (values.password !== values.confirmPassword) {
          setAuthError('Passwords do not match.')
          return { success: false, message: 'Passwords do not match.' }
        }

        if (!values.acceptedTerms) {
          setAuthError('Please accept the terms to create your account.')
          return { success: false, message: 'Please accept the terms to create your account.' }
        }

        if (!supabase) {
          setAuthError('Supabase authentication is not configured.')
          return { success: false, message: 'Supabase authentication is not configured.' }
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
          setAuthError(error?.message ?? 'Unable to create your account right now.')
          return { success: false, message: error?.message ?? 'Unable to create your account right now.' }
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
        }

        return {
          success: true,
          message: `Welcome to Plamenco Dental Co., ${values.firstName.trim()}. Please confirm your account through the email we sent you.`,
        }
      },
      requestPasswordReset: async (email) => {
        setAuthError(null)

        if (!supabase) {
          setAuthError('Supabase authentication is not configured.')
          return { success: false, message: 'Supabase authentication is not configured.' }
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })

        if (error) {
          setAuthError(error.message)
          return { success: false, message: error.message }
        }

        return {
          success: true,
          message: 'A password reset email has been sent to your address.',
        }
      },
      resetPassword: async (newPassword, confirmPassword) => {
        setAuthError(null)

        if (!newPassword || !confirmPassword) {
          setAuthError('Both fields are required.')
          return { success: false, message: 'Both fields are required.' }
        }

        if (newPassword.length < 8) {
          setAuthError('Password must be at least 8 characters long.')
          return { success: false, message: 'Password must be at least 8 characters long.' }
        }

        if (newPassword !== confirmPassword) {
          setAuthError('Passwords do not match.')
          return { success: false, message: 'Passwords do not match.' }
        }

        if (!supabase) {
          setAuthError('Supabase authentication is not configured.')
          return { success: false, message: 'Supabase authentication is not configured.' }
        }

        const { error } = await supabase.auth.updateUser({ password: newPassword })
        if (error) {
          setAuthError(error.message)
          return { success: false, message: error.message }
        }

        return { success: true, message: 'Password updated successfully.' }
      },
      signOut: async () => {
        if (supabase) {
          await supabase.auth.signOut()
        }
        window.localStorage.removeItem(STORAGE_KEY)
        setUser(null)
        setAuthError(null)
      },
      clearAuthError: () => {
        setAuthError(null)
      },
    }),
    [authError, isLoading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
