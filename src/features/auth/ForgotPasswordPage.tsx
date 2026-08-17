import { useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from './AuthContext'
import { AuthShell } from './AuthShell'

export function ForgotPasswordPage() {
  const { authError, clearAuthError, requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    clearAuthError()

    const result = await requestPasswordReset(email)
    setIsSubmitting(false)

    if (result.success) {
      setIsSuccess(true)
      return
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title={isSuccess ? 'Check your email' : 'Recover your password'}
      description={
        isSuccess
          ? 'We sent a password reset link to your email with the next steps to regain access.'
          : 'Enter the email address connected to your Plamenco Dental Co account and we will send a secure reset link.'
      }
      footer={
        <p className="auth-switcher">
          <Link to="/login">Back to login</Link>
        </p>
      }
    >
      {isSuccess ? (
        <div className="success-state auth-success-state" role="status">
          <CheckCircle2 size={36} />
          <h3>Check your email</h3>
          <p>A password reset link has been sent. Follow the instructions in your inbox to update your password.</p>
        </div>
      ) : (
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
              placeholder="you@example.com"
              required
            />
          </label>

          {authError && (
            <div className="inline-alert" role="alert">
              <AlertCircle size={16} />
              <span>{authError}</span>
            </div>
          )}

          <Button type="submit" icon={<Mail size={16} />} disabled={isSubmitting}>
            {isSubmitting ? 'Sending reset link...' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
