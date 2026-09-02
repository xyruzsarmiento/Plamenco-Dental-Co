import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  Building2,
  CalendarClock,
  Check,
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
import { getStoredStaff, loadInternalAccountsFromProfiles, updateInternalAccountProfilePersisted, updateInternalAccountStatusPersisted } from '../features/auth/staffStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { loadStaffBranchAssignmentsAdmin, replaceStaffBranchAssignmentsPersisted, type StaffBranchAssignmentAdminRow } from '../features/branches/branchAssignmentAdmin'
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
import { acquireModalScrollLock } from '../lib/modalScrollLock'

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

type InternalInvitationInfo = {
  email: string
  role: InternalRole
  status: string
  invitedAt?: string
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

function roleDescription(role: InternalRole) {
  if (role === 'super_admin') return 'Owner-level access for clinic administration, branch control, reporting and sensitive account management.'
  if (role === 'dentist') return 'Clinical provider access for assigned branches, appointments, patients, treatments and dental records.'
  if (role === 'associate_dentist') return 'Clinical provider access for assigned branches with associate-level scheduling and patient care context.'
  return 'Operational access to appointments, patients, billing, inventory and expenses within assigned branches.'
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
  onSuccess: (response: InviteResponse, state: InviteState) => void | Promise<void>
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<InviteState>({ name: '', email: '', role: 'staff', branchIds: [] })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const releaseScrollLock = acquireModalScrollLock()
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
    return () => { document.removeEventListener('keydown', handleKey); releaseScrollLock(); previous?.focus() }
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
      await onSuccess(data, { ...state, name, email })
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
            <div className="team-v26-form-heading"><span>01</span><div><h3>Profile & status</h3><p>No password is collected or stored in the browser.</p></div></div>
            <div className="team-v26-form-grid">
              <label><span>Full name</span><input autoComplete="name" value={state.name} onChange={(event) => setState({ ...state, name: event.target.value })} placeholder="e.g. Dr. Maria Santos" required /></label>
              <label><span>Email address</span><input type="email" autoComplete="email" value={state.email} onChange={(event) => setState({ ...state, email: event.target.value })} placeholder="name@clinic.com" required /></label>
              <label className="team-v26-span-2"><span>Role</span><select value={state.role} onChange={(event) => setState({ ...state, role: event.target.value as InternalRole })}>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select><small>{roleDescription(state.role)}</small></label>
            </div>
          </section>

          <section className="team-v26-form-section">
            <div className="team-v26-form-heading"><span>02</span><div><h3>Branch access</h3><p>{state.role === 'staff' ? 'Staff branch access is editable here by Super Admin.' : 'Provider branch access is provisioned here and later managed through Dentists.'}</p></div></div>
            <div className="team-v26-branch-picker">
              {branches.length ? branches.map((branch) => {
                const selected = state.branchIds.includes(branch.id)
                return <button key={branch.id} type="button" className={selected ? 'is-selected' : ''} onClick={() => toggleBranch(branch.id)}><span className="team-v26-branch-check">{selected ? <CheckCircle2 size={17} /> : <Building2 size={17} />}</span><span><strong>{branch.name}</strong><small>{selected && state.branchIds[0] === branch.id ? 'Primary branch' : selected ? 'Assigned branch' : 'Not assigned'}</small></span></button>
              }) : <div className="team-v26-inline-note">No active branches are currently available for assignment.</div>}
            </div>
          </section>

          <section className="team-v26-security-note">
            <ShieldCheck size={19} />
            <div><strong>Invitation and account state</strong><p>Supabase Auth sends the invitation and the server confirms the internal profile before this dialog reports success.</p></div>
          </section>

          {error && <div className="team-v26-error" role="alert">{error}</div>}
          <footer><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Sending invitation…' : 'Send secure invitation'}</Button></footer>
        </form>
      </div>
    </div>
  )
}

export function TeamAccessPageV26() {
  const drawerRef = useRef<HTMLElement>(null)
  const [staff, setStaff] = useState<StaffMember[]>(() => getStoredStaff())
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState<TeamTab>('attendance')
  const [selectedId, setSelectedId] = useState(staff[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | InternalRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | StaffStatus | 'invited'>('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editMember, setEditMember] = useState<StaffMember | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [staffBranchAssignments, setStaffBranchAssignments] = useState<StaffBranchAssignmentAdminRow[]>([])
  const [accessDraftBranches, setAccessDraftBranches] = useState<string[]>([])
  const [accessPrimaryBranch, setAccessPrimaryBranch] = useState('')
  const [accessBusy, setAccessBusy] = useState(false)
  const [accessMessage, setAccessMessage] = useState<string | null>(null)
  const [accessError, setAccessError] = useState<string | null>(null)
  const [invitations, setInvitations] = useState<InternalInvitationInfo[]>([])
  const [pageLoading, setPageLoading] = useState(isSupabaseConfigured)
  const [pageError, setPageError] = useState<string | null>(null)
  const [profileBusyId, setProfileBusyId] = useState<string | null>(null)
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

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    let active = true
    setPageLoading(true)
    setPageError(null)
    void Promise.all([
      loadInternalAccountsFromProfiles({ strict: true }),
      loadStaffBranchAssignmentsAdmin(),
      supabase.from('internal_account_invitations').select('email, role, status, invited_at').order('invited_at', { ascending: false }),
    ])
      .then(([accountRows, assignmentRows, invitationResult]) => {
        if (!active) return
        if (invitationResult.error) throw new Error(invitationResult.error.message)
        const invitationRows = (invitationResult.data ?? []).map((invitation) => ({
          email: String(invitation.email ?? '').toLowerCase(),
          role: invitation.role as InternalRole,
          status: String(invitation.status ?? ''),
          invitedAt: typeof invitation.invited_at === 'string' ? invitation.invited_at : undefined,
        }))
        setStaff(accountRows)
        setStaffBranchAssignments(assignmentRows)
        setInvitations(invitationRows)
      })
      .catch((cause) => {
        if (!active) return
        const message = cause instanceof Error ? cause.message : 'Unable to load Team & Access data.'
        setPageError(message)
        setAccessError(message)
      })
      .finally(() => { if (active) setPageLoading(false) })
    return () => { active = false }
  }, [refreshKey])

  function branchIdsForMember(member: StaffMember) {
    if (member.role === 'dentist' || member.role === 'associate_dentist') {
      const provider = providers.find((entry) => entry.email?.toLowerCase() === member.email.toLowerCase())
      const providerAssignments = provider ? assignments.filter((entry) => entry.providerId === provider.id && entry.status === 'active') : []
      return providerAssignments.map((entry) => entry.branchId)
    }
    const staffAssignments = staffBranchAssignments.filter((entry) => entry.profileId === member.id && entry.status === 'active')
    return staffAssignments.map((entry) => entry.branchId)
  }

  function branchNamesForMember(member: StaffMember) {
    return branchIdsForMember(member).map((branchId) => branchName(branchId))
  }

  const invitedEmails = new Set(invitations.filter((invitation) => ['pending', 'sent'].includes(invitation.status)).map((invitation) => invitation.email))
  const normalizedQuery = query.trim().toLowerCase()
  const filteredStaff = staff.filter((member) => {
    const memberBranches = branchNamesForMember(member)
    const memberBranchIds = branchIdsForMember(member)
    const searchMatch = !normalizedQuery || [member.name, member.email, member.phone, member.position, ...memberBranches].join(' ').toLowerCase().includes(normalizedQuery)
    const branchMatch = branchFilter === 'all' || memberBranchIds.includes(branchFilter)
    const statusMatch = statusFilter === 'all' || (statusFilter === 'invited' ? invitedEmails.has(member.email.toLowerCase()) && member.status !== 'active' : member.status === statusFilter)
    return searchMatch && branchMatch && (roleFilter === 'all' || member.role === roleFilter) && statusMatch
  })
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
  }, [query, roleFilter, statusFilter, branchFilter])

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

  async function handleInviteSuccess(response: InviteResponse, state: InviteState) {
    const userId = response.account?.userId
    if (!userId) return
    const next = await loadInternalAccountsFromProfiles({ strict: true })
    setStaff(next)
    setSelectedId(userId)
    setInviteOpen(false)
    setMessage(`Invitation sent to ${state.email}. The account will remain inactive until the invite is accepted.`)
    setRefreshKey((key) => key + 1)
    recordAuditEntry({ user: getCurrentSessionUserName(), action: 'staff_account_changed', entity: 'staff', entityId: userId, metadata: { invite: true, role: state.role } })
  }

  async function toggleStatus(member: StaffMember) {
    if (profileBusyId) return
    try {
      const nextStatus: StaffStatus = member.status === 'active' ? 'inactive' : 'active'
      setProfileBusyId(member.id)
      if (!isSupabaseConfigured) throw new Error('Supabase is required to change an internal account status.')
      const next = await updateInternalAccountStatusPersisted(member.id, nextStatus)
      setStaff(next)
      setMessage(`${member.name} is now ${nextStatus}.`)
      setRefreshKey((key) => key + 1)
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : 'Account status could not be changed.')
    } finally {
      setProfileBusyId(null)
    }
  }

  async function saveEdit(values: StaffFormValues) {
    if (!editMember) return
    if (!values.name.trim() || !values.email.trim() || !values.position.trim()) { setEditError('Name, email, and position are required.'); return }
    const duplicate = staff.some((member) => member.id !== editMember.id && member.email.toLowerCase() === values.email.trim().toLowerCase())
    if (duplicate) { setEditError('Another internal account already uses this email.'); return }
    try {
      setProfileBusyId(editMember.id)
      if (!isSupabaseConfigured) throw new Error('Supabase is required to update an internal account profile.')
      const next = await updateInternalAccountProfilePersisted(editMember.id, values)
      setStaff(next)
      setEditMember(null)
      setEditError(null)
      setMessage('Directory profile updated.')
      setRefreshKey((key) => key + 1)
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : 'Directory profile could not be updated.')
    } finally {
      setProfileBusyId(null)
    }
  }

  const selectedProvider = selected ? providers.find((provider) => provider.email?.toLowerCase() === selected.email.toLowerCase()) : undefined
  const selectedProviderBranches = selectedProvider ? assignments.filter((assignment) => assignment.providerId === selectedProvider.id && assignment.status === 'active') : []
  const selectedBranchNames = selected ? branchNamesForMember(selected) : []
  const selectedTodayAttendance = selected ? attendance.find((entry) => entry.staffId === selected.id && entry.workDate === today) : undefined
  const selectedUpcomingShifts = selected ? shifts.filter((entry) => entry.staffId === selected.id && entry.status === 'planned') : []
  const selectedInvitation = selected ? invitations.find((invitation) => invitation.email === selected.email.toLowerCase()) : undefined
  const staffCount = staff.filter((member) => member.role === 'staff').length
  const pendingInvites = invitedEmails.size
  const inactiveCount = staff.filter((member) => member.status === 'inactive').length

  useEffect(() => {
    if (!selected) return
    const rows = staffBranchAssignments.filter((assignment) => assignment.profileId === selected.id && assignment.status === 'active')
    const ids = rows.map((assignment) => assignment.branchId)
    setAccessDraftBranches(ids)
    setAccessPrimaryBranch(rows.find((assignment) => assignment.isPrimary)?.branchId ?? ids[0] ?? '')
  }, [selected, staffBranchAssignments])

  useEffect(() => {
    if (!detailOpen) return undefined
    const previous = document.activeElement as HTMLElement | null
    const releaseScrollLock = acquireModalScrollLock()
    window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus()
    })
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailOpen(false)
      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const firstItem = focusable[0]
      const lastItem = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus() }
      if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => { document.removeEventListener('keydown', handleKey); releaseScrollLock(); previous?.focus() }
  }, [detailOpen])

  function openDetails(member: StaffMember) {
    setSelectedId(member.id)
    setDetailOpen(true)
    setMessage(null)
    setAccessMessage(null)
    setAccessError(null)
  }

  function openProfileEdit(member: StaffMember) {
    setEditError(null)
    setEditMember(member)
    setDetailOpen(false)
  }

  function toggleAccessBranch(branchId: string) {
    setAccessDraftBranches((current) => {
      const next = current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId]
      if (!next.includes(accessPrimaryBranch)) setAccessPrimaryBranch(next[0] ?? '')
      return next
    })
    setAccessMessage(null)
    setAccessError(null)
  }

  async function saveBranchAccess() {
    if (!selected || selected.role !== 'staff' || accessBusy) return
    setAccessBusy(true)
    setAccessError(null)
    setAccessMessage(null)
    try {
      await replaceStaffBranchAssignmentsPersisted(selected.id, accessDraftBranches, accessPrimaryBranch || undefined)
      const rows = await loadStaffBranchAssignmentsAdmin()
      setStaffBranchAssignments(rows)
      setRefreshKey((key) => key + 1)
      const confirmation = accessDraftBranches.length ? 'Branch access saved.' : 'All branch access removed for this Staff account.'
      setAccessMessage(confirmation)
      setMessage(`${selected.name}: ${confirmation}`)
    } catch (cause) {
      setAccessError(cause instanceof Error ? cause.message : 'Unable to save branch access.')
    } finally {
      setAccessBusy(false)
    }
  }

  return (
    <PageScaffold title="Team & Access" description="Manage clinic accounts, roles, workforce visibility, providers and compensation.">
      <div className="team-v26 team-v26-ia">
        <section className="team-v26-hero">
          <div><span className="team-v26-kicker">Team & access</span><h2>Manage clinic team access</h2><p>Control internal accounts, roles and branch access from one secure workspace.</p></div>
          <div className="team-v26-hero-actions"><span><ShieldCheck size={14} /> Owner controlled</span><Button onClick={() => { setMessage(null); setInviteOpen(true) }}><Plus size={16} /> Invite Team Member</Button></div>
        </section>

        <section className="team-v26-trust"><ShieldCheck size={18} /><div><strong>Secure provisioning path</strong><span>New internal accounts are invited by the server-side Supabase Edge Function. The frontend never receives a service-role key.</span></div></section>

        {message && <div className="team-v26-alert is-success"><CheckCircle2 size={16} /> {message}</div>}
        {editError && !editMember && <div className="team-v26-alert is-error">{editError}</div>}
        {pageError && <div className="team-v26-alert is-error" role="alert"><AlertTriangle size={16} /> <span>{pageError}</span><Button size="sm" variant="secondary" onClick={() => setRefreshKey((key) => key + 1)}>Retry</Button></div>}

        <section className="team-v26-metrics">
          <article><i><UsersRound size={18} /></i><span>Total accounts</span><strong>{staff.length}</strong><small>{activeCount} active internal accounts</small></article>
          <article><i><ShieldCheck size={18} /></i><span>Management</span><strong>{managementCount}</strong><small>Super Admin accounts</small></article>
          <article><i><Stethoscope size={18} /></i><span>Clinical users</span><strong>{clinicalCount}</strong><small>Dentist-linked roles</small></article>
          <article><i><Clock3 size={18} /></i><span>Working today</span><strong>{workforce.clockedIn}</strong><small>{workforce.scheduledToday} scheduled shifts</small></article>
          <article><i><BadgeCheck size={18} /></i><span>Providers available</span><strong>{workforce.providersAvailable}</strong><small>{workforce.activeProviderAssignments} active branch assignments</small></article>
          <article><i><Banknote size={18} /></i><span>Pending payouts</span><strong>{formatMoney(workforce.pendingPayoutsCents)}</strong><small>Draft or approved payouts</small></article>
        </section>

        <section className="team-v26-metrics team-v26-summary-strip" aria-label="Team access summary">
          <article><i><UsersRound size={18} /></i><span>Total members</span><strong>{staff.length}</strong><small>{activeCount} active accounts</small></article>
          <article><i><ShieldCheck size={18} /></i><span>Staff</span><strong>{staffCount}</strong><small>operations accounts</small></article>
          <article><i><Stethoscope size={18} /></i><span>Dentists</span><strong>{clinicalCount}</strong><small>provider-linked roles</small></article>
          <article><i><Clock3 size={18} /></i><span>Pending invites</span><strong>{pendingInvites}</strong><small>awaiting acceptance</small></article>
          <article><i><AlertTriangle size={18} /></i><span>Inactive</span><strong>{inactiveCount}</strong><small>disabled accounts</small></article>
        </section>

        <section className="team-v26-command team-v26-directory-controls">
          <label className="team-v26-search"><Search size={16} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search team member" /></label>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | InternalRole)} aria-label="Role filter"><option value="all">All roles</option>{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | StaffStatus | 'invited')} aria-label="Status filter"><option value="all">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="inactive">Inactive</option></select>
          <select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} aria-label="Branch filter"><option value="all">All branches</option>{branches.filter((branch) => branch.status === 'active').map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
        </section>

        <section className="team-v26-directory team-v26-people-directory">
          <header><div><span>Team directory</span><h3>{filteredStaff.length} members</h3><p>Open a profile to manage account status, branch access and role details.</p></div><small>Owner controlled - database enforced</small></header>
          {pageLoading ? <div className="team-v26-loading-list" role="status" aria-live="polite">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div> : filteredStaff.length === 0 ? <div className="team-v26-empty"><UsersRound size={30} /><h3>No team members match these filters</h3><p>Clear the search or invite a new internal account.</p><Button size="sm" variant="secondary" onClick={() => { setQuery(''); setRoleFilter('all'); setStatusFilter('all'); setBranchFilter('all') }}>Clear filters</Button></div> : <div className="team-v26-list team-v26-people-list">{visibleStaff.map((member) => {
            const memberBranches = branchNamesForMember(member)
            const branchSummary = memberBranches.length ? memberBranches.join(' - ') : 'No branch access'
            const invitation = invitations.find((entry) => entry.email === member.email.toLowerCase() && ['pending', 'sent'].includes(entry.status))
            return <article key={member.id} className="team-v26-member-row">
              <button type="button" onClick={() => openDetails(member)} aria-label={`Manage ${member.name}`}>
                <span className="team-v26-avatar">{initials(member.name)}</span>
                <span className="team-v26-row-copy"><strong>{member.name}</strong><span>{member.email}</span></span>
                <span className="team-v26-role-chip">{roleLabel(member.role)}</span>
                <span className={`team-v26-branch-summary ${memberBranches.length ? '' : 'is-empty'}`}><MapPin size={14} /> {branchSummary}</span>
                <StatusBadge status={invitation && member.status !== 'active' ? 'pending' : member.status} variant="compact" />
                <span className="team-v26-manage-link">Manage <ChevronRight size={15} /></span>
              </button>
            </article>
          })}</div>}
          <Pagination page={directoryPage} pageCount={directoryPageCount} totalItems={filteredStaff.length} pageSize={TEAM_PAGE_SIZE} onPageChange={setDirectoryPage} label="Team directory pages" />
        </section>

        <nav className="team-v26-tabs" aria-label="Team workspace sections">
          {([['attendance', 'Attendance'], ['providers', 'Providers'], ['compensation', 'Compensation']] as Array<[TeamTab, string]>).map(([key, label]) => <button key={key} type="button" className={activeTab === key ? 'is-active' : ''} onClick={() => setActiveTab(key)}>{label}<span>{key === 'attendance' ? attendance.length : key === 'providers' ? providers.length : payouts.length}</span></button>)}
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
                <footer className="team-v26-detail-actions"><Button variant="secondary" onClick={() => openProfileEdit(selected)}><Edit3 size={15} /> Edit directory profile</Button><Button variant="secondary" disabled={profileBusyId === selected.id} onClick={() => void toggleStatus(selected)}>{profileBusyId === selected.id ? 'Updating...' : selected.status === 'active' ? 'Deactivate account' : 'Activate account'}</Button></footer>
              </div>}
            </aside>
          </div>
        </>}

        {activeTab === 'attendance' && <section className="team-v26-section"><header><div><span>Workforce attendance</span><h3>Attendance & shift records</h3><p>Recorded attendance and planned shifts from the existing workforce store.</p></div></header><div className="team-v26-card-grid">{attendance.length ? visibleAttendance.map((record) => <article key={record.id}><div className="team-v26-card-icon"><Clock3 size={17} /></div><div><strong>{staffName(record.staffId)}</strong><span>{formatDate(record.workDate)} · {branchName(record.branchId)}</span><small>{record.status.replaceAll('_', ' ')}{record.timeIn ? ` · ${record.timeIn}${record.timeOut ? `–${record.timeOut}` : ''}` : ''}</small></div><StatusBadge status={record.status} variant="compact" /></article>) : <div className="team-v26-empty team-v26-span-all"><CalendarClock size={30} /><h3>No attendance records</h3><p>Attendance activity will appear here when it exists.</p></div>}</div><Pagination page={attendancePage} pageCount={attendancePageCount} totalItems={attendance.length} pageSize={TEAM_CARD_PAGE_SIZE} onPageChange={setAttendancePage} label="Operational schedule pages" /></section>}

        {activeTab === 'providers' && <section className="team-v26-section"><header><div><span>Clinical workforce</span><h3>Provider access foundation</h3><p>Provider profiles and their active branch assignments.</p></div></header><div className="team-v26-card-grid">{providers.length ? visibleProviders.map((provider) => { const providerAssignments = assignments.filter((entry) => entry.providerId === provider.id && entry.status === 'active'); return <article key={provider.id}><span className="team-v26-avatar">{initials(provider.displayName)}</span><div><strong>{provider.displayName}</strong><span>{provider.role.replaceAll('_', ' ')} · {provider.specialization || 'General dentistry'}</span><small>{providerAssignments.length ? providerAssignments.map((entry) => branchName(entry.branchId)).join(', ') : 'No active branch assignment'}</small></div><StatusBadge status={provider.status} variant="compact" /></article> }) : <div className="team-v26-empty team-v26-span-all"><Stethoscope size={30} /><h3>No provider profiles</h3><p>Invite a Dentist or Associate Dentist to provision a provider profile through the secure invitation workflow.</p></div>}</div><Pagination page={providerPage} pageCount={providerPageCount} totalItems={providers.length} pageSize={TEAM_CARD_PAGE_SIZE} onPageChange={setProviderPage} label="Provider directory pages" /></section>}

        {activeTab === 'compensation' && <section className="team-v26-section"><header><div><span>Provider compensation</span><h3>Payout & rule visibility</h3><p>Existing compensation rules and recorded provider payouts. No payout is inferred from treatment value alone.</p></div></header><div className="team-v26-comp-summary"><article><span>Rules</span><strong>{rules.length}</strong></article><article><span>Payout records</span><strong>{payouts.length}</strong></article><article><span>Pending amount</span><strong>{formatMoney(workforce.pendingPayoutsCents)}</strong></article></div><div className="team-v26-card-grid">{payouts.length ? visiblePayouts.map((payout) => <article key={payout.id}><div className="team-v26-card-icon"><Banknote size={17} /></div><div><strong>{payout.payoutNumber} · {providerName(payout.providerId)}</strong><span>{formatDate(payout.periodStart)} – {formatDate(payout.periodEnd)}</span><small>{branchName(payout.branchId)} · {formatMoney(payout.payoutAmountCents)}</small></div><StatusBadge status={payout.status} variant="compact" /></article>) : <div className="team-v26-empty team-v26-span-all"><Banknote size={30} /><h3>No provider payouts</h3><p>Compensation records will appear here when they are created by the existing workflow.</p></div>}</div><Pagination page={payoutPage} pageCount={payoutPageCount} totalItems={payouts.length} pageSize={TEAM_CARD_PAGE_SIZE} onPageChange={setPayoutPage} label="Provider payout pages" /></section>}
      </div>

      {detailOpen && selected && <div className="team-v26-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailOpen(false) }}>
        <aside ref={drawerRef} className="team-v26-drawer team-v26-account-modal-v153" role="dialog" aria-modal="true" aria-labelledby="team-v26-drawer-title">
          <header>
            <div className="team-v26-profile-head"><span className="team-v26-avatar is-large">{initials(selected.name)}</span><div><span>Internal account</span><h3 id="team-v26-drawer-title">{selected.name}</h3><p>{selected.email}</p></div><StatusBadge status={selected.status} /></div>
            <button type="button" className="team-v26-icon-button" aria-label="Close team member details" onClick={() => setDetailOpen(false)}><X size={18} /></button>
          </header>

          <div className="team-v26-drawer-body">
            <section className="team-v26-account-overview-v154">
              <div>
                <span>Role</span>
                <strong>{roleLabel(selected.role)}</strong>
                <small>{selected.role === 'staff' ? 'Branch-limited operations account' : selected.role === 'super_admin' ? 'Owner-level administration' : 'Provider access managed with Dentist records'}</small>
              </div>
              <div>
                <span>Branch access</span>
                <strong>{selectedBranchNames.length ? selectedBranchNames.length : 'None'}</strong>
                <small>{selectedBranchNames.length ? selectedBranchNames.join(' - ') : 'No active branch assignment'}</small>
              </div>
              <div>
                <span>Invitation</span>
                <strong>{selectedInvitation?.status ? selectedInvitation.status.replaceAll('_', ' ') : 'Ready'}</strong>
                <small>{selectedInvitation?.invitedAt ? `Sent ${formatDate(selectedInvitation.invitedAt)}` : 'No pending invitation'}</small>
              </div>
            </section>

            <section className="team-v26-account-profile-v154">
              <div className="team-v26-card-title"><Mail size={17} /><div><span>Profile</span><h4>Account details</h4></div></div>
              <div className="team-v26-detail-grid">
                <div><span>Full name</span><strong>{selected.name}</strong></div>
                <div><span>Email</span><strong>{selected.email}</strong></div>
                <div><span>Phone</span><strong>{selected.phone || 'Not recorded'}</strong></div>
                <div><span>Joined</span><strong>{formatDate(selected.createdAt)}</strong></div>
              </div>
              <p>{roleDescription(selected.role)}</p>
            </section>

            <section className="team-v26-branch-workspace-v154">
              <div className="team-v26-branch-head-v154">
                <div className="team-v26-card-title"><MapPin size={17} /><div><span>Branch access</span><h4>{selected.role === 'staff' ? 'Manage staff branch access' : 'Provider branch summary'}</h4></div></div>
                {selected.role === 'staff' && <small>{accessDraftBranches.length} selected</small>}
              </div>
              {(selected.role === 'dentist' || selected.role === 'associate_dentist') ? <div className="team-v26-dentist-access-note">
                <p>{selectedBranchNames.length ? selectedBranchNames.join(' - ') : 'No active provider branch assignment.'} Manage Dentist branch access in the Dentist workspace so scheduling and clinical access stay aligned.</p>
                <Button variant="secondary" onClick={() => { window.location.href = '/app/dentists' }}>Manage in Dentists</Button>
              </div> : <>
                <div className="team-v26-branch-editor team-v26-branch-editor-v154">
                {branches.filter((branch) => branch.status === 'active').map((branch) => {
                  const checked = accessDraftBranches.includes(branch.id)
                  return <label key={branch.id} className={checked ? 'is-selected' : ''}>
                    <input type="checkbox" checked={checked} onChange={() => toggleAccessBranch(branch.id)} />
                    <span className="team-v26-branch-check">{checked ? <Check size={15} /> : <Building2 size={15} />}</span>
                    <span><strong>{branch.name}</strong><small>{checked && accessPrimaryBranch === branch.id ? 'Primary branch' : checked ? 'Assigned branch' : 'No access'}</small></span>
                    {checked && <input type="radio" name="team-member-primary-branch" checked={accessPrimaryBranch === branch.id} onChange={() => setAccessPrimaryBranch(branch.id)} aria-label={`Make ${branch.name} primary`} />}
                  </label>
                })}
                </div>
                {accessError && <div className="team-v26-alert is-error" role="alert">{accessError}</div>}
                {accessMessage && <div className="team-v26-alert is-success" role="status"><CheckCircle2 size={16} /> {accessMessage}</div>}
              </>}
            </section>

            <section className="team-v26-account-state-v154">
              <div className="team-v26-card-title"><CalendarClock size={17} /><div><span>Account state</span><h4>Operational context</h4></div></div>
              <div className="team-v26-context-grid">
                <article><span>Status</span><strong>{selected.status}</strong><small>{profileBusyId === selected.id ? 'Updating account status...' : 'Controlled by Super Admin'}</small></article>
                <article><span>Upcoming shifts</span><strong>{selectedUpcomingShifts.length}</strong><small>Planned workforce records</small></article>
                <article><span>Today</span><strong>{selectedTodayAttendance ? selectedTodayAttendance.status.replaceAll('_', ' ') : 'No record'}</strong><small>{selectedTodayAttendance?.timeIn ? `In ${selectedTodayAttendance.timeIn}` : 'No attendance activity'}</small></article>
              </div>
            </section>
          </div>
          <footer className="team-v26-account-footer-v153">
            <Button variant="secondary" onClick={() => setDetailOpen(false)}>Close</Button>
            {(accessMessage || accessError) && <span className={`team-v26-save-state-v154 ${accessError ? 'is-error' : 'is-success'}`}>{accessError || accessMessage}</span>}
            <div>
              <Button variant="secondary" onClick={() => openProfileEdit(selected)}><Edit3 size={15} /> Edit profile</Button>
              <Button variant="secondary" disabled={profileBusyId === selected.id} onClick={() => void toggleStatus(selected)}>{profileBusyId === selected.id ? 'Updating...' : selected.status === 'active' ? 'Deactivate' : 'Activate'}</Button>
              {selected.role === 'staff' && <Button onClick={() => void saveBranchAccess()} disabled={accessBusy}>{accessBusy ? 'Saving...' : 'Save branch access'}</Button>}
            </div>
          </footer>
        </aside>
      </div>}

      {inviteOpen && <InviteAccountModal branches={branches} onClose={() => setInviteOpen(false)} onSuccess={handleInviteSuccess} />}
      {editMember && <StaffFormModal mode="edit" lockRoleStatus isSaving={profileBusyId === editMember.id} values={{ name: editMember.name, email: editMember.email, phone: editMember.phone, position: editMember.position, role: editMember.role, status: editMember.status, password: editMember.password }} error={editError} onChange={(values) => setEditMember((current) => current ? { ...current, ...values } : current)} onClose={() => { setEditMember(null); setEditError(null) }} onSubmit={() => editMember && void saveEdit({ name: editMember.name, email: editMember.email, phone: editMember.phone, position: editMember.position, role: editMember.role, status: editMember.status, password: editMember.password })} />}
    </PageScaffold>
  )
}
