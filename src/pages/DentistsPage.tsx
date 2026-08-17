import { CalendarClock, Clock3, MapPin, PencilLine, Plus, Save, Search, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { getStoredBranches, loadBranchesFromSupabase } from '../features/branches/branchStore'
import type { Branch } from '../features/branches/branchTypes'
import { usePermissions } from '../features/auth/permissions'
import {
  createAvailabilityOverride,
  createProvider,
  getProviderAvailabilityOverrides,
  getProviderBranchAssignments,
  getProviderScheduleBlocks,
  getStoredProviders,
  loadProviderFoundationFromSupabase,
  saveScheduleBlocks,
  updateProvider,
} from '../features/dentists/dentistStore'
import type { Provider, ProviderFormValues, ProviderScheduleBlock } from '../features/dentists/dentistTypes'
import { recordAuditEntry } from '../features/security/auditLogStore'
import { getCurrentSessionUserName } from '../features/security/security'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const emptyProviderForm: ProviderFormValues = {
  profileId: '',
  displayName: '',
  role: 'dentist',
  email: '',
  phone: '',
  specialization: '',
  licenseNumber: '',
  bio: '',
  photoUrl: '',
  status: 'active',
}

function formatTime(value: string) {
  const [hour = 0, minute = 0] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function roleLabel(role: Provider['role']) {
  return role === 'associate_dentist' ? 'Associate Dentist' : 'Dentist'
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'DR'
}

function getAssignedBranches(providerId: string, branches: Branch[]) {
  const assignments = getProviderBranchAssignments().filter((assignment) => assignment.providerId === providerId && assignment.status === 'active')
  return assignments
    .map((assignment) => ({
      assignment,
      branch: branches.find((branch) => branch.id === assignment.branchId),
    }))
    .filter((entry) => entry.branch)
}

export function DentistsPage() {
  const { can } = usePermissions()
  const canManageDentists = can('dentists.manage')
  const canManageSchedules = can('schedule.manage_all')
  const [branches, setBranches] = useState<Branch[]>(() => getStoredBranches())
  const [providers, setProviders] = useState<Provider[]>(() => getStoredProviders())
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerForm, setProviderForm] = useState<ProviderFormValues>(emptyProviderForm)
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([])
  const [scheduleBlocks, setScheduleBlocks] = useState<Array<Omit<ProviderScheduleBlock, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>>>([])
  const [overrideForm, setOverrideForm] = useState({
    date: '',
    type: 'unavailable',
    branchId: '',
    startTime: '',
    endTime: '',
    reason: '',
  })

  useEffect(() => {
    let mounted = true
    void Promise.all([loadBranchesFromSupabase(), loadProviderFoundationFromSupabase()]).then(([loadedBranches, foundation]) => {
      if (!mounted) return
      setBranches(loadedBranches)
      setProviders(foundation.providers)
      setSelectedProviderId((current) => current || foundation.providers[0]?.id || '')
    })

    return () => {
      mounted = false
    }
  }, [])

  const filteredProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return providers.filter((provider) => {
      const assignments = getProviderBranchAssignments().filter((assignment) => assignment.providerId === provider.id)
      const matchesQuery = [provider.displayName, provider.email, provider.phone, provider.specialization, provider.licenseNumber]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
      const matchesBranch = branchFilter === 'all' || assignments.some((assignment) => assignment.branchId === branchFilter)
      const matchesRole = roleFilter === 'all' || provider.role === roleFilter
      const matchesStatus = statusFilter === 'all' || provider.status === statusFilter
      return matchesQuery && matchesBranch && matchesRole && matchesStatus
    })
  }, [branchFilter, providers, query, roleFilter, statusFilter])

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? filteredProviders[0] ?? providers[0] ?? null
  const selectedAssignments = selectedProvider ? getAssignedBranches(selectedProvider.id, branches) : []
  const selectedSchedules = selectedProvider ? getProviderScheduleBlocks().filter((block) => block.providerId === selectedProvider.id) : []
  const selectedOverrides = selectedProvider ? getProviderAvailabilityOverrides().filter((override) => override.providerId === selectedProvider.id) : []

  function openCreateProvider() {
    setEditingProviderId(null)
    setProviderForm(emptyProviderForm)
    setSelectedBranchIds(branches[0]?.id ? [branches[0].id] : [])
    setIsProviderModalOpen(true)
  }

  function openEditProvider(provider: Provider) {
    setEditingProviderId(provider.id)
    setProviderForm({
      profileId: provider.profileId ?? '',
      displayName: provider.displayName,
      role: provider.role,
      email: provider.email,
      phone: provider.phone,
      specialization: provider.specialization,
      licenseNumber: provider.licenseNumber,
      bio: provider.bio,
      photoUrl: provider.photoUrl,
      status: provider.status,
    })
    setSelectedBranchIds(getProviderBranchAssignments().filter((assignment) => assignment.providerId === provider.id).map((assignment) => assignment.branchId))
    setIsProviderModalOpen(true)
  }

  function submitProvider() {
    if (!providerForm.displayName.trim() || !providerForm.email.trim()) return

    const normalizedForm = {
      ...providerForm,
      profileId: providerForm.profileId?.trim() || undefined,
      displayName: providerForm.displayName.trim(),
      email: providerForm.email.trim().toLowerCase(),
      phone: providerForm.phone.trim(),
      specialization: providerForm.specialization.trim(),
      licenseNumber: providerForm.licenseNumber.trim(),
      bio: providerForm.bio.trim(),
    }

    const branchIds = selectedBranchIds.length ? selectedBranchIds : branches[0]?.id ? [branches[0].id] : []

    if (editingProviderId) {
      const updated = updateProvider(editingProviderId, normalizedForm, branchIds)
      if (updated) {
        setProviders((current) => current.map((provider) => (provider.id === updated.id ? updated : provider)))
        recordAuditEntry({
          user: getCurrentSessionUserName(),
          action: 'provider_updated',
          entity: 'provider',
          entityId: updated.id,
          metadata: { role: updated.role, status: updated.status },
        })
      }
    } else {
      const created = createProvider(normalizedForm, branchIds)
      setProviders((current) => [created, ...current])
      setSelectedProviderId(created.id)
      recordAuditEntry({
        user: getCurrentSessionUserName(),
        action: 'provider_created',
        entity: 'provider',
        entityId: created.id,
        metadata: { role: created.role, status: created.status },
      })
    }

    setIsProviderModalOpen(false)
  }

  function toggleBranch(branchId: string) {
    setSelectedBranchIds((current) => {
      if (current.includes(branchId)) return current.filter((id) => id !== branchId)
      return [...current, branchId]
    })
  }

  function loadScheduleForEditing(provider: Provider) {
    const current = getProviderScheduleBlocks()
      .filter((block) => block.providerId === provider.id)
      .map(({ branchId, dayOfWeek, endTime, startTime, status }) => ({ branchId, dayOfWeek, endTime, startTime, status }))
    setScheduleBlocks(current)
  }

  function addScheduleBlock(dayOfWeek: number) {
    setScheduleBlocks((current) => [
      ...current,
      {
        dayOfWeek,
        branchId: selectedAssignments[0]?.branch?.id ?? branches[0]?.id ?? '',
        startTime: '09:00',
        endTime: '18:00',
        status: 'active',
      },
    ])
  }

  function saveSchedules() {
    if (!selectedProvider) return
    const validBlocks = scheduleBlocks.filter((block) => block.branchId && block.startTime < block.endTime)
    saveScheduleBlocks(selectedProvider.id, validBlocks)
    recordAuditEntry({
      user: getCurrentSessionUserName(),
      action: 'provider_schedule_updated',
      entity: 'provider',
      entityId: selectedProvider.id,
      metadata: { blockCount: validBlocks.length },
    })
  }

  function addAvailabilityOverride() {
    if (!selectedProvider || !overrideForm.date) return
    createAvailabilityOverride({
      providerId: selectedProvider.id,
      branchId: overrideForm.branchId || undefined,
      date: overrideForm.date,
      type: overrideForm.type as any,
      startTime: overrideForm.startTime || undefined,
      endTime: overrideForm.endTime || undefined,
      reason: overrideForm.reason.trim(),
      privateNotes: '',
    })
    setOverrideForm({ date: '', type: 'unavailable', branchId: '', startTime: '', endTime: '', reason: '' })
    recordAuditEntry({
      user: getCurrentSessionUserName(),
      action: 'provider_availability_changed',
      entity: 'provider',
      entityId: selectedProvider.id,
      metadata: { type: overrideForm.type, date: overrideForm.date },
    })
  }

  return (
    <section className="page-stack dentists-page">
      <div className="section-header premium-section-header">
        <div>
          <Badge tone="info">Clinic</Badge>
          <h2>Dentists</h2>
          <p>Manage providers, branch assignments and availability.</p>
        </div>
        {canManageDentists && (
          <Button icon={<Plus size={16} />} onClick={openCreateProvider}>
            Add Dentist
          </Button>
        )}
      </div>

      <div className="dentist-toolbar">
        <label className="search-field staff-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search providers by name or email" />
        </label>
        <Select
          label="Branch"
          value={branchFilter}
          onChange={(event) => setBranchFilter(event.target.value)}
          options={[{ label: 'All branches', value: 'all' }, ...branches.map((branch) => ({ label: branch.name, value: branch.id }))]}
        />
        <Select
          label="Role"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          options={[
            { label: 'All roles', value: 'all' },
            { label: 'Dentist', value: 'dentist' },
            { label: 'Associate Dentist', value: 'associate_dentist' },
          ]}
        />
        <Select
          label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          options={[
            { label: 'All statuses', value: 'all' },
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
            { label: 'On Leave', value: 'on_leave' },
          ]}
        />
      </div>

      {providers.length === 0 ? (
        <EmptyState title="No dentist accounts yet" message="Create a provider profile when a dentist is ready to be invited through Supabase Auth." />
      ) : (
        <div className="dentist-workspace-grid">
          <div className="dentist-directory">
            {filteredProviders.map((provider) => {
              const assigned = getAssignedBranches(provider.id, branches)
              return (
                <button
                  className={`dentist-entry ${selectedProvider?.id === provider.id ? 'is-selected' : ''}`}
                  key={provider.id}
                  type="button"
                  onClick={() => {
                    setSelectedProviderId(provider.id)
                    loadScheduleForEditing(provider)
                  }}
                >
                  <span className="provider-avatar">{provider.photoUrl ? <img src={provider.photoUrl} alt="" /> : getInitials(provider.displayName)}</span>
                  <span className="dentist-entry-main">
                    <strong>{provider.displayName}</strong>
                    <small>{roleLabel(provider.role)}</small>
                    <em>{assigned.map((entry) => entry.branch?.city).join(', ') || 'No branch assigned'}</em>
                  </span>
                  <Badge tone={provider.status === 'active' ? 'success' : 'neutral'}>{provider.status.replace('_', ' ')}</Badge>
                </button>
              )
            })}
          </div>

          {selectedProvider && (
            <article className="panel provider-detail-panel">
              <div className="provider-detail-header">
                <span className="provider-avatar large">{selectedProvider.photoUrl ? <img src={selectedProvider.photoUrl} alt="" /> : getInitials(selectedProvider.displayName)}</span>
                <div>
                  <p className="eyebrow">Provider workspace</p>
                  <h3>{selectedProvider.displayName}</h3>
                  <span>{roleLabel(selectedProvider.role)}</span>
                </div>
                <Badge tone={selectedProvider.status === 'active' ? 'success' : 'neutral'}>{selectedProvider.status.replace('_', ' ')}</Badge>
              </div>

              <div className="provider-section-grid">
                <section>
                  <h4><UserRound size={16} /> Overview</h4>
                  <p>{selectedProvider.email}</p>
                  <p>{selectedProvider.phone || 'No phone on file'}</p>
                  <p>{selectedProvider.specialization || 'No specialization recorded'}</p>
                  {canManageDentists && (
                    <Button variant="secondary" size="sm" icon={<PencilLine size={14} />} onClick={() => openEditProvider(selectedProvider)}>
                      Edit provider
                    </Button>
                  )}
                </section>

                <section>
                  <h4><MapPin size={16} /> Branches</h4>
                  {selectedAssignments.length === 0 ? (
                    <p>No branch assignments yet.</p>
                  ) : (
                    selectedAssignments.map(({ assignment, branch }) => (
                      <div className="mini-row" key={assignment.id}>
                        <span>{branch?.name}</span>
                        <Badge tone={assignment.isPrimary ? 'info' : 'neutral'}>{assignment.isPrimary ? 'Primary' : 'Secondary'}</Badge>
                      </div>
                    ))
                  )}
                </section>
              </div>

              <section className="provider-schedule-section">
                <div className="schedule-section-header">
                  <div>
                    <h4><CalendarClock size={16} /> Weekly schedule</h4>
                    <p>{selectedSchedules.length ? `${selectedSchedules.length} working block${selectedSchedules.length === 1 ? '' : 's'} configured` : 'No working schedule configured.'}</p>
                  </div>
                  {canManageSchedules && (
                    <Button variant="secondary" size="sm" onClick={() => loadScheduleForEditing(selectedProvider)}>
                      Edit schedule
                    </Button>
                  )}
                </div>

                {canManageSchedules && (
                  <div className="schedule-editor">
                    {days.map((day, dayOfWeek) => {
                      const dayBlocks = scheduleBlocks.filter((block) => block.dayOfWeek === dayOfWeek)
                      return (
                        <div className="schedule-day" key={day}>
                          <div className="schedule-day-heading">
                            <strong>{day}</strong>
                            <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => addScheduleBlock(dayOfWeek)}>
                              Add block
                            </Button>
                          </div>
                          {dayBlocks.length === 0 ? (
                            <small>Not available</small>
                          ) : (
                            dayBlocks.map((block, blockIndex) => {
                              const globalIndex = scheduleBlocks.findIndex((entry) => entry === block)
                              return (
                                <div className="schedule-block-editor" key={`${day}-${blockIndex}`}>
                                  <select value={block.branchId} onChange={(event) => setScheduleBlocks((current) => current.map((entry, index) => index === globalIndex ? { ...entry, branchId: event.target.value } : entry))}>
                                    {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.city}</option>)}
                                  </select>
                                  <input type="time" value={block.startTime} onChange={(event) => setScheduleBlocks((current) => current.map((entry, index) => index === globalIndex ? { ...entry, startTime: event.target.value } : entry))} />
                                  <input type="time" value={block.endTime} onChange={(event) => setScheduleBlocks((current) => current.map((entry, index) => index === globalIndex ? { ...entry, endTime: event.target.value } : entry))} />
                                </div>
                              )
                            })
                          )}
                        </div>
                      )
                    })}
                    <Button icon={<Save size={16} />} onClick={saveSchedules}>Save schedule</Button>
                  </div>
                )}

                {!canManageSchedules && selectedSchedules.length > 0 && (
                  <div className="schedule-readonly-grid">
                    {selectedSchedules.map((block) => {
                      const branch = branches.find((entry) => entry.id === block.branchId)
                      return (
                        <div key={block.id} className="mini-row">
                          <span>{days[block.dayOfWeek]} - {branch?.city}</span>
                          <strong>{formatTime(block.startTime)} - {formatTime(block.endTime)}</strong>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="provider-schedule-section">
                <h4><Clock3 size={16} /> Availability exceptions</h4>
                {canManageSchedules && (
                  <div className="availability-form">
                    <Input type="date" label="Date" value={overrideForm.date} onChange={(event) => setOverrideForm({ ...overrideForm, date: event.target.value })} />
                    <Select
                      label="Type"
                      value={overrideForm.type}
                      onChange={(event) => setOverrideForm({ ...overrideForm, type: event.target.value })}
                      options={[
                        { label: 'Unavailable', value: 'unavailable' },
                        { label: 'Special hours', value: 'special_hours' },
                        { label: 'Available', value: 'available' },
                        { label: 'Leave', value: 'leave' },
                      ]}
                    />
                    <Select
                      label="Branch"
                      value={overrideForm.branchId}
                      onChange={(event) => setOverrideForm({ ...overrideForm, branchId: event.target.value })}
                      options={[{ label: 'All assigned branches', value: '' }, ...selectedAssignments.map(({ branch }) => ({ label: branch?.name ?? 'Branch', value: branch?.id ?? '' }))]}
                    />
                    <Input type="time" label="Start" value={overrideForm.startTime} onChange={(event) => setOverrideForm({ ...overrideForm, startTime: event.target.value })} />
                    <Input type="time" label="End" value={overrideForm.endTime} onChange={(event) => setOverrideForm({ ...overrideForm, endTime: event.target.value })} />
                    <Input label="Reason" value={overrideForm.reason} onChange={(event) => setOverrideForm({ ...overrideForm, reason: event.target.value })} />
                    <Button variant="secondary" onClick={addAvailabilityOverride}>Add exception</Button>
                  </div>
                )}
                {selectedOverrides.length === 0 ? (
                  <p>No availability exceptions recorded.</p>
                ) : (
                  selectedOverrides.map((override) => (
                    <div className="mini-row" key={override.id}>
                      <span>{override.date} - {override.type.replace('_', ' ')}</span>
                      <strong>{override.startTime && override.endTime ? `${formatTime(override.startTime)} - ${formatTime(override.endTime)}` : 'Full day'}</strong>
                    </div>
                  ))
                )}
              </section>
            </article>
          )}
        </div>
      )}

      {isProviderModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal provider-modal" role="dialog" aria-modal="true" aria-labelledby="provider-modal-title">
            <div className="modal-header">
              <div>
                <p className="eyebrow">{editingProviderId ? 'Edit provider' : 'New provider'}</p>
                <h2 id="provider-modal-title">{editingProviderId ? 'Edit dentist' : 'Add dentist'}</h2>
              </div>
              <Button variant="ghost" onClick={() => setIsProviderModalOpen(false)}>Close</Button>
            </div>

            <div className="form-stack">
              <div className="inline-alert" role="note">
                <ShieldCheck size={16} />
                <span>This creates the provider profile only. Supabase Auth invitation remains the secure account login path; no password is stored here.</span>
              </div>
              <div className="form-grid">
                <Input label="Display name" value={providerForm.displayName} onChange={(event) => setProviderForm({ ...providerForm, displayName: event.target.value })} required />
                <Input label="Email" type="email" value={providerForm.email} onChange={(event) => setProviderForm({ ...providerForm, email: event.target.value })} required />
                <Input label="Phone" value={providerForm.phone} onChange={(event) => setProviderForm({ ...providerForm, phone: event.target.value })} />
                <Select
                  label="Role"
                  value={providerForm.role}
                  onChange={(event) => setProviderForm({ ...providerForm, role: event.target.value as Provider['role'] })}
                  options={[
                    { label: 'Dentist', value: 'dentist' },
                    { label: 'Associate Dentist', value: 'associate_dentist' },
                  ]}
                />
                <Input label="Specialization" value={providerForm.specialization} onChange={(event) => setProviderForm({ ...providerForm, specialization: event.target.value })} />
                <Input label="License number" value={providerForm.licenseNumber} onChange={(event) => setProviderForm({ ...providerForm, licenseNumber: event.target.value })} />
                <Select
                  label="Status"
                  value={providerForm.status}
                  onChange={(event) => setProviderForm({ ...providerForm, status: event.target.value as Provider['status'] })}
                  options={[
                    { label: 'Active', value: 'active' },
                    { label: 'Inactive', value: 'inactive' },
                    { label: 'On Leave', value: 'on_leave' },
                  ]}
                />
              </div>
              <div className="branch-checkbox-group">
                <strong>Branch assignments</strong>
                {branches.map((branch) => (
                  <label key={branch.id} className="checkbox-row">
                    <input type="checkbox" checked={selectedBranchIds.includes(branch.id)} onChange={() => toggleBranch(branch.id)} />
                    <span>{branch.name}</span>
                  </label>
                ))}
                <small>The first selected branch is treated as primary.</small>
              </div>
              <div className="modal-actions">
                <Button variant="secondary" onClick={() => setIsProviderModalOpen(false)}>Cancel</Button>
                <Button onClick={submitProvider}>{editingProviderId ? 'Save dentist' : 'Create provider profile'}</Button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
