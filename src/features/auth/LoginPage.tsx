import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from './AuthContext'
import { AuthShell } from './AuthShell'

type LocationState = {
  from?: {
    pathname?: string
  }
}

export function LoginPage() {
  const { authError, clearAuthError, isAuthenticated, isLoading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  if (isAuthenticated) {
    const storedUser = JSON.parse(window.localStorage.getItem('plamenco.auth.user') ?? 'null') as { role?: string; patientId?: string } | null
    const userRole = storedUser?.role ?? (location.state && typeof location.state === 'object' && 'role' in location.state ? (location.state as { role?: string }).role : undefined)

    let destination = '/app'
    if (userRole === 'patient') {
      destination = storedUser?.patientId ? `/portal/${storedUser.patientId}` : '/login'
    }

    return <Navigate to={destination} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const didSignIn = await signIn(email, password)

    if (didSignIn) {
      const storedUser = JSON.parse(window.localStorage.getItem('plamenco.auth.user') ?? 'null') as { role?: string; patientId?: string } | null
      const targetPath =
        state?.from?.pathname && state.from.pathname !== '/login'
          ? state.from.pathname
          : storedUser?.role === 'patient' && storedUser.patientId
            ? `/portal/${storedUser.patientId}`
            : '/app'
      navigate(targetPath, { replace: true })
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Welcome back"
      description="Sign in to continue your care journey with Plamenco Dental Co."
      footer={
        <p className="auth-switcher">
          Don&apos;t have an account? <Link to="/register">Register here</Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="field auth-field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => {
              clearAuthError()
              setEmail(event.target.value)
            }}
            placeholder="you@plamencodental.com"
            required
          />
        </label>

        <label className="field auth-field">
          <span>Password</span>
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => {
                clearAuthError()
                setPassword(event.target.value)
              }}
              placeholder="Enter your password"
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <div className="auth-row">
          <label className="checkbox-row">
            <input type="checkbox" checked={rememberMe} onChange={() => setRememberMe((current) => !current)} />
            <span>Remember me</span>
          </label>
          <Link to="/forgot-password" className="text-link">
            Forgot password
          </Link>
        </div>

        {authError && (
          <div className="inline-alert" role="alert">
            <AlertCircle size={16} />
            <span>{authError}</span>
          </div>
        )}

        <Button type="submit" icon={<LockKeyhole size={16} />} disabled={isLoading}>
          {isLoading ? 'Checking access' : 'Sign In'}
        </Button>
      </form>
    </AuthShell>
  )
}
