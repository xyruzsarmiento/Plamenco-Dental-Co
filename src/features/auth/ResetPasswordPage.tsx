import { useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from './AuthContext'
import { AuthShell } from './AuthShell'

export function ResetPasswordPage() {
  const { authError, clearAuthError, resetPassword } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    clearAuthError()

    const result = await resetPassword(newPassword, confirmPassword)
    setIsSubmitting(false)

    if (result.success) {
      setIsSuccess(true)
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  return (
    <AuthShell
      eyebrow="Secure update"
      title={isSuccess ? 'Password updated' : 'Reset your password'}
      description={
        isSuccess
          ? 'Your password has been updated successfully. You can now sign in with your new credentials.'
          : 'Create a new password for your Plamenco Dental Co account. Use at least 8 characters.'
      }
      footer={
        !isSuccess ? (
          <p className="auth-switcher">
            <Link to="/login">Back to login</Link>
          </p>
        ) : (
          <p className="auth-switcher">
            <Link to="/login">Sign in</Link>
          </p>
        )
      }
    >
      {isSuccess ? (
        <div className="success-state auth-success-state" role="status">
          <CheckCircle2 size={36} />
          <h3>Your password has been updated.</h3>
          <p>You can now use your new credentials to return to your clinic account.</p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field auth-field">
            <span>New password</span>
            <div className="password-field">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(event) => {
                  clearAuthError()
                  setNewPassword(event.target.value)
                }}
                placeholder="Enter a new password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowNewPassword((current) => !current)}
                aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="field auth-field">
            <span>Confirm password</span>
            <div className="password-field">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => {
                  clearAuthError()
                  setConfirmPassword(event.target.value)
                }}
                placeholder="Re-enter your new password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword((current) => !current)}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {authError && (
            <div className="inline-alert" role="alert">
              <AlertCircle size={16} />
              <span>{authError}</span>
            </div>
          )}

          <Button type="submit" icon={<LockKeyhole size={16} />} disabled={isSubmitting}>
            {isSubmitting ? 'Updating password...' : 'Update Password'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
