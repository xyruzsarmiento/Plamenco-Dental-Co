import { useMemo, useState } from 'react'
import { Banknote, CalendarClock, Clock3, Edit3, Plus, Search, ShieldCheck, Stethoscope, ToggleLeft, ToggleRight } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Select } from '../components/ui/Select'
import { getStoredStaff, saveStoredStaff } from '../features/auth/staffStore'
import { StaffFormModal } from '../features/staff/StaffFormModal'
import { recordAuditEntry } from '../features/security/auditLogStore'
import { getCurrentSessionUserName } from '../features/security/security'
import { permissionGroups, roleLabels, rolePermissions } from '../features/auth/permissions'
import { updateInternalAccountStatus } from '../features/admin/systemAdminStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getProviderBranchAssignments, getProviderScheduleBlocks, getStoredProviders } from '../features/dentists/dentistStore'
import {
  clockInStaff,
  clockOutStaff,
  createProviderCompensationRule,
  createProviderPayout,
  createStaffShiftPlan,
  getAttendanceRecords,
  getProviderCompensationRules,
  getProviderPayouts,
  getProviderWorkload,
  getStaffShiftPlans,
  getWorkforceOverview,
  markStaffAttendance,
  processProviderPayout,
} from '../features/staff/workforceStore'
import type { StaffFormMode, StaffFormValues, StaffMember, StaffStatus, UserRole } from '../features/staff/staffTypes'

type InternalAccountRole = Exclude<UserRole, 'patient'>
type StaffTab = 'directory' | 'attendance' | 'providers' | 'compensation'

const emptyForm: StaffFormValues = {
  name: '',
  email: '',
  phone: '',
  position: '',
  role: 'staff',
  status: 'active',
  password: '',
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

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>(() => getStoredStaff())
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<StaffTab>('directory')
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
  const today = new Date().toISOString().slice(0, 10)
  const branches = getStoredBranches()
  const providers = useMemo(() => {
    void refreshKey
    return getStoredProviders()
  }, [refreshKey])
  const shifts = useMemo(() => {
    void refreshKey
    return getStaffShiftPlans()
  }, [refreshKey])
  const attendance = useMemo(() => {
    void refreshKey
    return getAttendanceRecords()
  }, [refreshKey])
  const compensationRules = useMemo(() => {
    void refreshKey
    return getProviderCompensationRules()
  }, [refreshKey])
  const payouts = useMemo(() => {
    void refreshKey
    return getProviderPayouts()
  }, [refreshKey])
  const workforceOverview = useMemo(() => {
    void refreshKey
    return getWorkforceOverview(today)
  }, [refreshKey, today])

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
    try {
      const nextStaff = updateInternalAccountStatus(member.id, nextStatus, getCurrentSessionUserName())
      setStaff(nextStaff)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Account status could not be changed.')
    }
  }

  function refreshWorkforce() {
    setRefreshKey((key) => key + 1)
  }

  function branchName(branchId?: string) {
    return branches.find((branch) => branch.id === branchId)?.name ?? branchId ?? 'No branch'
  }

  function providerName(providerId: string) {
    return providers.find((provider) => provider.id === providerId)?.displayName ?? providerId
  }

  function staffName(staffId: string) {
    return staff.find((member) => member.id === staffId)?.name ?? staffId
  }

  function chooseBranch() {
    const branch = window.prompt(`Branch ID\n${branches.map((entry) => `${entry.id}: ${entry.name}`).join('\n')}`, branches[0]?.id ?? 'branch-pulilan')
    return branch || null
  }

  function handlePlanShift() {
    const member = selectedStaff
    if (!member) return
    const branchId = chooseBranch()
    if (!branchId) return
    createStaffShiftPlan({
      staffId: member.id,
      branchId,
      workDate: window.prompt('Work date YYYY-MM-DD', today) ?? today,
      startTime: window.prompt('Start time HH:mm', '09:00') ?? '09:00',
      endTime: window.prompt('End time HH:mm', '18:00') ?? '18:00',
      notes: window.prompt('Shift notes', '') ?? '',
      createdBy: getCurrentSessionUserName(),
    })
    refreshWorkforce()
  }

  function handleClockIn(member: StaffMember) {
    const branchId = chooseBranch()
    if (!branchId) return
    clockInStaff({
      staffId: member.id,
      branchId,
      workDate: today,
      timeIn: window.prompt('Time in HH:mm', new Date().toTimeString().slice(0, 5)) ?? new Date().toTimeString().slice(0, 5),
      recordedBy: getCurrentSessionUserName(),
    })
    refreshWorkforce()
  }

  function handleClockOut() {
    const openRecord = attendance.find((record) => record.staffId === selectedStaff?.id && record.workDate === today && record.timeIn && !record.timeOut)
    if (!openRecord) return
    clockOutStaff(openRecord.id, window.prompt('Time out HH:mm', new Date().toTimeString().slice(0, 5)) ?? new Date().toTimeString().slice(0, 5))
    refreshWorkforce()
  }

  function handleMarkAttendance(status: 'absent' | 'on_leave') {
    const member = selectedStaff
    if (!member) return
    const branchId = chooseBranch()
    if (!branchId) return
    markStaffAttendance({
      staffId: member.id,
      branchId,
      workDate: today,
      status,
      reason: window.prompt('Reason', '') ?? '',
      recordedBy: getCurrentSessionUserName(),
    })
    refreshWorkforce()
  }

  function handleCompensationRule() {
    const provider = providers[0]
    if (!provider) return
    const providerId = window.prompt(`Provider ID\n${providers.map((entry) => `${entry.id}: ${entry.displayName}`).join('\n')}`, provider.id)
    if (!providerId) return
    const basis = (window.prompt('Basis: percentage, fixed_per_treatment, none', 'percentage') ?? 'percentage') as 'percentage' | 'fixed_per_treatment' | 'none'
    const rate = Number(window.prompt('Commission percent', basis === 'percentage' ? '10' : '0') ?? 0)
    const fixed = Number(window.prompt('Fixed amount per completed treatment in PHP', basis === 'fixed_per_treatment' ? '500' : '0') ?? 0)
    createProviderCompensationRule({
      providerId,
      branchId: window.prompt('Optional branch ID, blank for all assigned branches', '') || undefined,
      basis,
      commissionRatePercent: rate,
      fixedAmountCents: Math.round(fixed * 100),
      status: 'active',
      notes: window.prompt('Notes', '') ?? '',
      createdBy: getCurrentSessionUserName(),
    })
    refreshWorkforce()
  }

  function handleCreatePayout() {
    const provider = providers[0]
    const branch = branches[0]
    if (!provider || !branch) return
    const providerId = window.prompt(`Provider ID\n${providers.map((entry) => `${entry.id}: ${entry.displayName}`).join('\n')}`, provider.id)
    const branchId = window.prompt(`Branch ID\n${branches.map((entry) => `${entry.id}: ${entry.name}`).join('\n')}`, branch.id)
    if (!providerId || !branchId) return
    createProviderPayout({
      providerId,
      branchId,
      periodStart: window.prompt('Period start YYYY-MM-DD', `${today.slice(0, 7)}-01`) ?? `${today.slice(0, 7)}-01`,
      periodEnd: window.prompt('Period end YYYY-MM-DD', today) ?? today,
      createdBy: getCurrentSessionUserName(),
      notes: window.prompt('Payout notes', '') ?? '',
    })
    refreshWorkforce()
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
        <article className="stat-card">
          <span>Working today</span>
          <strong>{workforceOverview.clockedIn}</strong>
          <small>{workforceOverview.scheduledToday} scheduled shifts</small>
        </article>
        <article className="stat-card">
          <span>Dentists available</span>
          <strong>{workforceOverview.providersAvailable}</strong>
          <small>{workforceOverview.activeProviderAssignments} branch assignments</small>
        </article>
        <article className="stat-card">
          <span>Pending payouts</span>
          <strong>{formatMoney(workforceOverview.pendingPayoutsCents)}</strong>
          <small>Draft or approved provider payouts</small>
        </article>
      </div>

      <div className="toolbar-row" style={{ flexWrap: 'wrap' }}>
        {(['directory', 'attendance', 'providers', 'compensation'] as StaffTab[]).map((tab) => (
          <button key={tab} type="button" className={`tab-button ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'directory' && (
      <>
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
      </>
      )}

      {activeTab === 'attendance' && (
        <section className="panel table-panel">
          <div className="section-header">
            <div>
              <Badge tone="info">Today</Badge>
              <h3>Staff Scheduling & Attendance</h3>
              <p>{workforceOverview.late} late, {workforceOverview.absent} absent, {workforceOverview.onLeave} on leave.</p>
            </div>
            <div className="toolbar-row">
              <Button size="sm" icon={<CalendarClock size={14} />} onClick={handlePlanShift}>Plan Shift</Button>
              {selectedStaff && <Button size="sm" variant="secondary" icon={<Clock3 size={14} />} onClick={() => handleClockIn(selectedStaff)}>Time In</Button>}
              <Button size="sm" variant="secondary" onClick={handleClockOut}>Time Out</Button>
              <Button size="sm" variant="secondary" onClick={() => handleMarkAttendance('absent')}>Absent</Button>
              <Button size="sm" variant="secondary" onClick={() => handleMarkAttendance('on_leave')}>Leave</Button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Staff</th><th>Branch</th><th>Shift</th><th>Attendance</th><th>Reason</th></tr></thead>
              <tbody>
                {shifts.filter((shift) => shift.workDate === today).map((shift) => {
                  const record = attendance.find((entry) => entry.staffId === shift.staffId && entry.workDate === shift.workDate)
                  return (
                    <tr key={shift.id}>
                      <td><strong>{staffName(shift.staffId)}</strong><span>{formatDate(shift.workDate)}</span></td>
                      <td>{branchName(shift.branchId)}</td>
                      <td>{shift.startTime} - {shift.endTime}</td>
                      <td><Badge tone={record?.status === 'late' || record?.status === 'absent' ? 'warning' : record?.status === 'on_leave' ? 'info' : 'success'}>{record?.status?.replaceAll('_', ' ') ?? 'scheduled'}</Badge><span>{record?.timeIn ? `${record.timeIn}${record.timeOut ? ` - ${record.timeOut}` : ''}` : ''}</span></td>
                      <td>{record?.reason || shift.notes || 'No notes'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {shifts.filter((shift) => shift.workDate === today).length === 0 && <EmptyState title="No shifts today" message="Plan a branch shift for the selected staff member." />}
        </section>
      )}

      {activeTab === 'providers' && (
        <section className="panel table-panel">
          <div className="section-header">
            <div>
              <Badge tone="success">Dentist directory</Badge>
              <h3>Provider Workload</h3>
              <p>Provider schedules, branch assignments, appointments, treatments, and value stay linked to provider profiles.</p>
            </div>
            <Stethoscope size={20} />
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Provider</th><th>Branches</th><th>Schedule Blocks</th><th>Today Workload</th><th>Treatment Value</th></tr></thead>
              <tbody>
                {providers.map((provider) => {
                  const assignments = getProviderBranchAssignments().filter((assignment) => assignment.providerId === provider.id && assignment.status === 'active')
                  const workload = getProviderWorkload(provider.id, today, today)
                  return (
                    <tr key={provider.id}>
                      <td><strong>{provider.displayName}</strong><span>{provider.role.replaceAll('_', ' ')} - {provider.licenseNumber || 'No license stored'}</span></td>
                      <td>{assignments.map((assignment) => branchName(assignment.branchId)).join(', ') || 'No branch'}</td>
                      <td>{getProviderScheduleBlocks().filter((block) => block.providerId === provider.id && block.status === 'active').length}</td>
                      <td>{workload.appointmentsCount} appts / {workload.treatmentCount} treatments</td>
                      <td>{formatMoney(workload.grossTreatmentValueCents)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {providers.length === 0 && <EmptyState title="No providers found" message="Create dentist/provider profiles from the dentist management workflow." />}
        </section>
      )}

      {activeTab === 'compensation' && (
        <section className="panel table-panel">
          <div className="section-header">
            <div>
              <Badge tone="warning">Restricted financial workflow</Badge>
              <h3>Dentist Compensation & Payouts</h3>
              <p>Draft payouts are calculated from completed treatment value and posted as payroll compensation expenses only when processed.</p>
            </div>
            <div className="toolbar-row">
              <Button size="sm" icon={<Banknote size={14} />} onClick={handleCompensationRule}>Comp Rule</Button>
              <Button size="sm" variant="secondary" onClick={handleCreatePayout}>Create Payout</Button>
            </div>
          </div>
          <div className="workspace-list">
            {compensationRules.map((rule) => (
              <div key={rule.id} className="workspace-row">
                <div><strong>{providerName(rule.providerId)}</strong><span>{rule.basis.replaceAll('_', ' ')} - {rule.branchId ? branchName(rule.branchId) : 'All assigned branches'}</span><small>{rule.notes || 'No notes'}</small></div>
                <strong>{rule.basis === 'percentage' ? `${rule.commissionRatePercent}%` : formatMoney(rule.fixedAmountCents)}</strong>
              </div>
            ))}
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Payout</th><th>Provider</th><th>Branch</th><th>Period</th><th>Basis</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td><strong>{payout.payoutNumber}</strong><span>{payout.treatmentCount} treatments</span></td>
                    <td>{providerName(payout.providerId)}</td>
                    <td>{branchName(payout.branchId)}</td>
                    <td>{formatDate(payout.periodStart)} - {formatDate(payout.periodEnd)}</td>
                    <td>{payout.commissionRatePercent}% / {formatMoney(payout.fixedAmountCents)}</td>
                    <td>{formatMoney(payout.payoutAmountCents)}</td>
                    <td><Badge tone={payout.status === 'processed' ? 'success' : 'warning'}>{payout.status}</Badge></td>
                    <td>{payout.status !== 'processed' && <Button size="sm" onClick={() => { processProviderPayout(payout.id, getCurrentSessionUserName()); refreshWorkforce() }}>Process</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {payouts.length === 0 && <EmptyState title="No payouts calculated" message="Create a payout after completed treatments exist for the selected provider and branch." />}
        </section>
      )}

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
