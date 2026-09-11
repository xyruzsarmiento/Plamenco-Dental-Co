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
  Mail,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'
import '../../styles/accept-invite-premium-v182.css'

type InviteContext = {
  invitationId: string
  userId: string
  name: string
  email: string
  role: string
  profileStatus: string
  invitationStatus: string
}

type InvitationContextRow = {
  invitation_id?: string | null
  user_id?: string | null
  full_name?: string | null
  email?: string | null
  role?: string | null
  profile_status?: string | null
  invitation_status?: string | null
}

const INTERNAL_ROLES = new Set(['staff', 'dentist', 'associate_dentist', 'super_admin'])

function normalizeRole(role: string) {
  return role.replaceAll('_', ' ')
}

function clearAuthCallbackFromUrl() {
  window.history.replaceState({}, document.title, '/accept-invite')
}

async function waitForInvitationSession() {
  if (!supabase) return null

  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
    clearAuthCallbackFromUrl()
  } else if (window.location.hash) {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const callbackError = hash.get('error_description') || hash.get('error')
    if (callbackError) {
      clearAuthCallbackFromUrl()
      throw new Error(callbackError)
    }
    const accessToken = hash.get('access_token')
    const refreshToken = hash.get('refresh_token')
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      clearAuthCallbackFromUrl()
      if (error) throw error
    }
  }

  const immediate = await supabase.auth.getSession()
  if (immediate.error) throw immediate.error
  if (immediate.data.session) return immediate.data.session

  return await new Promise<NonNullable<typeof immediate.data.session> | null>((resolve) => {
    let finished = false
    let timer = 0
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session)
    })

    const finish = (session: NonNullable<typeof immediate.data.session> | null) => {
      if (finished) return
      finished = true
      window.clearTimeout(timer)
      subscription.unsubscribe()
      resolve(session)
    }

    timer = window.setTimeout(async () => {
      try {
        const latest = await supabase.auth.getSession()
        finish(latest.data.session ?? null)
      } catch {
        finish(null)
      }
    }, 4500)
  })
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
        const session = await waitForInvitationSession()
        const user = session?.user
        if (!user) throw new Error('This invitation session is no longer available. Ask Super Admin to resend the invitation.')

        const { data, error: contextError } = await supabase.rpc('get_own_internal_invitation_context')
        if (contextError) throw contextError
        const row = (Array.isArray(data) ? data[0] : data) as InvitationContextRow | undefined
        if (!row) throw new Error('This account does not have an invitation that can be completed here.')

        const role = String(row.role ?? '')
        const email = String(row.email ?? '').trim().toLowerCase()
        const sessionEmail = String(user.email ?? '').trim().toLowerCase()
        if (!row.user_id || row.user_id !== user.id || !email || email !== sessionEmail || !INTERNAL_ROLES.has(role)) {
          throw new Error('This invitation does not belong to the signed-in account.')
        }

        const inviteContext: InviteContext = {
          invitationId: String(row.invitation_id ?? ''),
          userId: user.id,
          name: String(row.full_name || user.user_metadata?.full_name || user.email || 'Invited team member'),
          email,
          role: normalizeRole(role),
          profileStatus: String(row.profile_status ?? ''),
          invitationStatus: String(row.invitation_status ?? ''),
        }

        if (inviteContext.profileStatus === 'active' && inviteContext.invitationStatus === 'accepted') {
          await supabase.auth.signOut({ scope: 'local' })
          if (active) {
            setContext(inviteContext)
            setComplete(true)
          }
          return
        }

        if (!['inactive', 'invited', 'pending'].includes(inviteContext.profileStatus) || !['sent', 'pending'].includes(inviteContext.invitationStatus)) {
          throw new Error('This invitation is not currently eligible for activation. Ask Super Admin to resend it.')
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
      const { data: sessionCheck, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!sessionCheck.session?.user || sessionCheck.session.user.id !== context.userId) {
        throw new Error('This secure invitation session no longer matches the invited account. Ask Super Admin to resend it.')
      }

      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      const { data: accepted, error: activationError } = await supabase.rpc('accept_own_internal_invitation')
      if (activationError) throw activationError
      if (!accepted) throw new Error('The invitation could not be activated. Ask Super Admin to send a fresh invitation.')

      const { data: confirmedContext, error: confirmationError } = await supabase.rpc('get_own_internal_invitation_context')
      if (confirmationError) throw confirmationError
      const confirmed = (Array.isArray(confirmedContext) ? confirmedContext[0] : confirmedContext) as InvitationContextRow | undefined
      if (confirmed?.profile_status !== 'active' || confirmed?.invitation_status !== 'accepted') {
        throw new Error('Your password was saved, but clinic access was not activated. Ask Super Admin to review this invitation.')
      }

      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError

      setContext({ ...context, profileStatus: 'active', invitationStatus: 'accepted' })
      setComplete(true)
      setPassword('')
      setConfirmPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to set your password and activate the invitation.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUseDifferentAccount() {
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

  const canSetPassword = Boolean(context) && !loading && !complete

  return (
    <main className="invite182-page">
      <section className="invite182-frame" aria-labelledby="invite182-title">
        <header className="invite182-topbar">
          <div className="invite182-brand">
            <span className="invite182-brand-mark">P</span>
            <div><strong>Plamenco Dental Co.</strong><span>Team access</span></div>
          </div>
          <span className="invite182-security-chip"><ShieldCheck size={14} /> Secure invitation</span>
        </header>

        <div className="invite182-grid">
          <aside className="invite182-overview">
            <span className="invite182-kicker"><Sparkles size={14} /> Clinic onboarding</span>
            <h1>Activate your workspace access.</h1>
            <p>Set one secure password for the role and branch access assigned by the clinic. Your invitation is verified against Supabase before anything is activated.</p>

            {context ? (
              <div className="invite182-passport">
                <div className="invite182-passport-icon"><UserRoundCheck size={21} /></div>
                <div className="invite182-passport-copy">
                  <span>Invited account</span>
                  <strong>{context.name}</strong>
                  <small>{context.email}</small>
                </div>
                <span className="invite182-role">{context.role}</span>
              </div>
            ) : (
              <div className="invite182-passport is-placeholder" aria-hidden="true">
                <div className="invite182-passport-icon"><UserRoundCheck size={21} /></div>
                <div className="invite182-passport-copy"><span>Invited account</span><strong>Verifying identity…</strong><small>Secure session required</small></div>
              </div>
            )}

            <div className="invite182-trust-list">
              <span><ShieldCheck size={16} /><span><strong>Verified identity</strong><small>The invitation must match the signed-in Auth user.</small></span></span>
              <span><UserRoundCheck size={16} /><span><strong>Clinic-managed access</strong><small>Your role and branch access are assigned by Super Admin.</small></span></span>
              <span><LockKeyhole size={16} /><span><strong>Supabase-protected password</strong><small>No plaintext password is stored in clinic tables or localStorage.</small></span></span>
            </div>
          </aside>

          <section className="invite182-workspace">
            {loading ? (
              <div className="invite182-state">
                <span className="invite182-state-icon"><ShieldCheck size={22} /></span>
                <span className="invite182-kicker">Verifying invitation</span>
                <h2 id="invite182-title">Checking your secure access</h2>
                <p>We’re matching this session to the clinic invitation before enabling password setup.</p>
                <div className="invite182-loading" role="status"><span /> Verifying with Supabase…</div>
              </div>
            ) : complete ? (
              <div className="invite182-state">
                <span className="invite182-state-icon is-success"><BadgeCheck size={24} /></span>
                <span className="invite182-kicker">Activation complete</span>
                <h2 id="invite182-title">Your clinic account is ready.</h2>
                <p>Your invitation and account status were confirmed by Supabase. Sign in normally with the password you just created.</p>
                <div className="invite182-success"><CheckCircle2 size={18} /><span>Role and clinic access activated successfully.</span></div>
                <div className="invite182-actions single-primary">
                  <Button onClick={() => navigate('/login', { replace: true })}>Continue to sign in</Button>
                  <button type="button" className="invite182-secondary" onClick={() => navigate('/', { replace: true })}><ArrowLeft size={15} /> Back to website</button>
                </div>
              </div>
            ) : (
              <>
                <div className="invite182-heading">
                  <span className="invite182-kicker"><KeyRound size={14} /> Password setup</span>
                  <h2 id="invite182-title">Create your clinic password</h2>
                  <p>Use at least 8 characters. Once confirmed, this password becomes the credential for your assigned internal workspace.</p>
                </div>

                <form className="invite182-form" onSubmit={submit}>
                  <div className="invite182-fields">
                    <label className="invite182-field">
                      <span>New password</span>
                      <div className="invite182-input-wrap">
                        <LockKeyhole size={17} />
                        <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); if (context) setError(null) }} minLength={8} required disabled={!canSetPassword || saving} />
                        <button type="button" onClick={() => setShowPassword((value) => !value)} disabled={!context || saving} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                      </div>
                    </label>

                    <label className="invite182-field">
                      <span>Confirm password</span>
                      <div className="invite182-input-wrap">
                        <LockKeyhole size={17} />
                        <input type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); if (context) setError(null) }} minLength={8} required disabled={!canSetPassword || saving} />
                        <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} disabled={!context || saving} aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                      </div>
                    </label>
                  </div>

                  <div className="invite182-requirements" aria-live="polite">
                    <span className={passwordChecks.length ? 'is-met' : ''}><Check size={13} /> 8+ characters</span>
                    <span className={passwordChecks.match ? 'is-met' : ''}><Check size={13} /> Passwords match</span>
                  </div>

                  {error && <div className="invite182-error" role="alert"><ShieldCheck size={18} /><span>{error}</span></div>}

                  <div className="invite182-actions">
                    <Button type="submit" disabled={!canSetPassword || saving}>{saving ? 'Activating account…' : 'Set password & activate access'}</Button>
                    <button type="button" className="invite182-secondary" onClick={() => void handleUseDifferentAccount()} disabled={saving || switchingAccount}><ArrowLeft size={15} /> {switchingAccount ? 'Switching…' : 'Use a different account'}</button>
                  </div>
                </form>

                <div className="invite182-footnote"><Mail size={14} /><span>Only the account authenticated by this invitation can complete setup. If this is not your email, use a different account.</span></div>
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}
