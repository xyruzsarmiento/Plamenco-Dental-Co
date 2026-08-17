import { useState, type FormEvent } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { useAuth } from './AuthContext'
import { AuthShell } from './AuthShell'

export function RegisterPage() {
  const { authError, clearAuthError, registerPatient } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    dateOfBirth: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptedTerms: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    clearAuthError()
    setSuccessMessage('')

    const result = await registerPatient({
      firstName: form.firstName,
      middleName: form.middleName,
      lastName: form.lastName,
      dateOfBirth: form.dateOfBirth,
      phone: form.phone,
      email: form.email,
      password: form.password,
      confirmPassword: form.confirmPassword,
      acceptedTerms: form.acceptedTerms,
    })

    setIsSubmitting(false)

    if (result.success) {
      setSuccessMessage(result.message)
      setForm({
        firstName: '',
        middleName: '',
        lastName: '',
        dateOfBirth: '',
        phone: '',
        email: '',
        password: '',
        confirmPassword: '',
        acceptedTerms: false,
      })

      window.setTimeout(() => {
        navigate('/login', { replace: true })
      }, 2200)
    }
  }

  return (
    <AuthShell
      eyebrow="New patient"
      title="Create your account"
      description="Begin your dental care journey with a modern, comfortable experience tailored around your needs."
      footer={
        <p className="auth-switcher">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <form className="auth-form auth-form-grid" onSubmit={handleSubmit}>
        <label className="field auth-field">
          <span>First name</span>
          <input
            type="text"
            value={form.firstName}
            onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
            required
          />
        </label>

        <label className="field auth-field">
          <span>Middle name</span>
          <input
            type="text"
            value={form.middleName}
            onChange={(event) => setForm((current) => ({ ...current, middleName: event.target.value }))}
          />
        </label>

        <label className="field auth-field auth-field-full">
          <span>Last name</span>
          <input
            type="text"
            value={form.lastName}
            onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
            required
          />
        </label>

        <label className="field auth-field">
          <span>Date of birth</span>
          <input
            type="date"
            value={form.dateOfBirth}
            onChange={(event) => setForm((current) => ({ ...current, dateOfBirth: event.target.value }))}
            required
          />
        </label>

        <label className="field auth-field">
          <span>Phone</span>
          <input
            type="tel"
            value={form.phone}
            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
            placeholder="+63 912 345 6789"
            required
          />
        </label>

        <label className="field auth-field auth-field-full">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="you@example.com"
            required
          />
        </label>

        <label className="field auth-field">
          <span>Password</span>
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
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

        <label className="field auth-field">
          <span>Confirm password</span>
          <div className="password-field">
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={form.confirmPassword}
              onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
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

        <label className="checkbox-row checkbox-row-wide">
          <input
            type="checkbox"
            checked={form.acceptedTerms}
            onChange={(event) => setForm((current) => ({ ...current, acceptedTerms: event.target.checked }))}
          />
          <span>I agree to the terms and understand my information will be used for patient care and communication.</span>
        </label>

        {authError && (
          <div className="inline-alert" role="alert">
            <AlertCircle size={16} />
            <span>{authError}</span>
          </div>
        )}

        {successMessage && (
          <div className="success-alert success-alert-stack" role="status">
            <CheckCircle2 size={18} />
            <div>
              <strong>Welcome to Plamenco Dental Co., {form.firstName || 'Patient'}.</strong>
              <span>Please confirm your account through the email we sent you.</span>
            </div>
          </div>
        )}

        <Button type="submit" icon={<ArrowRight size={16} />} disabled={isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>
    </AuthShell>
  )
}
