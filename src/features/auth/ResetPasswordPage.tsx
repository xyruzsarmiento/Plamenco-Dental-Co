import { useMemo, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from './AuthContext'
import { AuthShell } from './AuthShell'

function getPasswordScore(password: string) {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return score
}

export function ResetPasswordPage() {
  const { authError, clearAuthError, resetPassword } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const passwordScore = useMemo(() => getPasswordScore(newPassword), [newPassword])
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearAuthError()
    if (newPassword.length < 8 || !passwordsMatch) return

    setIsSubmitting(true)
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
      title={isSuccess ? 'Password updated' : 'Create a new password'}
      description={isSuccess ? 'Your password has been updated successfully. You can now sign in with your new credentials.' : 'Choose a new password for your Plamenco Dental Co account.'}
      footer={<p className="auth-switcher"><Link to="/login">{isSuccess ? 'Continue to sign in' : 'Back to login'}</Link></p>}
    >
      {isSuccess ? (
        <div className="success-state auth-success-state" role="status" aria-live="polite">
          <CheckCircle2 size={36} />
          <h3>Your password is ready.</h3>
          <p>Use your new credentials the next time you sign in.</p>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="field auth-field">
            <span>New password</span>
            <div className="password-field">
              <input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(event) => { clearAuthError(); setNewPassword(event.target.value) }} placeholder="At least 8 characters" required minLength={8} aria-describedby="reset-password-help" />
              <button type="button" className="password-toggle" onClick={() => setShowNewPassword((current) => !current)} aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}>
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <label className="field auth-field">
            <span>Confirm password</span>
            <div className="password-field">
              <input type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => { clearAuthError(); setConfirmPassword(event.target.value) }} placeholder="Re-enter your new password" required aria-invalid={confirmPassword.length > 0 && !passwordsMatch} />
              <button type="button" className="password-toggle" onClick={() => setShowConfirmPassword((current) => !current)} aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          <div className="auth-password-status" id="reset-password-help">
            <div className="auth-password-meter" data-score={passwordScore} aria-hidden="true"><span /><span /><span /><span /></div>
            <span className="auth-password-hint">Use at least 8 characters. A mix of upper/lowercase letters, numbers, and symbols improves strength.</span>
            {confirmPassword ? <span className={`auth-password-match ${passwordsMatch ? 'is-valid' : 'is-invalid'}`}>{passwordsMatch ? 'Passwords match.' : 'Passwords do not match.'}</span> : null}
          </div>

          {authError && <div className="inline-alert" role="alert"><AlertCircle size={16} /><span>{authError}</span></div>}

          <Button type="submit" icon={<LockKeyhole size={16} />} disabled={isSubmitting || newPassword.length < 8 || !passwordsMatch}>
            {isSubmitting ? 'Updating password...' : 'Update password'}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
