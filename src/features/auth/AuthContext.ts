import { createContext, useContext } from 'react'
import type { AuthUser } from './authTypes'

export type RegisterFormInput = {
  firstName: string
  middleName: string
  lastName: string
  dateOfBirth: string
  phone: string
  email: string
  password: string
  confirmPassword: string
  acceptedTerms: boolean
}

export type SocialAuthProvider = 'google' | 'facebook'

export type AuthContextValue = {
  user: AuthUser | null
  authError: string | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<boolean>
  signInWithSocial: (provider: SocialAuthProvider) => Promise<{ success: boolean; message: string }>
  registerPatient: (values: RegisterFormInput) => Promise<{ success: boolean; message: string }>
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>
  resetPassword: (newPassword: string, confirmPassword: string) => Promise<{ success: boolean; message: string }>
  signOut: () => void
  clearAuthError: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
