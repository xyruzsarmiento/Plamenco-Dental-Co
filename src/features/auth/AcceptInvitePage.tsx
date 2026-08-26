import { type FormEvent, useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'

type InviteContext = { name: string; email: string; role: string }

export function AcceptInvitePage() {
  const navigate = useNavigate()
  const [context, setContext] = useState<InviteContext | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function prepare() {
      if (!supabase) { if (active) { setError('Clinic authentication is not configured.'); setLoading(false) }; return }
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError && !/code verifier/i.test(exchangeError.message)) throw exchangeError
          window.history.replaceState({}, document.title, '/accept-invite')
        }
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const user = sessionData.session?.user
        if (!user) throw new Error('This invitation link is invalid or has expired. Ask Super Admin to send a new invitation.')
        const { data: profile, error: profileError } = await supabase.from('profiles').select('full_name, email, role').eq('id', user.id).maybeSingle()
        if (profileError) throw profileError
        if (active) setContext({
          name: String(profile?.full_name || user.user_metadata?.full_name || user.email || 'Invited team member'),
          email: String(profile?.email || user.email || ''),
          role: String(profile?.role || user.user_metadata?.role || 'internal account').replaceAll('_', ' '),
        })
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
    if (!supabase || saving) return
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setSaving(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      const { data: accepted, error: activationError } = await supabase.rpc('accept_own_internal_invitation')
      if (activationError) throw activationError
      if (!accepted) throw new Error('The invitation could not be activated. Ask Super Admin to send a new invitation.')

      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError

      setComplete(true)
      setPassword('')
      setConfirmPassword('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to set your password and activate the invitation.')
    } finally { setSaving(false) }
  }

  return <main className="auth-page"><section className="auth-card" style={{ maxWidth: 520 }}>
    <div className="auth-brand"><span className="auth-logo-mark">P</span><div><strong>Plamenco Dental Co.</strong><span>Internal account invitation</span></div></div>
    {loading ? <div className="auth-message"><ShieldCheck size={20}/><span>Verifying secure invitation…</span></div> : complete ? <div className="auth-form">
      <div className="auth-message success"><CheckCircle2 size={20}/><span>Your password is set and your clinic account is active. Sign in with the password you just created.</span></div>
      <Button onClick={() => navigate('/login', { replace: true })}>Continue to sign in</Button>
    </div> : <form className="auth-form" onSubmit={submit}>
      <div><span className="eyebrow">Accept invitation</span><h1>Set your password</h1><p>Complete your account setup before entering the internal clinic portal.</p></div>
      {context && <div className="auth-message"><KeyRound size={19}/><span><strong>{context.name}</strong><br/>{context.email}<br/><span style={{ textTransform: 'capitalize' }}>{context.role}</span></span></div>}
      <label><span>New password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
      <label><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <Button type="submit" disabled={saving || !context}>{saving ? 'Activating account…' : 'Set password & activate access'}</Button>
    </form>}
  </section></main>
}
