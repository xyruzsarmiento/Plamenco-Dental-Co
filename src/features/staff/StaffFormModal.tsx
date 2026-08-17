import type { FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import type { StaffFormMode, StaffFormValues } from './staffTypes'

type StaffFormModalProps = {
  error: string | null
  mode: StaffFormMode
  values: StaffFormValues
  onChange: (values: StaffFormValues) => void
  onClose: () => void
  onSubmit: () => void
}

export function StaffFormModal({
  error,
  mode,
  onChange,
  onClose,
  onSubmit,
  values,
}: StaffFormModalProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal staff-modal" aria-labelledby="staff-modal-title" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{mode === 'add' ? 'New staff account' : 'Edit staff account'}</p>
            <h2 id="staff-modal-title">{mode === 'add' ? 'Add staff' : 'Edit staff'}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close staff form" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="form-grid">
            <Input
              label="Name"
              value={values.name}
              onChange={(event) => onChange({ ...values, name: event.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={values.email}
              onChange={(event) => onChange({ ...values, email: event.target.value })}
              required
            />
            <Input
              label="Phone"
              value={values.phone}
              onChange={(event) => onChange({ ...values, phone: event.target.value })}
              required
            />
            <Input
              label="Position"
              value={values.position}
              onChange={(event) => onChange({ ...values, position: event.target.value })}
              required
            />
            <Select
              label="Role"
              value={values.role}
              onChange={(event) => onChange({ ...values, role: event.target.value as StaffFormValues['role'] })}
              options={[
                { label: 'Super Admin', value: 'super_admin' },
                { label: 'Admin', value: 'admin' },
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
              options={[
                { label: 'Active', value: 'active' },
                { label: 'Inactive', value: 'inactive' },
              ]}
            />
          </div>

          {mode === 'add' && (
            <div className="inline-alert" role="note">
              <span>New clinic accounts should be invited through Supabase Auth. No temporary password is stored here.</span>
            </div>
          )}

          {error && (
            <div className="inline-alert" role="alert">
              <span>{error}</span>
            </div>
          )}

          <div className="modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{mode === 'add' ? 'Add staff' : 'Save changes'}</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
