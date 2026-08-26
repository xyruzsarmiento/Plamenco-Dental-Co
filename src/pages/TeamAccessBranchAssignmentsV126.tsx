import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, Check, KeyRound, ShieldCheck, UsersRound } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import type { StaffMember } from '../features/auth/authTypes'
import { loadInternalAccountsFromProfiles } from '../features/auth/staffStore'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredBranches } from '../features/branches/branchStore'
import { loadStaffBranchAssignmentsAdmin, replaceStaffBranchAssignmentsPersisted, type StaffBranchAssignmentAdminRow } from '../features/branches/branchAssignmentAdmin'
import { supabase } from '../lib/supabase'
import { TeamAccessDirectoryV129 } from './TeamAccessDirectoryV129'

type ProfileInfo = { id: string; role: string; status: string; permissions: string[] }

export function TeamAccessBranchAssignmentsV126() {
  const { user } = useAuth()
  const { refreshBranchAccess } = useBranchContext()
  const isOwner = user?.role === 'super_admin'
  const branches = useMemo(() => getStoredBranches().filter((branch) => branch.status === 'active'), [])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [assignments, setAssignments] = useState<StaffBranchAssignmentAdminRow[]>([])
  const [profiles, setProfiles] = useState<ProfileInfo[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [draftBranches, setDraftBranches] = useState<string[]>([])
  const [primaryBranchId, setPrimaryBranchId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    if (!supabase) return
    const [accounts, assignmentRows, profileResult] = await Promise.all([
      loadInternalAccountsFromProfiles({ strict: true }),
      loadStaffBranchAssignmentsAdmin(),
      supabase.from('profiles').select('id, role, status, permissions').eq('role', 'staff'),
    ])
    if (profileResult.error) throw new Error(profileResult.error.message)
    const staffAccounts = accounts.filter((member) => member.role === 'staff')
    setStaff(staffAccounts)
    setSelectedId((current) => current && staffAccounts.some((member) => member.id === current) ? current : (staffAccounts[0]?.id ?? ''))
    setAssignments(assignmentRows)
    setProfiles((profileResult.data ?? []).map((row) => ({ id: String(row.id), role: String(row.role), status: String(row.status), permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [] })))
  }

  useEffect(() => {
    setLoading(true)
    void reload()
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load branch assignments.'))
      .finally(() => setLoading(false))
  }, [])

  const selected = staff.find((member) => member.id === selectedId) ?? staff[0] ?? null
  const selectedProfile = selected ? profiles.find((profile) => profile.id === selected.id) : undefined
  const selectedAssignments = selected ? assignments.filter((row) => row.profileId === selected.id && row.status === 'active') : []

  useEffect(() => {
    const ids = selectedAssignments.map((row) => row.branchId)
    setDraftBranches(ids)
    setPrimaryBranchId(selectedAssignments.find((row) => row.isPrimary)?.branchId ?? ids[0] ?? '')
    setMessage(null)
    setError(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, assignments])

  function toggleBranch(branchId: string) {
    if (!isOwner) return
    setDraftBranches((current) => {
      const next = current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId]
      if (!next.includes(primaryBranchId)) setPrimaryBranchId(next[0] ?? '')
      return next
    })
    setMessage(null)
  }

  async function save() {
    if (!selected || busy || !isOwner) return
    setBusy(true); setError(null); setMessage(null)
    try {
      await replaceStaffBranchAssignmentsPersisted(selected.id, draftBranches, primaryBranchId || undefined)
      await reload()
      await refreshBranchAccess()
      setMessage(draftBranches.length ? 'Branch access saved. Removed branches are no longer authorized.' : 'All branch access removed for this Staff account.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save branch access.')
    } finally { setBusy(false) }
  }

  return <>
    <section className="branch126-admin-card">
      <header><div><span>TEAM & ACCESS · BRANCH AUTHORIZATION</span><h2>Staff branch assignments</h2><p>The clinic owner / Super Admin controls which branch each Staff account can access. Dentist branch access remains managed from Dentists.</p></div><Badge tone="info"><ShieldCheck size={13}/>Owner controlled · Database enforced</Badge></header>
      {!isOwner && <div className="branch126-alert is-error" role="note"><ShieldCheck size={16}/><span>Branch assignments are read-only here. Only the Super Admin / clinic owner can grant or remove Staff branch access.</span></div>}
      {loading ? <div className="branch126-empty"><UsersRound size={22}/><strong>Loading Staff accounts</strong><p>Refreshing authenticated internal accounts and saved branch access from Supabase.</p></div> : !staff.length ? <div className="branch126-empty"><UsersRound size={22}/><strong>No Staff accounts found</strong><p>Invite a Staff account below. The Super Admin can assign its clinic branch after provisioning.</p></div> : <div className="branch126-layout">
        <nav aria-label="Staff accounts">{staff.map((member) => { const access = assignments.filter((row) => row.profileId === member.id && row.status === 'active'); const primary = access.find((row) => row.isPrimary); const accessLabel = access.length === 0 ? 'No branch access' : access.length === 1 ? branches.find((branch) => branch.id === access[0].branchId)?.name ?? '1 branch' : `${access.length} branches`; return <button type="button" key={member.id} className={selected?.id === member.id ? 'is-active' : ''} onClick={() => setSelectedId(member.id)}><span>{member.name.slice(0,1).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.position || 'Clinic Staff'} · {accessLabel}{primary ? ' · Primary set' : ''}</small></div>{access.length === 0 && <AlertTriangle size={15} aria-label="No branch access"/>}</button>})}</nav>
        {selected && <section className="branch126-editor">
          <div className="branch126-identity"><div><span>STAFF ACCOUNT</span><h3>{selected.name}</h3><p>{selected.email}</p></div><Badge tone={selected.status === 'active' ? 'success' : 'neutral'}>{selected.status}</Badge></div>
          {selectedAssignments.length === 0 && <div className="branch126-alert is-error" role="status"><AlertTriangle size={16}/><span><strong>No branch access assigned.</strong> This Staff account can sign in, but branch-sensitive clinic operations remain blocked until the Super Admin assigns at least one branch.</span></div>}
          <div className="branch126-meta"><div><span>Role</span><strong>{selectedProfile?.role ?? selected.role}</strong></div><div><span>Status</span><strong>{selectedProfile?.status ?? selected.status}</strong></div><div><span>Current access</span><strong>{selectedAssignments.length ? `${selectedAssignments.length} branch${selectedAssignments.length > 1 ? 'es' : ''}` : 'None'}</strong></div><div><span>Primary branch</span><strong>{branches.find((branch) => branch.id === primaryBranchId)?.name ?? 'Not assigned'}</strong></div></div>
          <div className="branch126-permissions"><KeyRound size={15}/><span>{selectedProfile?.permissions.length ? selectedProfile.permissions.join(' · ') : 'No granular permission overrides recorded; role defaults still apply.'}</span></div>
          <fieldset disabled={!isOwner}><legend>Assigned branches</legend>{branches.map((branch) => { const checked = draftBranches.includes(branch.id); return <label key={branch.id} className={checked ? 'is-selected' : ''}><input type="checkbox" checked={checked} onChange={() => toggleBranch(branch.id)}/><span className="branch126-check">{checked ? <Check size={14}/> : <Building2 size={14}/>}</span><span><strong>{branch.name}</strong><small>{checked && primaryBranchId === branch.id ? 'Primary branch' : checked ? 'Assigned branch' : 'No access'}</small></span>{checked && <input className="branch126-radio" type="radio" name="staff-primary-branch" checked={primaryBranchId === branch.id} onChange={() => isOwner && setPrimaryBranchId(branch.id)} aria-label={`Make ${branch.name} primary`}/>}</label>})}</fieldset>
          {error && <div className="branch126-alert is-error" role="alert">{error}</div>}{message && <div className="branch126-alert is-success" role="status">{message}</div>}
          <footer><p>{draftBranches.length === 1 ? 'One branch assigned: this Staff account is automatically locked to it.' : draftBranches.length > 1 ? 'Multiple branches assigned: the workspace selector will only show these branches.' : 'No branches assigned: branch-sensitive operations remain blocked.'}</p>{isOwner ? <Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save branch access'}</Button> : <Badge tone="neutral">Read only</Badge>}</footer>
        </section>}
      </div>}
    </section>
    <TeamAccessDirectoryV129 />
  </>
}
