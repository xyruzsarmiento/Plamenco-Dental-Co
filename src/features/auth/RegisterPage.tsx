import { useMemo, useState, type FormEvent } from 'react'
import { AlertCircle, ArrowRight, Eye, EyeOff, MailCheck } from 'lucide-react'
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

export function RegisterPage() {
  const { authError, clearAuthError, registerPatient } = useAuth()
  const [form, setForm] = useState({ firstName:'', middleName:'', lastName:'', dateOfBirth:'', phone:'', email:'', password:'', confirmPassword:'', acceptedTerms:false })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const passwordScore = useMemo(() => getPasswordScore(form.password), [form.password])
  const passwordsMatch = form.confirmPassword.length > 0 && form.password === form.confirmPassword

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); clearAuthError(); setSuccessMessage('')
    if (form.password.length < 8 || form.password !== form.confirmPassword || !form.acceptedTerms) return
    setIsSubmitting(true)
    const email = form.email.trim()
    const result = await registerPatient({ ...form, email })
    setIsSubmitting(false)
    if (result.success) { setRegisteredEmail(email); setSuccessMessage(result.message) }
  }

  if (successMessage) {
    return (
      <AuthShell eyebrow="Email confirmation" title="Check your inbox" description="Your patient account request was created. Complete the email confirmation step before signing in." footer={<p className="auth-switcher">Already confirmed? <Link to="/login">Sign in</Link></p>}>
        <div className="success-state auth-success-state" role="status" aria-live="polite">
          <MailCheck size={36}/><h3>Confirm your email address</h3><p>{successMessage}</p>{registeredEmail ? <p><strong>{registeredEmail}</strong></p> : null}
          <Link className="btn btn-primary btn-md" to="/login"><span>Continue to sign in</span></Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell eyebrow="New patient" title="Create your patient account" description="Register securely to manage appointments and access your Plamenco patient experience." footer={<p className="auth-switcher">Already have an account? <Link to="/login">Sign in</Link></p>}>
      <form className="auth-form auth-form-grid" onSubmit={handleSubmit} noValidate>
        <label className="field auth-field"><span>First name</span><input type="text" autoComplete="given-name" value={form.firstName} onChange={(e)=>setForm(c=>({...c,firstName:e.target.value}))} required /></label>
        <label className="field auth-field"><span>Middle name <small>(optional)</small></span><input type="text" autoComplete="additional-name" value={form.middleName} onChange={(e)=>setForm(c=>({...c,middleName:e.target.value}))}/></label>
        <label className="field auth-field auth-field-full"><span>Last name</span><input type="text" autoComplete="family-name" value={form.lastName} onChange={(e)=>setForm(c=>({...c,lastName:e.target.value}))} required /></label>
        <label className="field auth-field"><span>Date of birth</span><input type="date" value={form.dateOfBirth} onChange={(e)=>setForm(c=>({...c,dateOfBirth:e.target.value}))} required /></label>
        <label className="field auth-field"><span>Phone</span><input type="tel" autoComplete="tel" value={form.phone} onChange={(e)=>setForm(c=>({...c,phone:e.target.value}))} placeholder="+63 912 345 6789" required /></label>
        <label className="field auth-field auth-field-full"><span>Email</span><input type="email" autoComplete="email" value={form.email} onChange={(e)=>{clearAuthError();setForm(c=>({...c,email:e.target.value}))}} placeholder="you@example.com" required /></label>
        <label className="field auth-field"><span>Password</span><div className="password-field"><input type={showPassword?'text':'password'} autoComplete="new-password" value={form.password} onChange={(e)=>{clearAuthError();setForm(c=>({...c,password:e.target.value}))}} required minLength={8} aria-describedby="register-password-help"/><button type="button" className="password-toggle" onClick={()=>setShowPassword(c=>!c)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
        <label className="field auth-field"><span>Confirm password</span><div className="password-field"><input type={showConfirmPassword?'text':'password'} autoComplete="new-password" value={form.confirmPassword} onChange={(e)=>{clearAuthError();setForm(c=>({...c,confirmPassword:e.target.value}))}} required aria-invalid={form.confirmPassword.length>0&&!passwordsMatch}/><button type="button" className="password-toggle" onClick={()=>setShowConfirmPassword(c=>!c)} aria-label={showConfirmPassword?'Hide confirm password':'Show confirm password'}>{showConfirmPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div></label>
        <div className="auth-password-status" id="register-password-help"><div className="auth-password-meter" data-score={passwordScore} aria-hidden="true"><span/><span/><span/><span/></div><span className="auth-password-hint">Use at least 8 characters. A mix of upper/lowercase letters, numbers, and symbols improves strength.</span>{form.confirmPassword?<span className={`auth-password-match ${passwordsMatch?'is-valid':'is-invalid'}`}>{passwordsMatch?'Passwords match.':'Passwords do not match.'}</span>:null}</div>
        <label className="checkbox-row checkbox-row-wide"><input type="checkbox" checked={form.acceptedTerms} onChange={(e)=>setForm(c=>({...c,acceptedTerms:e.target.checked}))} required/><span>I agree to the terms and understand my information will be used for patient care and communication.</span></label>
        {authError&&<div className="inline-alert" role="alert"><AlertCircle size={16}/><span>{authError}</span></div>}
        {!form.acceptedTerms&&(form.firstName||form.email)?<div className="auth-password-hint checkbox-row-wide">Accept the terms before creating your account.</div>:null}
        <Button type="submit" icon={<ArrowRight size={16}/>} disabled={isSubmitting||form.password.length<8||!passwordsMatch||!form.acceptedTerms}>{isSubmitting?'Creating account...':'Create account'}</Button>
      </form>
    </AuthShell>
  )
}
