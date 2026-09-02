import { type FormEvent, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import type { StaffFormMode, StaffFormValues } from './staffTypes'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'

type StaffFormModalProps = {
  error: string | null
  isSaving?: boolean
  lockRoleStatus?: boolean
  mode: StaffFormMode
  values: StaffFormValues
  onChange: (values: StaffFormValues) => void
  onClose: () => void
  onSubmit: () => void
}

export function StaffFormModal({
  error,
  isSaving = false,
  lockRoleStatus = false,
  mode,
  onChange,
  onClose,
  onSubmit,
  values,
}: StaffFormModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const accountLabel = values.name.trim() || values.email.trim() || (mode === 'add' ? 'New team member' : 'Internal account')
  const initials = accountLabel.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'IA'

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const releaseScrollLock = acquireModalScrollLock()
    window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), button:not([disabled])')?.focus()
    })
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSaving) onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      releaseScrollLock()
      previous?.focus()
    }
  }, [isSaving, onClose])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <div className="staff-profile-modal-v155-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !isSaving) onClose()
    }}>
      <section
        ref={dialogRef}
        className="staff-profile-modal-v155"
        aria-labelledby="staff-modal-title"
        role="dialog"
        aria-modal="true"
      >
        <header className="staff-profile-modal-v155-header">
          <span className="staff-profile-modal-v155-avatar" aria-hidden="true">{initials}</span>
          <div className="staff-profile-modal-v155-title">
            <p>{mode === 'add' ? 'New staff account' : 'Edit staff account'}</p>
            <h2 id="staff-modal-title">{mode === 'add' ? 'Add staff' : 'Edit profile'}</h2>
            <span>{accountLabel}</span>
          </div>
          <button className="staff-profile-modal-v155-close" type="button" aria-label="Close staff form" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <form className="staff-profile-modal-v155-form" onSubmit={handleSubmit}>
          <section className="staff-profile-modal-v155-summary" aria-label="Account editing context">
            <div>
              <span>Profile</span>
              <strong>{values.position || 'Clinic role'}</strong>
              <small>Directory identity and contact details.</small>
            </div>
            <div>
              <span>Access</span>
              <strong>{values.role.replaceAll('_', ' ')}</strong>
              <small>{lockRoleStatus ? 'Managed from account access.' : 'Role and status can be changed here.'}</small>
            </div>
          </section>

          <section className="staff-profile-modal-v155-fields" aria-label="Staff profile fields">
            <Input
              label="Name"
              value={values.name}
              onChange={(event) => onChange({ ...values, name: event.target.value })}
              disabled={isSaving}
              required
            />
            <Input
              label="Email"
              type="email"
              value={values.email}
              onChange={(event) => onChange({ ...values, email: event.target.value })}
              disabled={isSaving}
              required
            />
            <Input
              label="Phone"
              value={values.phone}
              onChange={(event) => onChange({ ...values, phone: event.target.value })}
              disabled={isSaving}
              required
            />
            <Input
              label="Position"
              value={values.position}
              onChange={(event) => onChange({ ...values, position: event.target.value })}
              disabled={isSaving}
              required
            />
            <Select
              label="Role"
              value={values.role}
              onChange={(event) => onChange({ ...values, role: event.target.value as StaffFormValues['role'] })}
              disabled={isSaving || lockRoleStatus}
              options={[
                { label: 'Super Admin', value: 'super_admin' },
                { label: 'Dentist', value: 'dentist' },
                { label: 'Associate Dentist', value: 'associate_dentist' },
                { label: 'Staff', value: 'staff' },
              ]}
            />
            <Select
              label="Status"
              value={values.status}
              onChange={(event) =>
                onChange({ ...values, status: event.target.value as StaffFormValues['status'] })
              }
              disabled={isSaving || lockRoleStatus}
              options={[
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
              ]}
            />
          </section>

          {lockRoleStatus && (
            <div className="staff-profile-modal-v155-note" role="note">
              <span>Role and status changes are managed from the account access panel so permission changes stay explicit.</span>
            </div>
          )}

          {mode === 'add' && (
            <div className="staff-profile-modal-v155-note" role="note">
              <span>New clinic accounts should be invited through Supabase Auth. No temporary password is stored here.</span>
            </div>
          )}

          {error && (
            <div className="staff-profile-modal-v155-note is-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <footer className="staff-profile-modal-v155-actions">
            <Button variant="secondary" type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : mode === 'add' ? 'Add staff' : 'Save changes'}</Button>
          </footer>
        </form>
      </section>
    </div>
  )
}
