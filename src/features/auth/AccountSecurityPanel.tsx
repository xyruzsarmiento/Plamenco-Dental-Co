import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'

type AccountSecurityPanelProps = {
  currentEmail: string
  onEmailSynced?: (email: string) => Promise<void> | void
}

function passwordScore(password: string) {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return score
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function AccountSecurityPanel({ currentEmail, onEmailSynced }: AccountSecurityPanelProps) {
  const [email, setEmail] = useState(currentEmail)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState<'email' | 'password' | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null)

  const score = useMemo(() => passwordScore(newPassword), [newPassword])
  const normalizedEmail = email.trim().toLowerCase()
  const emailChanged = normalizedEmail && normalizedEmail !== currentEmail.trim().toLowerCase()
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword

  useEffect(() => {
    setEmail(currentEmail)
  }, [currentEmail])

  async function updateEmail() {
    if (busy) return
    if (!supabase) return setFeedback({ tone: 'error', message: 'Supabase authentication is not configured.' })
    if (!validEmail(normalizedEmail)) return setFeedback({ tone: 'error', message: 'Enter a valid email address.' })
    if (!emailChanged) return setFeedback({ tone: 'info', message: 'This is already your account email.' })

    setBusy('email')
    setFeedback(null)
    try {
      const { data, error } = await supabase.auth.updateUser(
        { email: normalizedEmail },
        { emailRedirectTo: `${window.location.origin}/app/profile` },
      )
      if (error) throw error
      const confirmedEmail = data.user?.email?.trim().toLowerCase()
      if (confirmedEmail === normalizedEmail) {
        await onEmailSynced?.(normalizedEmail)
        setFeedback({ tone: 'success', message: 'Email updated and synchronized with your profile.' })
      } else {
        setFeedback({ tone: 'info', message: `Confirmation sent to ${normalizedEmail}. Your profile email will update after confirmation.` })
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to update email.' })
    } finally {
      setBusy(null)
    }
  }

  async function updatePassword() {
    if (busy) return
    if (!supabase) return setFeedback({ tone: 'error', message: 'Supabase authentication is not configured.' })
    if (newPassword.length < 8) return setFeedback({ tone: 'error', message: 'Password must be at least 8 characters long.' })
    if (!passwordsMatch) return setFeedback({ tone: 'error', message: 'Passwords do not match.' })

    setBusy('password')
    setFeedback(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      setFeedback({ tone: 'success', message: 'Password updated successfully.' })
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to update password.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="account-security-v7">
      <header>
        <span><ShieldCheck size={18} /></span>
        <div>
          <h3>Account & Security</h3>
          <p>Manage your sign-in email and password through Supabase Auth.</p>
        </div>
      </header>

      {feedback && <div className={`account-security-alert-v7 ${feedback.tone}`} role="status">{feedback.tone === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<span>{feedback.message}</span></div>}

      <div className="account-security-sections-v7">
        <section>
          <div><Mail size={17} /><strong>Change email</strong></div>
          <label><span>Current email</span><input value={currentEmail || 'No email on file'} disabled /></label>
          <label><span>New email</span><input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setFeedback(null) }} /></label>
          <Button size="sm" variant="secondary" disabled={!emailChanged || busy === 'email'} onClick={() => void updateEmail()}>{busy === 'email' ? 'Updating...' : 'Update email'}</Button>
        </section>

        <section>
          <div><KeyRound size={17} /><strong>Change password</strong></div>
          <label><span>New password</span><div className="account-security-password-v7"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setFeedback(null) }} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
          <label><span>Confirm password</span><div className="account-security-password-v7"><input type={showConfirm ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setFeedback(null) }} /><button type="button" aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirm((value) => !value)}>{showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
          <div className="account-security-meter-v7" data-score={score} aria-label={`Password strength ${score} of 4`}><span /><span /><span /><span /></div>
          <small>Use at least 8 characters. A mix of upper/lowercase letters, numbers, and symbols improves strength.</small>
          {confirmPassword&&<small className={passwordsMatch ? 'is-valid' : 'is-invalid'}>{passwordsMatch ? 'Passwords match.' : 'Passwords do not match.'}</small>}
          <Button size="sm" disabled={newPassword.length < 8 || !passwordsMatch || busy === 'password'} onClick={() => void updatePassword()}>{busy === 'password' ? 'Updating...' : 'Update password'}</Button>
        </section>
      </div>
    </section>
  )
}
