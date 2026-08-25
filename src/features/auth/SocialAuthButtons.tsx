import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAuth } from './AuthContext'

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.88-1.73 2.99-4.29 2.99-7.38Z"/>
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.39l-3.22-2.51c-.9.6-2.04.95-3.39.95-2.6 0-4.81-1.76-5.6-4.13H3.07v2.59A9.99 9.99 0 0 0 12 22Z"/>
      <path fill="#FBBC05" d="M6.4 13.92A6.03 6.03 0 0 1 6.08 12c0-.67.12-1.32.32-1.92V7.49H3.07A10 10 0 0 0 2 12c0 1.62.39 3.15 1.07 4.51l3.33-2.59Z"/>
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a9.99 9.99 0 0 0-8.93 5.49l3.33 2.59C7.19 7.71 9.4 5.95 12 5.95Z"/>
    </svg>
  )
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10" fill="#1877F2"/>
      <path fill="#fff" d="M13.45 19v-6.2h2.08l.31-2.42h-2.39V8.84c0-.7.2-1.18 1.2-1.18h1.28V5.5c-.22-.03-.98-.1-1.87-.1-1.84 0-3.1 1.12-3.1 3.2v1.78H8.88v2.42h2.08V19h2.49Z"/>
    </svg>
  )
}

export function SocialAuthButtons({ mode = 'login' }: { mode?: 'login' | 'register' }) {
  const { signInWithSocial } = useAuth()
  const [busy, setBusy] = useState<'google' | 'facebook' | null>(null)
  const [error, setError] = useState('')

  async function continueWith(provider: 'google' | 'facebook') {
    setBusy(provider)
    setError('')
    const result = await signInWithSocial(provider)
    if (!result.success) {
      setError(result.message)
      setBusy(null)
    }
  }

  return (
    <section className="auth-social" aria-label={`${mode === 'register' ? 'Register' : 'Sign in'} with a social account`}>
      <div className="auth-divider"><span>or continue with</span></div>
      <div className="auth-social-grid">
        <button type="button" className="auth-social-button" onClick={() => void continueWith('google')} disabled={busy !== null}>
          <span className="auth-social-mark"><GoogleMark /></span>
          <span>{busy === 'google' ? 'Connecting…' : 'Continue with Google'}</span>
        </button>
        <button type="button" className="auth-social-button" onClick={() => void continueWith('facebook')} disabled={busy !== null}>
          <span className="auth-social-mark"><FacebookMark /></span>
          <span>{busy === 'facebook' ? 'Connecting…' : 'Continue with Facebook'}</span>
        </button>
      </div>
      <p className="auth-social-note">Social sign-in is for patient accounts. Clinic staff and dentists should use their clinic-managed credentials.</p>
      {error ? <div className="inline-alert auth-social-error" role="alert"><AlertCircle size={16}/><span>{error}</span></div> : null}
    </section>
  )
}
