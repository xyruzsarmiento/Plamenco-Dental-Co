import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Edit3,
  Mail,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react'
import { StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/DesignSystem'
import { PageScaffold } from '../components/ui/PageScaffold'
import { getStoredStaff, saveStoredStaff } from '../features/auth/staffStore'
import { updateInternalAccountStatus } from '../features/admin/systemAdminStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getProviderBranchAssignments, getStoredProviders } from '../features/dentists/dentistStore'
import { StaffFormModal } from '../features/staff/StaffFormModal'
import {
  getAttendanceRecords,
  getProviderCompensationRules,
  getProviderPayouts,
  getStaffShiftPlans,
  getWorkforceOverview,
} from '../features/staff/workforceStore'
import type { StaffFormValues, StaffMember, StaffStatus, UserRole } from '../features/staff/staffTypes'
import { getCurrentSessionUserName } from '../features/security/security'
import { recordAuditEntry } from '../features/security/auditLogStore'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type InternalRole = Exclude<UserRole, 'patient'>
type TeamTab = 'directory' | 'attendance' | 'providers' | 'compensation'
const TEAM_PAGE_SIZE = 10
const TEAM_CARD_PAGE_SIZE = 12

function pageItems<T>(items: T[], page: number, pageSize: number) {
  return items.slice((Math.max(1, page) - 1) * pageSize, Math.max(1, page) * pageSize)
}

type InviteState = {
  name: string
  email: string
  role: InternalRole
  branchIds: string[]
}

type InviteResponse = {
  invitation?: { id?: string; status?: string; error_message?: string }
  account?: { userId?: string; email?: string; role?: InternalRole; branchIds?: string[]; providerProfileCreated?: boolean }
  error?: string
}

const roleOptions: Array<{ value: InternalRole; label: string }> = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'dentist', label: 'Dentist' },
  { value: 'associate_dentist', label: 'Associate Dentist' },
  { value: 'staff', label: 'Staff' },
]

function roleLabel(role: InternalRole) {
  return roleOptions.find((entry) => entry.value === role)?.label ?? role.replaceAll('_', ' ')
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'TM'
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function manilaDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function formatDate(value?: string) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
}

function InviteAccountModal({ branches, onClose, onSuccess }: {
  branches: ReturnType<typeof getStoredBranches>
  onClose: () => void
  onSuccess: (response: InviteResponse, state: InviteState) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<InviteState>({ name: '', email: '', role: 'staff', branchIds: [] })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = dialogRef.current?.querySelector<HTMLElement>('input, select, button')
    first?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const firstItem = focusable[0]
      const lastItem = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus() }
      if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus() }
  }, [busy, onClose])

  function toggleBranch(branchId: string) {
    setState((current) => ({
      ...current,
      branchIds: current.branchIds.includes(branchId) ? current.branchIds.filter((id) => id !== branchId) : [...current.branchIds, branchId],
    }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setError(null)
    const name = state.name.trim()
    const email = state.email.trim().toLowerCase()
    if (!name || !email) { setError('Full name and email are required.'); return }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Enter a valid email address.'); return }
    if (!isSupabaseConfigured || !supabase) { setError('Supabase is not configured in this browser, so a real account invitation cannot be sent.'); return }

    setBusy(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<InviteResponse>('invite-internal-account', {
        body: {
          email,
          name,
          role: state.role,
          branchIds: state.branchIds,
          providerProfileRequired: state.role === 'dentist' || state.role === 'associate_dentist',
        },
      })
      if (invokeError) throw new Error(invokeError.message || 'The secure invitation service rejected the request.')
      if (data?.error) throw new Error(data.error)
      if (!data?.account?.userId || data.invitation?.status !== 'sent') {
        throw new Error('The invitation service did not confirm a sent invitation and provisioned account.')
      }
      onSuccess(data, { ...state, name, email })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to invite this internal account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="team-v26-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div ref={dialogRef} className="team-v26-modal" role="dialog" aria-modal="true" aria-labelledby="team-v26-invite-title">
        <header>
          <div><span>Secure account provisioning</span><h2 id="team-v26-invite-title">Invite internal account</h2><p>Create the authenticated account through the existing server-side Supabase invitation flow.</p></div>
          <button type="button" className="team-v26-icon-button" onClick={onClose} disabled={busy} aria-label="Close invite account dialog"><X size={18} /></button>
        </header>
        <form onSubmit={submit}>
          <section className="team-v26-form-section">
            <div className="team-v26-form-heading"><span>01</span><div><h3>Account identity</h3><p>No password is collected or stored in the browser.</p></div></div>
            <div className="team-v26-form-grid">
              <label><span>Full name</span><input autoComplete="name" value={state.name} onChange={(event) => setState({ ...state, name: event.target.value })} placeholder="e.g. Dr. Maria Santos" required /></label>
              <label><span>Email address</span><input type="email" autoComplete="email" value={state.email} onChange={(event) => setState({ ...state, email: event.target.value })} placeholder="name@clinic.com" required /></label>
              <label className="team-v26-span-2"><span>Role</span><select value={state.role} onChange={(event) => setState({ ...state, role: event.target.value as InternalRole })}>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
            </div>
          </section>

          <section className="team-v26-form-section">
            <div className="team-v26-form-heading"><span>02</span><div><h3>Clinic assignment</h3><p>The first selected branch becomes primary in the existing provisioning workflow.</p></div></div>
            <div className="team-v26-branch-picker">
              {branches.length ? branches.map((branch) => {
                const selected = state.branchIds.includes(branch.id)
                return <button key={branch.id} type="button" className={selected ? 'is-selected' : ''} onClick={() => toggleBranch(branch.id)}><span className="team-v26-branch-check">{selected ? <CheckCircle2 size={17} /> : <Building2 size={17} />}</span><span><strong>{branch.name}</strong><small>{selected && state.branchIds[0] === branch.id ? 'Primary branch' : selected ? 'Assigned branch' : 'Not assigned'}</small></span></button>
              }) : <div className="team-v26-inline-note">No active branches are currently available for assignment.</div>}
            </div>
          </section>

          <section className="team-v26-security-note">
            <ShieldCheck size={19} />
            <div><strong>Server-side invitation only</strong><p>Supabase Auth sends the invitation. For Dentist and Associate Dentist roles, the existing Edge Function also provisions the provider profile and selected branch assignments. This dialog reports success only after that service confirms the invitation.</p></div>
          </section>

          {error && <div className="team-v26-error" role="alert">{error}</div>}
          <footer><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Sending invitation…' : 'Send secure invitation'}</Button></footer>
        </form>
      </div>
    </div>
  )
}

export function TeamAccessPageV26() {
  const [staff, setStaff] = useState<StaffMember[]>(() => getStoredStaff())
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<TeamTab>('directory')
  const [selectedId, setSelectedId] = useState(staff[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | InternalRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | StaffStatus>('all')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editMember, setEditMember] = useState<StaffMember | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [directoryPage, setDirectoryPage] = useState(1)
  const [attendancePage, setAttendancePage] = useState(1)
  const [providerPage, setProviderPage] = useState(1)
  const [payoutPage, setPayoutPage] = useState(1)

  const today = manilaDateKey()
  const branches = useMemo(() => getStoredBranches(), [refreshKey])
  const providers = useMemo(() => getStoredProviders(), [refreshKey])
  const assignments = useMemo(() => getProviderBranchAssignments(), [refreshKey])
  const attendance = useMemo(() => getAttendanceRecords(), [refreshKey])
  const shifts = useMemo(() => getStaffShiftPlans(), [refreshKey])
  const rules = useMemo(() => getProviderCompensationRules(), [refreshKey])
  const payouts = useMemo(() => getProviderPayouts(), [refreshKey])
  const workforce = useMemo(() => getWorkforceOverview(today), [refreshKey, today])

  const filteredStaff = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return staff.filter((member) => {
      const searchMatch = !normalized || [member.name, member.email, member.phone, member.position].join(' ').toLowerCase().includes(normalized)
      return searchMatch && (roleFilter === 'all' || member.role === roleFilter) && (statusFilter === 'all' || member.status === statusFilter)
    })
  }, [query, roleFilter, staff, statusFilter])
  const directoryPageCount = Math.max(1, Math.ceil(filteredStaff.length / TEAM_PAGE_SIZE))
  const attendancePageCount = Math.max(1, Math.ceil(attendance.length / TEAM_CARD_PAGE_SIZE))
  const providerPageCount = Math.max(1, Math.ceil(providers.length / TEAM_CARD_PAGE_SIZE))
  const payoutPageCount = Math.max(1, Math.ceil(payouts.length / TEAM_CARD_PAGE_SIZE))
  const visibleStaff = pageItems(filteredStaff, Math.min(directoryPage, directoryPageCount), TEAM_PAGE_SIZE)
  const visibleAttendance = pageItems(attendance, Math.min(attendancePage, attendancePageCount), TEAM_CARD_PAGE_SIZE)
  const visibleProviders = pageItems(providers, Math.min(providerPage, providerPageCount), TEAM_CARD_PAGE_SIZE)
  const visiblePayouts = pageItems(payouts, Math.min(payoutPage, payoutPageCount), TEAM_CARD_PAGE_SIZE)

  useEffect(() => {
    setDirectoryPage(1)
  }, [query, roleFilter, statusFilter])

  useEffect(() => {
    setDirectoryPage((page) => Math.min(page, directoryPageCount))
    setAttendancePage((page) => Math.min(page, attendancePageCount))
    setProviderPage((page) => Math.min(page, providerPageCount))
    setPayoutPage((page) => Math.min(page, payoutPageCount))
  }, [attendancePageCount, directoryPageCount, payoutPageCount, providerPageCount])

  const selected = staff.find((member) => member.id === selectedId) ?? filteredStaff[0] ?? staff[0] ?? null
  const activeCount = staff.filter((member) => member.status === 'active').length
  const managementCount = staff.filter((member) => member.role === 'super_admin').length
  const clinicalCount = staff.filter((member) => member.role === 'dentist' || member.role === 'associate_dentist').length

  function branchName(id?: string) { return branches.find((branch) => branch.id === id)?.name ?? id ?? 'No branch assigned' }
  function providerName(id: string) { return providers.find((provider) => provider.id === id)?.displayName ?? id }
  function staffName(id: string) { return staff.find((member) => member.id === id)?.name ?? id }

  function handleInviteSuccess(response: InviteResponse, state: InviteState) {
    const userId = response.account?.userId
    if (!userId) return
    const timestamp = new Date().toISOString()
    const position = state.role === 'dentist' ? 'Dentist' : state.role === 'associate_dentist' ? 'Associate Dentist' : roleLabel(state.role)
    const nextMember: StaffMember = {
      id: userId,
      name: state.name,
      email: state.email,
      phone: '',
      position,
      role: state.role,
      status: 'active',
      password: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const next = [nextMember, ...staff.filter((member) => member.id !== userId && member.email.toLowerCase() !== state.email.toLowerCase())]
    saveStoredStaff(next)
    setStaff(next)
    setSelectedId(userId)
    setInviteOpen(false)
    setMessage(`Invitation sent to ${state.email}. The account was provisioned through the secure server-side invitation service.`)
    setRefreshKey((key) => key + 1)
    recordAuditEntry({ user: getCurrentSessionUserName(), action: 'staff_account_changed', entity: 'staff', entityId: userId, metadata: { invite: true, role: state.role } })
  }

  function toggleStatus(member: StaffMember) {
    try {
      const nextStatus: StaffStatus = member.status === 'active' ? 'inactive' : 'active'
      const next = updateInternalAccountStatus(member.id, nextStatus, getCurrentSessionUserName())
      setStaff(next)
      setMessage(`${member.name} is now ${nextStatus}.`)
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : 'Account status could not be changed.')
    }
  }

  function saveEdit(values: StaffFormValues) {
    if (!editMember) return
    if (!values.name.trim() || !values.email.trim() || !values.position.trim()) { setEditError('Name, email, and position are required.'); return }
    const duplicate = staff.some((member) => member.id !== editMember.id && member.email.toLowerCase() === values.email.trim().toLowerCase())
    if (duplicate) { setEditError('Another internal account already uses this email.'); return }
    const next = staff.map((member) => member.id === editMember.id ? { ...member, ...values, password: member.password, name: values.name.trim(), email: values.email.trim().toLowerCase(), phone: values.phone.trim(), position: values.position.trim(), updatedAt: new Date().toISOString() } : member)
    saveStoredStaff(next)
    setStaff(next)
    setEditMember(null)
    setEditError(null)
    setMessage('Directory profile updated.')
  }

  const selectedProvider = selected ? providers.find((provider) => provider.email?.toLowerCase() === selected.email.toLowerCase()) : undefined
  const selectedProviderBranches = selectedProvider ? assignments.filter((assignment) => assignment.providerId === selectedProvider.id && assignment.status === 'active') : []
  const selectedTodayAttendance = selected ? attendance.find((entry) => entry.staffId === selected.id && entry.workDate === today) : undefined
  const selectedUpcomingShifts = selected ? shifts.filter((entry) => entry.staffId === selected.id && entry.status === 'planned') : []

  return (
    <PageScaffold title="Team & Access" description="Manage clinic accounts, roles, workforce visibility, providers and compensation.">
      <div className="team-v26">
        <section className="team-v26-hero">
          <div><span className="team-v26-kicker">Identity & workforce control</span><h2>Team access command center</h2><p>Manage authenticated clinic roles and operational workforce context without storing passwords in the browser.</p></div>
          <Button onClick={() => { setMessage(null); setInviteOpen(true) }}><Plus size={16} /> Invite account</Button>
        </section>

        <section className="team-v26-trust"><ShieldCheck size={18} /><div><strong>Secure provisioning path</strong><span>New internal accounts are invited by the server-side Supabase Edge Function. The frontend never receives a service-role key.</span></div></section>

        {message && <div className="team-v26-alert is-success"><CheckCircle2 size={16} /> {message}</div>}
        {editError && !editMember && <div className="team-v26-alert is-error">{editError}</div>}

        <section className="team-v26-metrics">
          <article><i><UsersRound size={18} /></i><span>Total accounts</span><strong>{staff.length}</strong><small>{activeCount} active internal accounts</small></article>
          <article><i><ShieldCheck size={18} /></i><span>Management</span><strong>{managementCount}</strong><small>Super Admin accounts</small></article>
          <article><i><Stethoscope size={18} /></i><span>Clinical users</span><strong>{clinicalCount}</strong><small>Dentist-linked roles</small></article>
          <article><i><Clock3 size={18} /></i><span>Working today</span><strong>{workforce.clockedIn}</strong><small>{workforce.scheduledToday} scheduled shifts</small></article>
          <article><i><BadgeCheck size={18} /></i><span>Providers available</span><strong>{workforce.providersAvailable}</strong><small>{workforce.activeProviderAssignments} active branch assignments</small></article>
          <article><i><Banknote size={18} /></i><span>Pending payouts</span><strong>{formatMoney(workforce.pendingPayoutsCents)}</strong><small>Draft or approved payouts</small></article>
        </section>

        <nav className="team-v26-tabs" aria-label="Team workspace sections">
          {([['directory', 'Directory'], ['attendance', 'Attendance'], ['providers', 'Providers'], ['compensation', 'Compensation']] as Array<[TeamTab, string]>).map(([key, label]) => <button key={key} type="button" className={activeTab === key ? 'is-active' : ''} onClick={() => setActiveTab(key)}>{label}<span>{key === 'directory' ? staff.length : key === 'attendance' ? attendance.length : key === 'providers' ? providers.length : payouts.length}</span></button>)}
        </nav>

        {activeTab === 'directory' && <>
          <section className="team-v26-command">
            <label className="team-v26-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone or position" /></label>
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | InternalRole)} aria-label="Role filter"><option value="all">All roles</option>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | StaffStatus)} aria-label="Status filter"><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          </section>

          <div className="team-v26-workspace">
            <section className="team-v26-directory">
              <header><div><span>Internal directory</span><h3>{filteredStaff.length} accounts</h3></div><small>Authenticated role foundation</small></header>
              {filteredStaff.length === 0 ? <div className="team-v26-empty"><UsersRound size={30} /><h3>No matching team members</h3><p>Adjust the filters or invite an internal account.</p></div> : <div className="team-v26-list">{visibleStaff.map((member) => <button key={member.id} type="button" className={`team-v26-row ${selected?.id === member.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(member.id)}><span className="team-v26-avatar">{initials(member.name)}</span><span className="team-v26-row-copy"><strong>{member.name}</strong><span>{member.email}</span><small>{member.position || roleLabel(member.role)} · {member.phone || 'No phone on directory profile'}</small></span><span className="team-v26-row-meta"><StatusBadge status={member.status} variant="compact" /><strong>{roleLabel(member.role)}</strong><ChevronRight size={16} /></span></button>)}</div>}
              <Pagination page={directoryPage} pageCount={directoryPageCount} totalItems={filteredStaff.length} pageSize={TEAM_PAGE_SIZE} onPageChange={setDirectoryPage} label="Internal directory pages" />
            </section>

            <aside className="team-v26-detail">
              {!selected ? <div className="team-v26-empty"><UserRoundCheck size={30} /><h3>Select a team member</h3><p>Choose an internal account to review access and workforce context.</p></div> : <div className="team-v26-detail-stack">
                <header className="team-v26-profile-head"><span className="team-v26-avatar is-large">{initials(selected.name)}</span><div><span>Internal account</span><h3>{selected.name}</h3><p>{selected.position || roleLabel(selected.role)}</p></div><StatusBadge status={selected.status} /></header>
                <section className="team-v26-access-card"><div><ShieldCheck size={18} /><span><strong>{roleLabel(selected.role)}</strong><small>Role-based access</small></span></div><div><Mail size={18} /><span><strong>{selected.email}</strong><small>Login identity</small></span></div><div><MapPin size={18} /><span><strong>{selectedProviderBranches.length ? selectedProviderBranches.map((entry) => branchName(entry.branchId)).join(', ') : 'No visible branch assignment'}</strong><small>{selectedProvider ? 'Provider branch linkage' : 'Staff branch assignments are managed server-side'}</small></span></div></section>
                <section className="team-v26-context-grid"><article><span>Today</span><strong>{selectedTodayAttendance ? selectedTodayAttendance.status.replaceAll('_', ' ') : 'No attendance record'}</strong><small>{selectedTodayAttendance?.timeIn ? `In ${selectedTodayAttendance.timeIn}${selectedTodayAttendance.timeOut ? ` · Out ${selectedTodayAttendance.timeOut}` : ''}` : 'No clock-in recorded'}</small></article><article><span>Provider linkage</span><strong>{selectedProvider?.displayName ?? 'Not linked'}</strong><small>{selectedProvider ? `${selectedProviderBranches.length} branch assignment(s)` : 'No matching provider profile in current client data'}</small></article></section>
                <section className="team-v26-shifts"><header><div><span>Workforce context</span><h4>Upcoming shifts</h4></div><b>{selectedUpcomingShifts.length}</b></header>{selectedUpcomingShifts.length ? selectedUpcomingShifts.map((shift) => <div key={shift.id}><CalendarClock size={16} /><span><strong>{formatDate(shift.workDate)} · {shift.startTime}–{shift.endTime}</strong><small>{branchName(shift.branchId)}</small></span></div>) : <p>No planned shifts in the current workforce store.</p>}</section>
                <footer className="team-v26-detail-actions"><Button variant="secondary" onClick={() => { setEditError(null); setEditMember(selected) }}><Edit3 size={15} /> Edit directory profile</Button><Button variant="secondary" onClick={() => toggleStatus(selected)}>{selected.status === 'active' ? 'Deactivate account' : 'Activate account'}</Button></footer>
              </div>}
            </aside>
          </div>
        </>}

        {activeTab === 'attendance' && <section className="team-v26-section"><header><div><span>Workforce attendance</span><h3>Attendance & shift records</h3><p>Recorded attendance and planned shifts from the existing workforce store.</p></div></header><div className="team-v26-card-grid">{attendance.length ? visibleAttendance.map((record) => <article key={record.id}><div className="team-v26-card-icon"><Clock3 size={17} /></div><div><strong>{staffName(record.staffId)}</strong><span>{formatDate(record.workDate)} · {branchName(record.branchId)}</span><small>{record.status.replaceAll('_', ' ')}{record.timeIn ? ` · ${record.timeIn}${record.timeOut ? `–${record.timeOut}` : ''}` : ''}</small></div><StatusBadge status={record.status} variant="compact" /></article>) : <div className="team-v26-empty team-v26-span-all"><CalendarClock size={30} /><h3>No attendance records</h3><p>Attendance activity will appear here when it exists.</p></div>}</div><Pagination page={attendancePage} pageCount={attendancePageCount} totalItems={attendance.length} pageSize={TEAM_CARD_PAGE_SIZE} onPageChange={setAttendancePage} label="Operational schedule pages" /></section>}

        {activeTab === 'providers' && <section className="team-v26-section"><header><div><span>Clinical workforce</span><h3>Provider access foundation</h3><p>Provider profiles and their active branch assignments.</p></div></header><div className="team-v26-card-grid">{providers.length ? visibleProviders.map((provider) => { const providerAssignments = assignments.filter((entry) => entry.providerId === provider.id && entry.status === 'active'); return <article key={provider.id}><span className="team-v26-avatar">{initials(provider.displayName)}</span><div><strong>{provider.displayName}</strong><span>{provider.role.replaceAll('_', ' ')} · {provider.specialization || 'General dentistry'}</span><small>{providerAssignments.length ? providerAssignments.map((entry) => branchName(entry.branchId)).join(', ') : 'No active branch assignment'}</small></div><StatusBadge status={provider.status} variant="compact" /></article> }) : <div className="team-v26-empty team-v26-span-all"><Stethoscope size={30} /><h3>No provider profiles</h3><p>Invite a Dentist or Associate Dentist to provision a provider profile through the secure invitation workflow.</p></div>}</div><Pagination page={providerPage} pageCount={providerPageCount} totalItems={providers.length} pageSize={TEAM_CARD_PAGE_SIZE} onPageChange={setProviderPage} label="Provider directory pages" /></section>}

        {activeTab === 'compensation' && <section className="team-v26-section"><header><div><span>Provider compensation</span><h3>Payout & rule visibility</h3><p>Existing compensation rules and recorded provider payouts. No payout is inferred from treatment value alone.</p></div></header><div className="team-v26-comp-summary"><article><span>Rules</span><strong>{rules.length}</strong></article><article><span>Payout records</span><strong>{payouts.length}</strong></article><article><span>Pending amount</span><strong>{formatMoney(workforce.pendingPayoutsCents)}</strong></article></div><div className="team-v26-card-grid">{payouts.length ? visiblePayouts.map((payout) => <article key={payout.id}><div className="team-v26-card-icon"><Banknote size={17} /></div><div><strong>{payout.payoutNumber} · {providerName(payout.providerId)}</strong><span>{formatDate(payout.periodStart)} – {formatDate(payout.periodEnd)}</span><small>{branchName(payout.branchId)} · {formatMoney(payout.payoutAmountCents)}</small></div><StatusBadge status={payout.status} variant="compact" /></article>) : <div className="team-v26-empty team-v26-span-all"><Banknote size={30} /><h3>No provider payouts</h3><p>Compensation records will appear here when they are created by the existing workflow.</p></div>}</div><Pagination page={payoutPage} pageCount={payoutPageCount} totalItems={payouts.length} pageSize={TEAM_CARD_PAGE_SIZE} onPageChange={setPayoutPage} label="Provider payout pages" /></section>}
      </div>

      {inviteOpen && <InviteAccountModal branches={branches} onClose={() => setInviteOpen(false)} onSuccess={handleInviteSuccess} />}
      {editMember && <StaffFormModal mode="edit" values={{ name: editMember.name, email: editMember.email, phone: editMember.phone, position: editMember.position, role: editMember.role, status: editMember.status, password: editMember.password }} error={editError} onChange={(values) => setEditMember((current) => current ? { ...current, ...values } : current)} onClose={() => { setEditMember(null); setEditError(null) }} onSubmit={() => editMember && saveEdit({ name: editMember.name, email: editMember.email, phone: editMember.phone, position: editMember.position, role: editMember.role, status: editMember.status, password: editMember.password })} />}
    </PageScaffold>
  )
}
