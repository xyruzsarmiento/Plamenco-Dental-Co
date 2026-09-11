import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'
import '../../styles/accept-invite-premium-v181.css'

type InviteContext = {
  userId: string
  name: string
  email: string
  role: string
}

export function AcceptInvitePage() {
  const navigate = useNavigate()
  const [context, setContext] = useState<InviteContext | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordChecks = useMemo(() => ({
    length: password.length >= 8,
    match: Boolean(password) && password === confirmPassword,
  }), [confirmPassword, password])

  useEffect(() => {
    let active = true

    async function prepare() {
      if (!supabase) {
        if (active) {
          setError('Clinic authentication is not configured.')
          setLoading(false)
        }
        return
      }

      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
          window.history.replaceState({}, document.title, '/accept-invite')
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const user = sessionData.session?.user
        if (!user) throw new Error('This invitation session is no longer available. Ask Super Admin to send a fresh invitation.')

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('full_name, email, role, status')
          .eq('id', user.id)
          .maybeSingle()
        if (profileError) throw profileError
        if (!profile) throw new Error('Your clinic profile has not been provisioned yet. Ask Super Admin to resend the invitation.')

        const role = String(profile.role || user.user_metadata?.role || '')
        if (!['staff', 'dentist', 'associate_dentist', 'super_admin'].includes(role)) {
          throw new Error('This link is not an internal clinic invitation.')
        }

        const inviteContext: InviteContext = {
          userId: user.id,
          name: String(profile.full_name || user.user_metadata?.full_name || user.email || 'Invited team member'),
          email: String(profile.email || user.email || ''),
          role: role.replaceAll('_', ' '),
        }

        if (profile.status === 'active') {
          await supabase.auth.signOut({ scope: 'local' })
          if (active) {
            setContext(inviteContext)
            setComplete(true)
          }
          return
        }

        if (active) setContext(inviteContext)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to verify this invitation.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void prepare()
    return () => { active = false }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !context || saving) return

    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      const { data: accepted, error: activationError } = await supabase.rpc('accept_own_internal_invitation')
      if (activationError) throw activationError
      if (!accepted) throw new Error('The invitation could not be activated. Ask Super Admin to send a fresh invitation.')

      const { data: confirmedProfile, error: confirmationError } = await supabase
        .from('profiles')
        .select('status, role')
        .eq('id', context.userId)
        .maybeSingle()
      if (confirmationError) throw confirmationError
      if (confirmedProfile?.status !== 'active') {
        throw new Error('Your password was saved, but clinic access was not activated. Ask Super Admin to review this invitation.')
      }

      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError

      setComplete(true)
      setPassword('')
      setConfirmPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to set your password and activate the invitation.')
    } finally {
      setSaving(false)
    }
  }

  async function useDifferentAccount() {
    if (!supabase || switchingAccount) return
    setSwitchingAccount(true)
    setError(null)
    try {
      await supabase.auth.signOut({ scope: 'local' })
      navigate('/login', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to switch accounts right now.')
      setSwitchingAccount(false)
    }
  }

  return (
    <main className="invite181-page">
      <section className="invite181-shell" aria-labelledby="invite181-title">
        <aside className="invite181-aside">
          <div className="invite181-brand">
            <span className="invite181-brand-mark">P</span>
            <div><strong>Plamenco Dental Co.</strong><span>Secure team access</span></div>
          </div>

          <div className="invite181-aside-copy">
            <p className="eyebrow">Internal account invitation</p>
            <h1>One secure setup before you enter the clinic workspace.</h1>
            <p>Your invitation is tied to a clinic-managed role and branch access. Complete setup here, then sign in normally with the password you create.</p>
          </div>

          <div className="invite181-security" aria-label="Invitation security information">
            <span><ShieldCheck size={16} /> Supabase-authenticated invitation</span>
            <span><UserRoundCheck size={16} /> Role and branch access verified</span>
            <span><LockKeyhole size={16} /> Password stored by Supabase Auth</span>
          </div>
        </aside>

        <section className="invite181-main">
          {loading ? (
            <>
              <span className="invite181-kicker"><ShieldCheck size={15} /> Verifying invitation</span>
              <h2 className="invite181-title" id="invite181-title">Checking your secure access</h2>
              <p className="invite181-lead">We’re validating the invitation session and clinic profile before showing account setup.</p>
              <div className="invite181-loading" role="status"><ShieldCheck size={18} /><span>Verifying your invitation with Supabase…</span></div>
            </>
          ) : complete ? (
            <>
              <span className="invite181-kicker"><BadgeCheck size={15} /> Account ready</span>
              <h2 className="invite181-title" id="invite181-title">Your clinic access is active.</h2>
              <p className="invite181-lead">Your password and internal account activation have been confirmed. Sign in normally to open your assigned workspace.</p>
              {context && (
                <div className="invite181-context">
                  <span className="invite181-context-icon"><UserRoundCheck size={19} /></span>
                  <div><strong>{context.name}</strong><span>{context.email}</span><small>{context.role}</small></div>
                </div>
              )}
              <div className="invite181-success"><CheckCircle2 size={18} /><span>Account activation was confirmed by the clinic database.</span></div>
              <div className="invite181-actions">
                <Button onClick={() => navigate('/login', { replace: true })}>Continue to sign in</Button>
                <button type="button" className="invite181-secondary" onClick={() => navigate('/', { replace: true })}><ArrowLeft size={15} /> Public website</button>
              </div>
            </>
          ) : (
            <>
              <span className="invite181-kicker"><KeyRound size={15} /> Accept invitation</span>
              <h2 className="invite181-title" id="invite181-title">Create your clinic password</h2>
              <p className="invite181-lead">Finish this invitation before entering the internal workspace. Your access remains inactive until Supabase confirms activation.</p>

              {context && (
                <div className="invite181-context">
                  <span className="invite181-context-icon"><UserRoundCheck size={19} /></span>
                  <div><strong>{context.name}</strong><span>{context.email}</span><small>{context.role}</small></div>
                </div>
              )}

              <form className="invite181-form" onSubmit={submit}>
                <div className="invite181-fields">
                  <label className="invite181-field">
                    <span>New password</span>
                    <div className="invite181-input-wrap">
                      <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required disabled={saving || !context} />
                      <button type="button" className="invite181-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                    </div>
                  </label>

                  <label className="invite181-field">
                    <span>Confirm password</span>
                    <div className="invite181-input-wrap">
                      <input type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required disabled={saving || !context} />
                      <button type="button" className="invite181-password-toggle" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                    </div>
                  </label>
                </div>

                <div className="invite181-requirements" aria-live="polite">
                  <span className={passwordChecks.length ? 'is-met' : ''}><Check size={12} /> At least 8 characters</span>
                  <span className={passwordChecks.match ? 'is-met' : ''}><Check size={12} /> Passwords match</span>
                </div>

                {error && <div className="invite181-error" role="alert"><ShieldCheck size={18} /><span>{error}</span></div>}

                <div className="invite181-actions">
                  <Button type="submit" disabled={saving || !context}>{saving ? 'Activating account…' : 'Set password & activate access'}</Button>
                  <button type="button" className="invite181-secondary" onClick={() => void useDifferentAccount()} disabled={saving || switchingAccount}><ArrowLeft size={15} />{switchingAccount ? 'Switching…' : 'Use a different account'}</button>
                </div>
              </form>

              <p className="invite181-footnote">Your password is handled by Supabase Auth. Plamenco Dental Co. does not store your plaintext password in the browser or clinic tables.</p>
            </>
          )}
        </section>
      </section>
    </main>
  )
}