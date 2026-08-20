import {
  Activity,
  BadgeCheck,
  Building2,
  CalendarClock,
  ChevronRight,
  Clock3,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function roleLabel(role: Provider['role']) {
  return role === 'associate_dentist' ? 'Associate Dentist' : 'Dentist'
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'DR'
}

function getAssignedBranches(providerId: string, branches: Branch[]) {
  const assignments = getProviderBranchAssignments().filter((assignment) => assignment.providerId === providerId && assignment.status === 'active')
  return assignments
    .map((assignment) => ({ assignment, branch: branches.find((branch) => branch.id === assignment.branchId) }))
    .filter((entry) => entry.branch)
}

function providerIdentityKey(provider: Provider) {
  const email = provider.email.trim().toLowerCase()
  const license = provider.licenseNumber.trim().toLowerCase()
  if (email) return `email:${email}`
  if (license) return `license:${license}`
  return `name:${provider.displayName.trim().toLowerCase()}|role:${provider.role}`
}

function dedupeProviders(rows: Provider[]) {
  const byId = new Map<string, Provider>()
  rows.forEach((provider) => byId.set(provider.id, provider))
  const byIdentity = new Map<string, Provider>()
  Array.from(byId.values()).forEach((provider) => {
    const key = providerIdentityKey(provider)
    const current = byIdentity.get(key)
    if (!current || new Date(provider.updatedAt).getTime() > new Date(current.updatedAt).getTime()) byIdentity.set(key, provider)
  })
  return Array.from(byIdentity.values()).sort((a, b) => a.displayName.localeCompare(b.displayName))
}

function ProviderModal({
  editingProviderId,
  providerForm,
  setProviderForm,
  branches,
  selectedBranchIds,
  toggleBranch,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  editingProviderId: string | null
  providerForm: ProviderFormValues
  setProviderForm: (value: ProviderFormValues) => void
  branches: Branch[]
  selectedBranchIds: string[]
  toggleBranch: (branchId: string) => void
  onClose: () => void
  onSubmit: () => void
  isSubmitting: boolean
  error: string | null
}) {
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const focusable = dialog?.querySelector<HTMLElement>('input, select, textarea, button')
    focusable?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      previous?.focus?.()
    }
  }, [isSubmitting, onClose])

  return (
    <div className="dv16-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onClose() }}>
      <section ref={dialogRef} className="dv16-provider-modal" role="dialog" aria-modal="true" aria-labelledby="dv16-provider-modal-title">
        <header className="dv16-modal-header">
          <div>
            <span className="dv16-kicker">{editingProviderId ? 'Provider profile' : 'New provider'}</span>
            <h2 id="dv16-provider-modal-title">{editingProviderId ? 'Edit dentist' : 'Add dentist'}</h2>
            <p>{editingProviderId ? 'Update professional details, clinic role and branch coverage.' : 'Create a provider profile for scheduling, clinical attribution and branch operations.'}</p>
          </div>
          <button type="button" className="dv16-icon-button" onClick={onClose} disabled={isSubmitting} aria-label="Close provider dialog"><X size={20} /></button>
        </header>

        <div className="dv16-security-note" role="note">
          <ShieldCheck size={18} />
          <div><strong>Secure account provisioning stays separate</strong><span>This creates the provider profile only. Supabase Auth invitation remains the secure login path; no password is stored here.</span></div>
        </div>

        {error && <div className="dv16-form-error" role="alert">{error}</div>}

        <div className="dv16-modal-body">
          <section className="dv16-form-section">
            <div className="dv16-form-section-head"><span className="dv16-form-icon"><UserRound size={17} /></span><div><h3>Provider identity</h3><p>Contact and role information used across clinic operations.</p></div></div>
            <div className="dv16-form-grid">
              <Input label="Display name" value={providerForm.displayName} onChange={(event) => setProviderForm({ ...providerForm, displayName: event.target.value })} required />
              <Input label="Email" type="email" value={providerForm.email} onChange={(event) => setProviderForm({ ...providerForm, email: event.target.value })} required />
              <Input label="Phone" value={providerForm.phone} onChange={(event) => setProviderForm({ ...providerForm, phone: event.target.value })} />
              <Select label="Role" value={providerForm.role} onChange={(event) => setProviderForm({ ...providerForm, role: event.target.value as Provider['role'] })} options={[{ label: 'Dentist', value: 'dentist' }, { label: 'Associate Dentist', value: 'associate_dentist' }]} />
            </div>
          </section>

          <section className="dv16-form-section">
            <div className="dv16-form-section-head"><span className="dv16-form-icon"><Stethoscope size={17} /></span><div><h3>Professional details</h3><p>Clinical specialization, licensing and profile status.</p></div></div>
            <div className="dv16-form-grid dv16-form-grid-three">
              <Input label="Specialization" value={providerForm.specialization} onChange={(event) => setProviderForm({ ...providerForm, specialization: event.target.value })} />
              <Input label="License number" value={providerForm.licenseNumber} onChange={(event) => setProviderForm({ ...providerForm, licenseNumber: event.target.value })} />
              <Select label="Status" value={providerForm.status} onChange={(event) => setProviderForm({ ...providerForm, status: event.target.value as Provider['status'] })} options={[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'On Leave', value: 'on_leave' }]} />
            </div>
          </section>

          <section className="dv16-form-section">
            <div className="dv16-form-section-head"><span className="dv16-form-icon"><Building2 size={17} /></span><div><h3>Branch assignments</h3><p>The first selected location is treated as the provider&apos;s primary branch.</p></div></div>
            <div className="dv16-branch-options">
              {branches.map((branch) => {
                const checked = selectedBranchIds.includes(branch.id)
                const primary = selectedBranchIds[0] === branch.id
                return (
                  <label className={`dv16-branch-option ${checked ? 'is-selected' : ''}`} key={branch.id}>
                    <input type="checkbox" checked={checked} onChange={() => toggleBranch(branch.id)} />
                    <span className="dv16-branch-check"><BadgeCheck size={17} /></span>
                    <span><strong>{branch.name}</strong><small>{branch.city || branch.address || 'Clinic location'}</small></span>
                    {primary && <em>Primary</em>}
                  </label>
                )
              })}
              {branches.length === 0 && <div className="dv16-empty-inline">No clinic branches are available for assignment.</div>}
            </div>
          </section>
        </div>

        <footer className="dv16-modal-footer">
          <div><span>{selectedBranchIds.length} branch{selectedBranchIds.length === 1 ? '' : 'es'} selected</span><small>Profile creation does not create an Auth password.</small></div>
          <div className="dv16-modal-actions"><Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button><Button onClick={onSubmit} disabled={isSubmitting}>{isSubmitting ? 'Saving provider…' : editingProviderId ? 'Save dentist' : 'Create provider profile'}</Button></div>
        </footer>
      </section>
    </div>
  )
}

export function DentistsPageV16() {
  const { can } = usePermissions()
  const canManageDentists = can('dentists.manage')
  const canManageSchedules = can('schedule.manage_all')
  const [branches, setBranches] = useState<Branch[]>(() => getStoredBranches())
  const [providers, setProviders] = useState<Provider[]>(() => dedupeProviders(getStoredProviders()))
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isProviderModalOpen, setIsProviderModalOpen] = useState(false)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerForm, setProviderForm] = useState<ProviderFormValues>(emptyProviderForm)
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([])
  const [isSubmittingProvider, setIsSubmittingProvider] = useState(false)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [scheduleBlocks, setScheduleBlocks] = useState<Array<Omit<ProviderScheduleBlock, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>>>([])
  const [overrideForm, setOverrideForm] = useState({ date: '', type: 'unavailable', branchId: '', startTime: '', endTime: '', reason: '' })

  useEffect(() => {
    let mounted = true
    void Promise.all([loadBranchesFromSupabase(), loadProviderFoundationFromSupabase()]).then(([loadedBranches, foundation]) => {
      if (!mounted) return
      const uniqueProviders = dedupeProviders(foundation.providers)
      setBranches(loadedBranches)
      setProviders(uniqueProviders)
      setSelectedProviderId((current) => current || uniqueProviders[0]?.id || '')
    })
    return () => { mounted = false }
  }, [])

  const filteredProviders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return providers.filter((provider) => {
      const assignments = getProviderBranchAssignments().filter((assignment) => assignment.providerId === provider.id)
      const matchesQuery = !normalizedQuery || [provider.displayName, provider.email, provider.phone, provider.specialization, provider.licenseNumber].join(' ').toLowerCase().includes(normalizedQuery)
      const matchesBranch = branchFilter === 'all' || assignments.some((assignment) => assignment.branchId === branchFilter)
      const matchesRole = roleFilter === 'all' || provider.role === roleFilter
      const matchesStatus = statusFilter === 'all' || provider.status === statusFilter
      return matchesQuery && matchesBranch && matchesRole && matchesStatus
    })
  }, [branchFilter, providers, query, roleFilter, statusFilter])

  useEffect(() => {
    if (filteredProviders.length && !filteredProviders.some((provider) => provider.id === selectedProviderId)) setSelectedProviderId(filteredProviders[0].id)
  }, [filteredProviders, selectedProviderId])

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? filteredProviders[0] ?? null
  const selectedAssignments = selectedProvider ? getAssignedBranches(selectedProvider.id, branches) : []
  const selectedSchedules = selectedProvider ? getProviderScheduleBlocks().filter((block) => block.providerId === selectedProvider.id) : []
  const selectedOverrides = selectedProvider ? getProviderAvailabilityOverrides().filter((override) => override.providerId === selectedProvider.id) : []

  const metrics = useMemo(() => {
    const coveredBranches = new Set(getProviderBranchAssignments().filter((assignment) => assignment.status === 'active').map((assignment) => assignment.branchId)).size
    return {
      total: providers.length,
      active: providers.filter((provider) => provider.status === 'active').length,
      associates: providers.filter((provider) => provider.role === 'associate_dentist').length,
      branches: coveredBranches,
    }
  }, [providers])

  function openCreateProvider() {
    setEditingProviderId(null)
    setProviderForm(emptyProviderForm)
    setSelectedBranchIds(branches[0]?.id ? [branches[0].id] : [])
    setProviderError(null)
    setIsProviderModalOpen(true)
  }

  function openEditProvider(provider: Provider) {
    setEditingProviderId(provider.id)
    setProviderForm({ profileId: provider.profileId ?? '', displayName: provider.displayName, role: provider.role, email: provider.email, phone: provider.phone, specialization: provider.specialization, licenseNumber: provider.licenseNumber, bio: provider.bio, photoUrl: provider.photoUrl, status: provider.status })
    setSelectedBranchIds(getProviderBranchAssignments().filter((assignment) => assignment.providerId === provider.id).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((assignment) => assignment.branchId))
    setProviderError(null)
    setIsProviderModalOpen(true)
  }

  function submitProvider() {
    const displayName = providerForm.displayName.trim()
    const email = providerForm.email.trim().toLowerCase()
    if (!displayName) return setProviderError('Display name is required.')
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return setProviderError('Enter a valid provider email address.')
    const duplicate = providers.find((provider) => provider.id !== editingProviderId && (provider.email.trim().toLowerCase() === email || (provider.licenseNumber && providerForm.licenseNumber && provider.licenseNumber.trim().toLowerCase() === providerForm.licenseNumber.trim().toLowerCase())))
    if (duplicate) return setProviderError(`A provider profile already exists for ${duplicate.displayName}.`)

    setIsSubmittingProvider(true)
    setProviderError(null)
    try {
      const normalizedForm = { ...providerForm, profileId: providerForm.profileId?.trim() || undefined, displayName, email, phone: providerForm.phone.trim(), specialization: providerForm.specialization.trim(), licenseNumber: providerForm.licenseNumber.trim(), bio: providerForm.bio.trim() }
      const branchIds = selectedBranchIds.length ? selectedBranchIds : branches[0]?.id ? [branches[0].id] : []
      if (editingProviderId) {
        const updated = updateProvider(editingProviderId, normalizedForm, branchIds)
        if (!updated) throw new Error('Provider profile could not be updated.')
        setProviders((current) => dedupeProviders(current.map((provider) => provider.id === updated.id ? updated : provider)))
        recordAuditEntry({ user: getCurrentSessionUserName(), action: 'provider_updated', entity: 'provider', entityId: updated.id, metadata: { role: updated.role, status: updated.status } })
      } else {
        const created = createProvider(normalizedForm, branchIds)
        setProviders((current) => dedupeProviders([created, ...current]))
        setSelectedProviderId(created.id)
        recordAuditEntry({ user: getCurrentSessionUserName(), action: 'provider_created', entity: 'provider', entityId: created.id, metadata: { role: created.role, status: created.status } })
      }
      setIsProviderModalOpen(false)
    } catch (cause) {
      setProviderError(cause instanceof Error ? cause.message : 'Provider profile could not be saved.')
    } finally {
      setIsSubmittingProvider(false)
    }
  }

  function toggleBranch(branchId: string) {
    setSelectedBranchIds((current) => current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId])
  }

  function loadScheduleForEditing(provider: Provider) {
    setScheduleBlocks(getProviderScheduleBlocks().filter((block) => block.providerId === provider.id).map(({ branchId, dayOfWeek, endTime, startTime, status }) => ({ branchId, dayOfWeek, endTime, startTime, status })))
  }

  function addScheduleBlock(dayOfWeek: number) {
    setScheduleBlocks((current) => [...current, { dayOfWeek, branchId: selectedAssignments[0]?.branch?.id ?? branches[0]?.id ?? '', startTime: '09:00', endTime: '18:00', status: 'active' }])
  }

  function saveSchedules() {
    if (!selectedProvider) return
    const validBlocks = scheduleBlocks.filter((block) => block.branchId && block.startTime < block.endTime)
    saveScheduleBlocks(selectedProvider.id, validBlocks)
    recordAuditEntry({ user: getCurrentSessionUserName(), action: 'provider_schedule_updated', entity: 'provider', entityId: selectedProvider.id, metadata: { blockCount: validBlocks.length } })
  }

  function addAvailabilityOverride() {
    if (!selectedProvider || !overrideForm.date) return
    createAvailabilityOverride({ providerId: selectedProvider.id, branchId: overrideForm.branchId || undefined, date: overrideForm.date, type: overrideForm.type as any, startTime: overrideForm.startTime || undefined, endTime: overrideForm.endTime || undefined, reason: overrideForm.reason.trim(), privateNotes: '' })
    setOverrideForm({ date: '', type: 'unavailable', branchId: '', startTime: '', endTime: '', reason: '' })
    recordAuditEntry({ user: getCurrentSessionUserName(), action: 'provider_availability_changed', entity: 'provider', entityId: selectedProvider.id, metadata: { type: overrideForm.type, date: overrideForm.date } })
  }

  return (
    <section className="dv16-page">
      <header className="dv16-hero">
        <div><span className="dv16-kicker">Provider operations</span><h2>Dentists & providers</h2><p>Manage clinical providers, branch coverage, weekly schedules and availability exceptions from one workspace.</p></div>
        {canManageDentists && <Button icon={<Plus size={16} />} onClick={openCreateProvider}>Add dentist</Button>}
      </header>

      <section className="dv16-metrics" aria-label="Provider summary">
        <article><span className="dv16-metric-icon"><UsersRound size={18} /></span><div><small>Total providers</small><strong>{metrics.total}</strong><p>Provider profiles in the clinic</p></div></article>
        <article><span className="dv16-metric-icon"><Activity size={18} /></span><div><small>Active providers</small><strong>{metrics.active}</strong><p>Currently active profiles</p></div></article>
        <article><span className="dv16-metric-icon"><Building2 size={18} /></span><div><small>Branches covered</small><strong>{metrics.branches}</strong><p>Locations with active assignments</p></div></article>
        <article><span className="dv16-metric-icon"><Stethoscope size={18} /></span><div><small>Associate dentists</small><strong>{metrics.associates}</strong><p>Associate provider profiles</p></div></article>
      </section>

      <section className="dv16-command-bar">
        <label className="dv16-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, specialization or license" /></label>
        <Select label="Branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} options={[{ label: 'All branches', value: 'all' }, ...branches.map((branch) => ({ label: branch.name, value: branch.id }))]} />
        <Select label="Role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} options={[{ label: 'All roles', value: 'all' }, { label: 'Dentist', value: 'dentist' }, { label: 'Associate Dentist', value: 'associate_dentist' }]} />
        <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} options={[{ label: 'All statuses', value: 'all' }, { label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }, { label: 'On Leave', value: 'on_leave' }]} />
      </section>

      {providers.length === 0 ? <EmptyState title="No dentist profiles yet" message="Create a provider profile when a dentist is ready to be configured for clinic operations." /> : (
        <div className="dv16-workspace">
          <aside className="dv16-directory">
            <div className="dv16-directory-head"><div><span className="dv16-kicker">Provider directory</span><h3>{filteredProviders.length} provider{filteredProviders.length === 1 ? '' : 's'}</h3></div><UsersRound size={19} /></div>
            <div className="dv16-provider-list">
              {filteredProviders.map((provider) => {
                const assigned = getAssignedBranches(provider.id, branches)
                const schedules = getProviderScheduleBlocks().filter((block) => block.providerId === provider.id && block.status === 'active')
                const primary = assigned.find(({ assignment }) => assignment.isPrimary)?.branch ?? assigned[0]?.branch
                return (
                  <button className={`dv16-provider-card ${selectedProvider?.id === provider.id ? 'is-selected' : ''}`} key={provider.id} type="button" onClick={() => { setSelectedProviderId(provider.id); loadScheduleForEditing(provider) }}>
                    <span className="dv16-avatar">{provider.photoUrl ? <img src={provider.photoUrl} alt="" /> : getInitials(provider.displayName)}</span>
                    <span className="dv16-provider-card-copy"><span className="dv16-provider-name-row"><strong>{provider.displayName}</strong><Badge tone={provider.status === 'active' ? 'success' : 'neutral'}>{provider.status.replace('_', ' ')}</Badge></span><small>{roleLabel(provider.role)}{provider.specialization ? ` · ${provider.specialization}` : ''}</small><em>{primary?.name || 'No branch assigned'}{assigned.length > 1 ? ` +${assigned.length - 1}` : ''}</em><span className="dv16-schedule-hint"><CalendarClock size={13} /> {schedules.length ? `${schedules.length} schedule blocks` : 'No schedule configured'}</span></span>
                    <ChevronRight size={17} />
                  </button>
                )
              })}
              {filteredProviders.length === 0 && <div className="dv16-empty-inline">No providers match the current filters.</div>}
            </div>
          </aside>

          {selectedProvider && (
            <main className="dv16-provider-workspace">
              <section className="dv16-provider-hero-card">
                <div className="dv16-provider-identity"><span className="dv16-avatar dv16-avatar-lg">{selectedProvider.photoUrl ? <img src={selectedProvider.photoUrl} alt="" /> : getInitials(selectedProvider.displayName)}</span><div><span className="dv16-kicker">Provider workspace</span><h2>{selectedProvider.displayName}</h2><p>{roleLabel(selectedProvider.role)}{selectedProvider.specialization ? ` · ${selectedProvider.specialization}` : ''}</p><div className="dv16-contact-line"><span><Mail size={14} />{selectedProvider.email}</span><span><Phone size={14} />{selectedProvider.phone || 'No phone on file'}</span></div></div></div>
                <div className="dv16-provider-hero-actions"><Badge tone={selectedProvider.status === 'active' ? 'success' : 'neutral'}>{selectedProvider.status.replace('_', ' ')}</Badge>{canManageDentists && <Button variant="secondary" size="sm" icon={<PencilLine size={14} />} onClick={() => openEditProvider(selectedProvider)}>Edit provider</Button>}</div>
              </section>

              <div className="dv16-profile-grid">
                <section className="dv16-info-card"><div className="dv16-card-head"><span className="dv16-card-icon"><UserRound size={17} /></span><div><span>Professional profile</span><h3>Clinical identity</h3></div></div><div className="dv16-info-rows"><div><span>Specialization</span><strong>{selectedProvider.specialization || 'Not recorded'}</strong></div><div><span>License number</span><strong>{selectedProvider.licenseNumber || 'Not recorded'}</strong></div><div><span>Role</span><strong>{roleLabel(selectedProvider.role)}</strong></div></div></section>
                <section className="dv16-info-card"><div className="dv16-card-head"><span className="dv16-card-icon"><MapPin size={17} /></span><div><span>Clinic coverage</span><h3>Branch assignments</h3></div></div><div className="dv16-branch-list">{selectedAssignments.length ? selectedAssignments.map(({ assignment, branch }) => <div key={assignment.id}><span><strong>{branch?.name}</strong><small>{branch?.city || branch?.address || 'Clinic location'}</small></span><Badge tone={assignment.isPrimary ? 'info' : 'neutral'}>{assignment.isPrimary ? 'Primary' : 'Secondary'}</Badge></div>) : <p>No branch assignments yet.</p>}</div></section>
              </div>

              <section className="dv16-schedule-card">
                <div className="dv16-section-heading"><div><span className="dv16-kicker">Weekly availability</span><h3>Provider schedule</h3><p>{selectedSchedules.length ? `${selectedSchedules.length} working block${selectedSchedules.length === 1 ? '' : 's'} currently configured.` : 'No working schedule configured yet.'}</p></div>{canManageSchedules && <Button variant="secondary" size="sm" onClick={() => loadScheduleForEditing(selectedProvider)}>Load schedule editor</Button>}</div>
                {canManageSchedules ? (
                  <div className="dv16-schedule-editor">
                    {days.map((day, dayOfWeek) => {
                      const dayBlocks = scheduleBlocks.filter((block) => block.dayOfWeek === dayOfWeek)
                      return <article className="dv16-day-card" key={day}><div className="dv16-day-head"><div><strong>{day}</strong><small>{dayBlocks.length ? `${dayBlocks.length} working block${dayBlocks.length === 1 ? '' : 's'}` : 'Not available'}</small></div><Button variant="ghost" size="sm" icon={<Plus size={13} />} onClick={() => addScheduleBlock(dayOfWeek)}>Add block</Button></div><div className="dv16-day-blocks">{dayBlocks.length ? dayBlocks.map((block, blockIndex) => { const globalIndex = scheduleBlocks.findIndex((entry) => entry === block); return <div className="dv16-schedule-block" key={`${day}-${blockIndex}`}><select value={block.branchId} onChange={(event) => setScheduleBlocks((current) => current.map((entry, index) => index === globalIndex ? { ...entry, branchId: event.target.value } : entry))}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><label><span>Start</span><input type="time" value={block.startTime} onChange={(event) => setScheduleBlocks((current) => current.map((entry, index) => index === globalIndex ? { ...entry, startTime: event.target.value } : entry))} /></label><label><span>End</span><input type="time" value={block.endTime} onChange={(event) => setScheduleBlocks((current) => current.map((entry, index) => index === globalIndex ? { ...entry, endTime: event.target.value } : entry))} /></label></div> }) : <div className="dv16-no-hours"><Clock3 size={15} /> No working hours</div>}</div></article>
                    })}
                    <div className="dv16-save-row"><Button icon={<Save size={15} />} onClick={saveSchedules}>Save weekly schedule</Button></div>
                  </div>
                ) : <div className="dv16-readonly-schedule">{selectedSchedules.map((block) => { const branch = branches.find((entry) => entry.id === block.branchId); return <div key={block.id}><span>{days[block.dayOfWeek]} · {branch?.name || 'Branch'}</span><strong>{formatTime(block.startTime)} – {formatTime(block.endTime)}</strong></div> })}</div>}
              </section>

              <section className="dv16-exceptions-card">
                <div className="dv16-section-heading"><div><span className="dv16-kicker">Exceptions</span><h3>Availability adjustments</h3><p>Record leave, unavailable dates or special hours without changing the recurring weekly schedule.</p></div></div>
                {canManageSchedules && <div className="dv16-exception-form"><Input type="date" label="Date" value={overrideForm.date} onChange={(event) => setOverrideForm({ ...overrideForm, date: event.target.value })} /><Select label="Type" value={overrideForm.type} onChange={(event) => setOverrideForm({ ...overrideForm, type: event.target.value })} options={[{ label: 'Unavailable', value: 'unavailable' }, { label: 'Special hours', value: 'special_hours' }, { label: 'Available', value: 'available' }, { label: 'Leave', value: 'leave' }]} /><Select label="Branch" value={overrideForm.branchId} onChange={(event) => setOverrideForm({ ...overrideForm, branchId: event.target.value })} options={[{ label: 'All assigned branches', value: '' }, ...selectedAssignments.map(({ branch }) => ({ label: branch?.name ?? 'Branch', value: branch?.id ?? '' }))]} /><Input type="time" label="Start" value={overrideForm.startTime} onChange={(event) => setOverrideForm({ ...overrideForm, startTime: event.target.value })} /><Input type="time" label="End" value={overrideForm.endTime} onChange={(event) => setOverrideForm({ ...overrideForm, endTime: event.target.value })} /><Input label="Reason" value={overrideForm.reason} onChange={(event) => setOverrideForm({ ...overrideForm, reason: event.target.value })} /><Button variant="secondary" onClick={addAvailabilityOverride}>Add exception</Button></div>}
                <div className="dv16-exception-list">{selectedOverrides.length ? selectedOverrides.map((override) => <div key={override.id}><span><strong>{override.date}</strong><small>{override.reason || override.type.replace('_', ' ')}</small></span><span>{override.startTime && override.endTime ? `${formatTime(override.startTime)} – ${formatTime(override.endTime)}` : 'Full day'}</span></div>) : <div className="dv16-empty-inline">No availability exceptions recorded.</div>}</div>
              </section>
            </main>
          )}
        </div>
      )}

      {isProviderModalOpen && <ProviderModal editingProviderId={editingProviderId} providerForm={providerForm} setProviderForm={setProviderForm} branches={branches} selectedBranchIds={selectedBranchIds} toggleBranch={toggleBranch} onClose={() => setIsProviderModalOpen(false)} onSubmit={submitProvider} isSubmitting={isSubmittingProvider} error={providerError} />}
    </section>
  )
}
