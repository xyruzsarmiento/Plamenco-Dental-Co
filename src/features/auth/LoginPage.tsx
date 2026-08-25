import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from './AuthContext'
import { AuthShell } from './AuthShell'
import { SocialAuthButtons } from './SocialAuthButtons'

type LocationState = {
  from?: { pathname?: string }
}

export function LoginPage() {
  const { authError, clearAuthError, isAuthenticated, isLoading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const state = location.state as LocationState | null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [oauthError, setOauthError] = useState('')

  useEffect(() => {
    const errorDescription = searchParams.get('error_description') || searchParams.get('error')
    if (!errorDescription) return
    setOauthError(errorDescription.replaceAll('+', ' '))
    const next = new URLSearchParams(searchParams)
    next.delete('error')
    next.delete('error_code')
    next.delete('error_description')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  if (isAuthenticated) {
    const storedUser = JSON.parse(window.localStorage.getItem('plamenco.auth.user') ?? 'null') as { role?: string; patientId?: string } | null
    const userRole = storedUser?.role ?? (location.state && typeof location.state === 'object' && 'role' in location.state ? (location.state as { role?: string }).role : undefined)
    const destination = userRole === 'patient'
      ? storedUser?.patientId ? `/portal/${storedUser.patientId}` : '/login'
      : userRole === 'dentist' || userRole === 'associate_dentist'
        ? '/dentist'
        : userRole === 'staff'
          ? '/staff'
          : userRole === 'super_admin'
            ? '/super-admin'
            : '/app'
    return <Navigate to={destination} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setOauthError('')
    const didSignIn = await signIn(email, password)
    if (didSignIn) {
      const storedUser = JSON.parse(window.localStorage.getItem('plamenco.auth.user') ?? 'null') as { role?: string; patientId?: string } | null
      const targetPath = state?.from?.pathname && state.from.pathname !== '/login'
        ? state.from.pathname
        : storedUser?.role === 'patient' && storedUser.patientId
          ? `/portal/${storedUser.patientId}`
          : storedUser?.role === 'dentist' || storedUser?.role === 'associate_dentist'
            ? '/dentist'
            : storedUser?.role === 'staff'
              ? '/staff'
              : storedUser?.role === 'super_admin'
                ? '/super-admin'
                : '/app'
      navigate(targetPath, { replace: true })
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Welcome back"
      description="Sign in to continue your care journey with Plamenco Dental Co."
      footer={<p className="auth-switcher">Don&apos;t have an account? <Link to="/register">Register here</Link></p>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field auth-field">
          <span>Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(event) => { clearAuthError(); setOauthError(''); setEmail(event.target.value) }} placeholder="you@example.com" required />
        </label>
        <label className="field auth-field">
          <span>Password</span>
          <div className="password-field">
            <input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => { clearAuthError(); setOauthError(''); setPassword(event.target.value) }} placeholder="Enter your password" required />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <div className="auth-row">
          <label className="checkbox-row"><input type="checkbox" checked={rememberMe} onChange={() => setRememberMe((current) => !current)} /><span>Remember me</span></label>
          <Link to="/forgot-password" className="text-link">Forgot password</Link>
        </div>
        {(authError || oauthError) && <div className="inline-alert" role="alert"><AlertCircle size={16} /><span>{oauthError || authError}</span></div>}
        <Button type="submit" icon={<LockKeyhole size={16} />} disabled={isLoading}>{isLoading ? 'Checking access' : 'Sign In'}</Button>
      </form>
      <SocialAuthButtons mode="login" />
    </AuthShell>
  )
}
