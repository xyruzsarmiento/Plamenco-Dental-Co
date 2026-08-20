import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Mail,
  MapPin,
  PencilLine,
  Phone,
  Search,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  X,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { getStoredAppointments } from '../features/appointments/appointmentStore'
import { usePermissions } from '../features/auth/permissions'
import { loadBranchesFromSupabase, updateBranch } from '../features/branches/branchStore'
import type { Branch, BranchFormValues } from '../features/branches/branchTypes'
import { getProviderBranchAssignments, getStoredProviders } from '../features/dentists/dentistStore'
import { recordAuditEntry } from '../features/security/auditLogStore'
import { getCurrentSessionUserName } from '../features/security/security'

function formatTime(value: string) {
  const [hour = 0, minute = 0] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function toFormValues(branch: Branch): BranchFormValues {
  return {
    name: branch.name,
    address: branch.address,
    city: branch.city,
    province: branch.province,
    phone: branch.phone,
    email: branch.email,
    openingTime: branch.openingTime,
    closingTime: branch.closingTime,
    status: branch.status,
  }
}

function initials(name: string) {
  return name
    .replace(/Plamenco Dental Co\.?/gi, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase() || 'BR'
}

function BranchEditModal({ branch, onClose, onSaved }: { branch: Branch; onClose: () => void; onSaved: (branch: Branch) => void }) {
  const [form, setForm] = useState<BranchFormValues>(() => toFormValues(branch))
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const previousActive = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const focusables = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])') ?? [])
    focusables()[0]?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const nodes = focusables()
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousActive?.focus()
    }
  }, [onClose])

  function save() {
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.province.trim()) {
      setError('Branch name, address, city, and province are required.')
      return
    }
    if (form.openingTime >= form.closingTime) {
      setError('Closing time must be later than opening time.')
      return
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Enter a valid branch email address.')
      return
    }

    const updated = updateBranch(branch.id, {
      ...form,
      name: form.name.trim(),
      address: form.address.trim(),
      city: form.city.trim(),
      province: form.province.trim(),
      phone: form.phone.trim(),
      email: form.email.trim().toLowerCase(),
    })
    if (!updated) {
      setError('Branch details could not be updated.')
      return
    }

    recordAuditEntry({
      user: getCurrentSessionUserName(),
      action: 'branch_updated',
      entity: 'branch',
      entityId: updated.id,
      metadata: { code: updated.code, status: updated.status },
    })
    onSaved(updated)
  }

  return (
    <div className="branches-v27-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="branches-v27-modal" role="dialog" aria-modal="true" aria-labelledby="branch-edit-title">
        <header>
          <div>
            <span>Branch configuration</span>
            <h2 id="branch-edit-title">Edit {branch.name}</h2>
            <p>Update public location details and operational hours without changing the branch identity or code.</p>
          </div>
          <button type="button" className="branches-v27-icon-button" onClick={onClose} aria-label="Close branch editor"><X size={18} /></button>
        </header>

        <div className="branches-v27-modal-body">
          <section className="branches-v27-form-section">
            <div className="branches-v27-section-heading"><Building2 size={17} /><div><h3>Location identity</h3><p>Patient-facing branch information.</p></div></div>
            <div className="branches-v27-form-grid">
              <label className="is-wide"><span>Branch name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label className="is-wide"><span>Street / location address</span><input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
              <label><span>City / municipality</span><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
              <label><span>Province</span><input value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} /></label>
            </div>
          </section>

          <section className="branches-v27-form-section">
            <div className="branches-v27-section-heading"><Phone size={17} /><div><h3>Contact channels</h3><p>Used for branch contact and patient-facing information.</p></div></div>
            <div className="branches-v27-form-grid">
              <label><span>Phone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="e.g. +63 9xx xxx xxxx" /></label>
              <label><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="branch@example.com" /></label>
            </div>
          </section>

          <section className="branches-v27-form-section">
            <div className="branches-v27-section-heading"><Clock3 size={17} /><div><h3>Operating setup</h3><p>General branch hours and availability status.</p></div></div>
            <div className="branches-v27-form-grid branches-v27-form-grid-three">
              <label><span>Opening time</span><input type="time" value={form.openingTime} onChange={(event) => setForm({ ...form, openingTime: event.target.value })} /></label>
              <label><span>Closing time</span><input type="time" value={form.closingTime} onChange={(event) => setForm({ ...form, closingTime: event.target.value })} /></label>
              <label><span>Status</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as BranchFormValues['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            </div>
          </section>

          <div className="branches-v27-code-note"><ShieldCheck size={17} /><div><strong>Branch code: {branch.code}</strong><span>The existing branch identifier is preserved so appointments, providers, inventory, and reports remain linked.</span></div></div>
          {error && <div className="branches-v27-error" role="alert">{error}</div>}
        </div>

        <footer>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={save}>Save branch</Button>
        </footer>
      </section>
    </div>
  )
}

export function BranchesPageV27() {
  const { can } = usePermissions()
  const canManage = can('branches.manage')
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | Branch['status']>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    void loadBranchesFromSupabase({ strict: false })
      .then((loadedBranches) => {
        if (!mounted) return
        setBranches(loadedBranches)
        setSelectedBranchId((current) => current || loadedBranches[0]?.id || '')
      })
      .catch((error) => {
        if (!mounted) return
        setLoadError(error instanceof Error ? error.message : 'Clinic branches could not be loaded.')
      })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const providers = useMemo(() => getStoredProviders(), [branches])
  const assignments = useMemo(() => getProviderBranchAssignments(), [branches])
  const appointments = useMemo(() => getStoredAppointments(), [branches])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

  const filteredBranches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return branches.filter((branch) => {
      const matchesSearch = !needle || [branch.name, branch.code, branch.address, branch.city, branch.province, branch.phone, branch.email].join(' ').toLowerCase().includes(needle)
      const matchesStatus = statusFilter === 'all' || branch.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [branches, query, statusFilter])

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? filteredBranches[0] ?? branches[0] ?? null

  const activeBranches = branches.filter((branch) => branch.status === 'active').length
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'active')
  const assignedProviderIds = new Set(activeAssignments.map((assignment) => assignment.providerId))
  const assignedProviders = providers.filter((provider) => provider.status === 'active' && assignedProviderIds.has(provider.id)).length
  const todayAppointments = appointments.filter((appointment) => appointment.date === today && !['cancelled', 'rejected', 'rescheduled'].includes(appointment.status)).length
  const contactReady = branches.filter((branch) => Boolean(branch.phone.trim() || branch.email.trim())).length

  const selectedAssignments = selectedBranch ? activeAssignments.filter((assignment) => assignment.branchId === selectedBranch.id) : []
  const selectedProviders = selectedAssignments.map((assignment) => providers.find((provider) => provider.id === assignment.providerId)).filter((provider): provider is NonNullable<typeof provider> => Boolean(provider))
  const selectedTodayAppointments = selectedBranch ? appointments.filter((appointment) => appointment.branchId === selectedBranch.id && appointment.date === today && !['cancelled', 'rejected', 'rescheduled'].includes(appointment.status)) : []
  const upcomingAppointments = selectedBranch ? appointments.filter((appointment) => appointment.branchId === selectedBranch.id && appointment.date >= today && !['cancelled', 'rejected', 'rescheduled'].includes(appointment.status)).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)).slice(0, 4) : []

  function onBranchSaved(updated: Branch) {
    setBranches((current) => current.map((branch) => branch.id === updated.id ? updated : branch))
    setEditingBranch(null)
  }

  return (
    <section className="branches-v27">
      <header className="branches-v27-hero">
        <div>
          <span className="branches-v27-kicker">Clinic network</span>
          <h2>Branch Operations</h2>
          <p>Manage clinic locations, contact readiness, provider coverage, and operational branch context from one workspace.</p>
        </div>
        <div className="branches-v27-hero-badge"><ShieldCheck size={18} /><div><strong>{activeBranches} active locations</strong><span>Existing branch identities preserved</span></div></div>
      </header>

      <section className="branches-v27-metrics" aria-label="Branch summary">
        <article><span className="branches-v27-metric-icon"><Building2 size={18} /></span><div><small>Total branches</small><strong>{branches.length}</strong><p>{activeBranches} active</p></div></article>
        <article><span className="branches-v27-metric-icon"><Stethoscope size={18} /></span><div><small>Assigned providers</small><strong>{assignedProviders}</strong><p>{activeAssignments.length} active assignments</p></div></article>
        <article><span className="branches-v27-metric-icon"><CalendarDays size={18} /></span><div><small>Appointments today</small><strong>{todayAppointments}</strong><p>Across active branch records</p></div></article>
        <article><span className="branches-v27-metric-icon"><Phone size={18} /></span><div><small>Contact ready</small><strong>{contactReady}/{branches.length}</strong><p>Phone or email recorded</p></div></article>
      </section>

      <section className="branches-v27-command">
        <label className="branches-v27-search"><Search size={17} /><input type="search" placeholder="Search branch, city, code, contact" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filter branches by status"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
      </section>

      {loadError && <div className="branches-v27-error" role="alert">{loadError}</div>}

      {loading ? (
        <section className="branches-v27-loading"><i /><i /><i /></section>
      ) : branches.length === 0 ? (
        <section className="branches-v27-empty"><Building2 size={30} /><h3>No branches configured</h3><p>Clinic branches will appear here after branch records are available.</p></section>
      ) : (
        <div className="branches-v27-workspace">
          <aside className="branches-v27-directory">
            <header><div><span>Directory</span><h3>{filteredBranches.length} locations</h3></div></header>
            {filteredBranches.length === 0 ? <div className="branches-v27-mini-empty"><Search size={22} /><strong>No matching branches</strong><span>Try a different search or status.</span></div> : filteredBranches.map((branch) => {
              const branchAssignments = activeAssignments.filter((assignment) => assignment.branchId === branch.id)
              const branchToday = appointments.filter((appointment) => appointment.branchId === branch.id && appointment.date === today && !['cancelled', 'rejected', 'rescheduled'].includes(appointment.status)).length
              return (
                <button key={branch.id} type="button" className={`branches-v27-entry ${selectedBranch?.id === branch.id ? 'is-selected' : ''}`} onClick={() => setSelectedBranchId(branch.id)}>
                  <span className="branches-v27-entry-avatar">{initials(branch.name)}</span>
                  <span className="branches-v27-entry-copy"><span><strong>{branch.name}</strong><em className={branch.status === 'active' ? 'is-active' : 'is-inactive'}>{branch.status}</em></span><small><MapPin size={13} />{branch.city}, {branch.province}</small><small>{branchAssignments.length} providers · {branchToday} appointments today</small></span>
                </button>
              )
            })}
          </aside>

          {selectedBranch && (
            <main className="branches-v27-detail">
              <section className="branches-v27-branch-head">
                <div className="branches-v27-branch-identity"><span className="branches-v27-branch-logo">{initials(selectedBranch.name)}</span><div><span>Branch workspace · {selectedBranch.code}</span><h3>{selectedBranch.name}</h3><p><MapPin size={14} /> {selectedBranch.address}</p></div></div>
                <div className="branches-v27-branch-actions"><span className={`branches-v27-status ${selectedBranch.status === 'active' ? 'is-active' : 'is-inactive'}`}><CheckCircle2 size={14} />{selectedBranch.status}</span>{canManage && <Button variant="secondary" onClick={() => setEditingBranch(selectedBranch)}><PencilLine size={16} /> Edit branch</Button>}</div>
              </section>

              <section className="branches-v27-detail-metrics">
                <article><small>Providers assigned</small><strong>{selectedProviders.length}</strong><span>{selectedAssignments.filter((assignment) => assignment.isPrimary).length} primary assignment{selectedAssignments.filter((assignment) => assignment.isPrimary).length === 1 ? '' : 's'}</span></article>
                <article><small>Appointments today</small><strong>{selectedTodayAppointments.length}</strong><span>Current branch schedule</span></article>
                <article><small>Upcoming appointments</small><strong>{appointments.filter((appointment) => appointment.branchId === selectedBranch.id && appointment.date >= today && !['cancelled', 'rejected', 'rescheduled'].includes(appointment.status)).length}</strong><span>From current records</span></article>
              </section>

              <div className="branches-v27-grid-two">
                <section className="branches-v27-card">
                  <header><div><span>Location profile</span><h4>Branch information</h4></div><Building2 size={18} /></header>
                  <div className="branches-v27-contact-list">
                    <div><span><MapPin size={16} /></span><div><small>Address</small><strong>{selectedBranch.address || 'No address on file'}</strong><p>{selectedBranch.city}, {selectedBranch.province}</p></div></div>
                    <div><span><Phone size={16} /></span><div><small>Phone</small><strong>{selectedBranch.phone || 'No phone on file'}</strong></div></div>
                    <div><span><Mail size={16} /></span><div><small>Email</small><strong>{selectedBranch.email || 'No email on file'}</strong></div></div>
                    <div><span><Clock3 size={16} /></span><div><small>General operating hours</small><strong>{formatTime(selectedBranch.openingTime)} – {formatTime(selectedBranch.closingTime)}</strong></div></div>
                  </div>
                </section>

                <section className="branches-v27-card">
                  <header><div><span>Clinical coverage</span><h4>Assigned providers</h4></div><UsersRound size={18} /></header>
                  {selectedProviders.length === 0 ? <div className="branches-v27-card-empty"><Stethoscope size={22} /><strong>No active provider assignments</strong><span>Provider coverage is managed from Dentists.</span></div> : <div className="branches-v27-provider-list">{selectedProviders.slice(0, 6).map((provider) => { const assignment = selectedAssignments.find((item) => item.providerId === provider.id); return <div key={provider.id}><span className="branches-v27-provider-avatar">{provider.displayName.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div><strong>{provider.displayName}</strong><small>{provider.specialization || (provider.role === 'associate_dentist' ? 'Associate Dentist' : 'Dentist')}</small></div>{assignment?.isPrimary && <em>Primary</em>}</div> })}</div>}
                </section>
              </div>

              <section className="branches-v27-card branches-v27-schedule-card">
                <header><div><span>Operational schedule</span><h4>Upcoming branch appointments</h4></div><CalendarDays size={18} /></header>
                {upcomingAppointments.length === 0 ? <div className="branches-v27-card-empty is-horizontal"><CalendarDays size={22} /><div><strong>No upcoming appointments</strong><span>No non-cancelled appointment records are currently scheduled for this branch.</span></div></div> : <div className="branches-v27-appointments">{upcomingAppointments.map((appointment) => <div key={appointment.id}><span className="branches-v27-date"><strong>{new Date(`${appointment.date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</strong><small>{formatTime(appointment.startTime)}</small></span><div><strong>{appointment.appointmentNumber || appointment.id}</strong><small>{appointment.reasonForVisit || 'Scheduled dental visit'}</small></div><em>{appointment.status.replaceAll('_', ' ')}</em></div>)}</div>}
              </section>
            </main>
          )}
        </div>
      )}

      {editingBranch && <BranchEditModal branch={editingBranch} onClose={() => setEditingBranch(null)} onSaved={onBranchSaved} />}
    </section>
  )
}
