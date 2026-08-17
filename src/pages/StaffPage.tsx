import { useMemo, useState } from 'react'
import { Edit3, Plus, Search, ShieldCheck, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Select } from '../components/ui/Select'
import { deleteStaffMember, getStoredStaff, saveStoredStaff } from '../features/auth/staffStore'
import { StaffFormModal } from '../features/staff/StaffFormModal'
import { recordAuditEntry } from '../features/security/auditLogStore'
import { getCurrentSessionUserName } from '../features/security/security'
import { permissionGroups, roleLabels, rolePermissions } from '../features/auth/permissions'
import type { StaffFormMode, StaffFormValues, StaffMember, StaffStatus, UserRole } from '../features/staff/staffTypes'

type InternalAccountRole = Exclude<UserRole, 'patient'>

const emptyForm: StaffFormValues = {
  name: '',
  email: '',
  phone: '',
  position: '',
  role: 'staff',
  status: 'active',
  password: 'clinic123',
}

function toFormValues(staff: StaffMember): StaffFormValues {
  return {
    name: staff.name,
    email: staff.email,
    phone: staff.phone,
    position: staff.position,
    role: staff.role,
    status: staff.status,
    password: staff.password,
  }
}

export function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>(() => getStoredStaff())
  const [selectedStaffId, setSelectedStaffId] = useState(staff[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | InternalAccountRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | StaffStatus>('all')
  const [modalMode, setModalMode] = useState<StaffFormMode | null>(null)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<StaffFormValues>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  const filteredStaff = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return staff.filter((member) => {
      const matchesSearch = [member.name, member.email, member.phone, member.position]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
      const matchesRole = roleFilter === 'all' || member.role === roleFilter
      const matchesStatus = statusFilter === 'all' || member.status === statusFilter

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [query, roleFilter, staff, statusFilter])

  const selectedStaff = staff.find((member) => member.id === selectedStaffId) ?? filteredStaff[0] ?? staff[0] ?? null
  const activeStaff = staff.filter((member) => member.status === 'active').length
  const clinicalUsers = staff.filter((member) => member.role === 'dentist' || member.role === 'associate_dentist').length
  const managedUsers = staff.filter((member) => member.role === 'super_admin' || member.role === 'admin').length

  function persistStaff(nextStaff: StaffMember[]) {
    setStaff(nextStaff)
    saveStoredStaff(nextStaff)
    recordAuditEntry({
      user: getCurrentSessionUserName(),
      action: 'staff_account_changed',
      entity: 'staff',
      entityId: nextStaff[0]?.id ?? 'staff-list',
      metadata: { count: nextStaff.length },
    })
  }

  function openAddModal() {
    setFormError(null)
    setEditingStaffId(null)
    setFormValues(emptyForm)
    setModalMode('add')
  }

  function openEditModal(member: StaffMember) {
    setFormError(null)
    setEditingStaffId(member.id)
    setFormValues(toFormValues(member))
    setModalMode('edit')
  }

  function closeModal() {
    setModalMode(null)
    setEditingStaffId(null)
    setFormError(null)
  }

  function validateForm() {
    const emailOwner = staff.find(
      (member) =>
        member.email.toLowerCase() === formValues.email.trim().toLowerCase() &&
        member.id !== editingStaffId,
    )

    if (!formValues.name.trim() || !formValues.email.trim() || !formValues.position.trim()) {
      return 'Name, email, and position are required.'
    }

    if (emailOwner) {
      return 'A staff account with this email already exists.'
    }

    return null
  }

  function submitStaffForm() {
    const validationError = validateForm()

    if (validationError) {
      setFormError(validationError)
      return
    }

    const timestamp = new Date().toISOString()

    if (modalMode === 'add') {
      const nextMember: StaffMember = {
        id: crypto.randomUUID(),
        ...formValues,
        name: formValues.name.trim(),
        email: formValues.email.trim().toLowerCase(),
        phone: formValues.phone.trim(),
        position: formValues.position.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      persistStaff([nextMember, ...staff])
      setSelectedStaffId(nextMember.id)
      closeModal()
      return
    }

    const nextStaff = staff.map((member) =>
      member.id === editingStaffId
        ? {
            ...member,
            ...formValues,
            name: formValues.name.trim(),
            email: formValues.email.trim().toLowerCase(),
            phone: formValues.phone.trim(),
            position: formValues.position.trim(),
            updatedAt: timestamp,
          }
        : member,
    )
    persistStaff(nextStaff)
    closeModal()
  }

  function toggleStatus(member: StaffMember) {
    const nextStatus: StaffStatus = member.status === 'active' ? 'inactive' : 'active'
    const nextStaff = staff.map((item) =>
      item.id === member.id ? { ...item, status: nextStatus, updatedAt: new Date().toISOString() } : item,
    )
    persistStaff(nextStaff)
    recordAuditEntry({
      user: getCurrentSessionUserName(),
      action: 'staff_account_changed',
      entity: 'staff',
      entityId: member.id,
      metadata: { staffId: member.id, status: nextStatus },
    })
  }

  function deleteMember(member: StaffMember) {
    const nextStaff = deleteStaffMember(member.id)
    persistStaff(nextStaff)
    recordAuditEntry({
      user: getCurrentSessionUserName(),
      action: 'staff_account_changed',
      entity: 'staff',
      entityId: member.id,
      metadata: { staffId: member.id, action: 'delete' },
    })

    if (selectedStaffId === member.id) {
      const remaining = nextStaff[0]
      setSelectedStaffId(remaining?.id ?? '')
    }
  }

  return (
    <section className="page-stack">
      <div className="section-header premium-section-header">
        <div>
          <Badge tone="info">Super Admin foundation</Badge>
          <h2>Team &amp; Access</h2>
          <p>Manage clinic accounts, roles and permissions.</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openAddModal} disabled title="Use Supabase Auth invitation for new clinic accounts.">
          Invite account
        </Button>
      </div>

      <div className="stats-grid staff-summary-grid">
        <article className="stat-card stat-card-primary">
          <span>Total staff</span>
          <strong>{staff.length}</strong>
          <small>{activeStaff} active accounts</small>
        </article>
        <article className="stat-card">
          <span>Management</span>
          <strong>{managedUsers}</strong>
          <small>Super Admin and Admin roles</small>
        </article>
        <article className="stat-card">
          <span>Clinical users</span>
          <strong>{clinicalUsers}</strong>
          <small>Dentist account foundation</small>
        </article>
      </div>

      <div className="staff-toolbar">
        <label className="search-field staff-search">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search staff by name, email, phone, or position"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Select
          label="Role filter"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}
          options={[
            { label: 'All roles', value: 'all' },
            { label: 'Super Admin', value: 'super_admin' },
            { label: 'Admin', value: 'admin' },
            { label: 'Dentist', value: 'dentist' },
            { label: 'Associate Dentist', value: 'associate_dentist' },
            { label: 'Staff', value: 'staff' },
          ]}
        />
        <Select
          label="Status filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          options={[
            { label: 'All statuses', value: 'all' },
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
          ]}
        />
      </div>

      <div className="staff-grid">
        <section className="panel table-panel" aria-label="Staff table">
          {filteredStaff.length ? (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Phone</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map((member) => (
                    <tr
                      className={member.id === selectedStaff?.id ? 'is-selected' : ''}
                      key={member.id}
                      onClick={() => setSelectedStaffId(member.id)}
                    >
                      <td>
                        <strong>{member.name}</strong>
                        <span>{member.email}</span>
                      </td>
                      <td>{roleLabels[member.role]}</td>
                      <td>
                        <Badge tone={member.status === 'active' ? 'success' : 'neutral'}>
                          {member.status === 'active' ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td>{member.phone}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`Edit ${member.name}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              openEditModal(member)
                            }}
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            className="icon-button"
                            type="button"
                            aria-label={`${member.status === 'active' ? 'Deactivate' : 'Activate'} ${member.name}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleStatus(member)
                            }}
                          >
                            {member.status === 'active' ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
                          </button>
                          <button
                            className="icon-button danger"
                            type="button"
                            aria-label={`Delete ${member.name}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              deleteMember(member)
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No staff found" message="Adjust the search or filters to find a staff account." />
          )}
        </section>

        <aside className="panel staff-details" aria-label="Staff details">
          {selectedStaff ? (
            <>
              <div className="staff-profile-header">
                <span className="avatar">{selectedStaff.name.charAt(0)}</span>
                <div>
                  <h3>{selectedStaff.name}</h3>
                  <p>{selectedStaff.position}</p>
                </div>
              </div>
              <dl className="details-list">
                <div>
                  <dt>Email</dt>
                  <dd>{selectedStaff.email}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{selectedStaff.phone}</dd>
                </div>
                <div>
                  <dt>Role</dt>
                  <dd>{roleLabels[selectedStaff.role]}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selectedStaff.status === 'active' ? 'Active' : 'Inactive'}</dd>
                </div>
              </dl>
              <div className="details-actions">
                <Button variant="secondary" icon={<Edit3 size={16} />} onClick={() => openEditModal(selectedStaff)}>
                  Edit profile
                </Button>
                <Button
                  variant={selectedStaff.status === 'active' ? 'secondary' : 'primary'}
                  icon={<ShieldCheck size={16} />}
                  onClick={() => toggleStatus(selectedStaff)}
                >
                  {selectedStaff.status === 'active' ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  variant="danger"
                  icon={<Trash2 size={16} />}
                  onClick={() => deleteMember(selectedStaff)}
                >
                  Delete
                </Button>
              </div>
              <div className="permissions-preview">
                <p className="eyebrow">Permission preview</p>
                {permissionGroups.map((group) => {
                  const granted = group.permissions.filter((permission) => rolePermissions[selectedStaff.role].includes(permission.key))
                  if (!granted.length) return null

                  return (
                    <div key={group.label} className="permission-group-preview">
                      <strong>{group.label}</strong>
                      <span>{granted.map((permission) => permission.label).join(', ')}</span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <EmptyState title="Select staff" message="Choose a row to view staff details." />
          )}
        </aside>
      </div>

      {modalMode && (
        <StaffFormModal
          error={formError}
          mode={modalMode}
          values={formValues}
          onChange={setFormValues}
          onClose={closeModal}
          onSubmit={submitStaffForm}
        />
      )}
    </section>
  )
}
