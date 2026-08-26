import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, KeyRound, ShieldCheck, UsersRound } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { getStoredStaff } from '../features/auth/staffStore'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredBranches } from '../features/branches/branchStore'
import { loadStaffBranchAssignmentsAdmin, replaceStaffBranchAssignmentsPersisted, type StaffBranchAssignmentAdminRow } from '../features/branches/branchAssignmentAdmin'
import { supabase } from '../lib/supabase'
import { TeamAccessDirectoryV129 } from './TeamAccessDirectoryV129'

type ProfileInfo = { id: string; role: string; status: string; permissions: string[] }

export function TeamAccessBranchAssignmentsV126() {
  const { refreshBranchAccess } = useBranchContext()
  const branches = useMemo(() => getStoredBranches().filter((branch) => branch.status === 'active'), [])
  const staff = useMemo(() => getStoredStaff().filter((member) => member.role === 'staff'), [])
  const [assignments, setAssignments] = useState<StaffBranchAssignmentAdminRow[]>([])
  const [profiles, setProfiles] = useState<ProfileInfo[]>([])
  const [selectedId, setSelectedId] = useState(staff[0]?.id ?? '')
  const [draftBranches, setDraftBranches] = useState<string[]>([])
  const [primaryBranchId, setPrimaryBranchId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    if (!supabase) return
    const [assignmentRows, profileResult] = await Promise.all([
      loadStaffBranchAssignmentsAdmin(),
      supabase.from('profiles').select('id, role, status, permissions').eq('role', 'staff'),
    ])
    if (profileResult.error) throw new Error(profileResult.error.message)
    setAssignments(assignmentRows)
    setProfiles((profileResult.data ?? []).map((row) => ({ id: String(row.id), role: String(row.role), status: String(row.status), permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [] })))
  }

  useEffect(() => { void reload().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load branch assignments.')) }, [])

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
    setDraftBranches((current) => {
      const next = current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId]
      if (!next.includes(primaryBranchId)) setPrimaryBranchId(next[0] ?? '')
      return next
    })
    setMessage(null)
  }

  async function save() {
    if (!selected || busy) return
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
      <header><div><span>TEAM & ACCESS · BRANCH AUTHORIZATION</span><h2>Staff branch assignments</h2><p>This assignment editor is for Staff accounts. Dentist branch access is managed from Dentists; all internal accounts are listed in Team & Access below.</p></div><Badge tone="info"><ShieldCheck size={13}/>Database enforced</Badge></header>
      {!staff.length ? <div className="branch126-empty"><UsersRound size={22}/><strong>No Staff accounts found</strong><p>Invite a Staff account below, then assign its clinic branch.</p></div> : <div className="branch126-layout">
        <nav aria-label="Staff accounts">{staff.map((member) => <button type="button" key={member.id} className={selected?.id === member.id ? 'is-active' : ''} onClick={() => setSelectedId(member.id)}><span>{member.name.slice(0,1).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.position || 'Clinic Staff'} · {member.status}</small></div></button>)}</nav>
        {selected && <section className="branch126-editor">
          <div className="branch126-identity"><div><span>STAFF ACCOUNT</span><h3>{selected.name}</h3><p>{selected.email}</p></div><Badge tone={selected.status === 'active' ? 'success' : 'neutral'}>{selected.status}</Badge></div>
          <div className="branch126-meta"><div><span>Role</span><strong>{selectedProfile?.role ?? selected.role}</strong></div><div><span>Status</span><strong>{selectedProfile?.status ?? selected.status}</strong></div><div><span>Primary branch</span><strong>{branches.find((branch) => branch.id === primaryBranchId)?.name ?? 'Not assigned'}</strong></div><div><span>Permissions</span><strong>{selectedProfile?.permissions.length ?? 0}</strong></div></div>
          <div className="branch126-permissions"><KeyRound size={15}/><span>{selectedProfile?.permissions.length ? selectedProfile.permissions.join(' · ') : 'No granular permission overrides recorded; role defaults still apply.'}</span></div>
          <fieldset><legend>Assigned branches</legend>{branches.map((branch) => { const checked = draftBranches.includes(branch.id); return <label key={branch.id} className={checked ? 'is-selected' : ''}><input type="checkbox" checked={checked} onChange={() => toggleBranch(branch.id)}/><span className="branch126-check">{checked ? <Check size={14}/> : <Building2 size={14}/>}</span><span><strong>{branch.name}</strong><small>{checked && primaryBranchId === branch.id ? 'Primary branch' : checked ? 'Assigned branch' : 'No access'}</small></span>{checked && <input className="branch126-radio" type="radio" name="staff-primary-branch" checked={primaryBranchId === branch.id} onChange={() => setPrimaryBranchId(branch.id)} aria-label={`Make ${branch.name} primary`}/>}</label>})}</fieldset>
          {error && <div className="branch126-alert is-error" role="alert">{error}</div>}{message && <div className="branch126-alert is-success" role="status">{message}</div>}
          <footer><p>{draftBranches.length === 1 ? 'One branch assigned: this Staff account is automatically locked to it.' : draftBranches.length > 1 ? 'Multiple branches assigned: the workspace selector will only show these branches.' : 'No branches assigned: branch-sensitive operations remain blocked.'}</p><Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save branch access'}</Button></footer>
        </section>}
      </div>}
    </section>
    <TeamAccessDirectoryV129 />
  </>
}
