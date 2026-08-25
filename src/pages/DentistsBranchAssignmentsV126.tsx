import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, Clock3, ShieldCheck, Stethoscope } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredBranches } from '../features/branches/branchStore'
import { loadProviderBranchAssignmentsAdmin, replaceProviderBranchAssignmentsPersisted, type ProviderBranchAssignmentAdminRow } from '../features/branches/branchAssignmentAdmin'
import { getStoredProviders, loadProviderFoundationFromSupabase } from '../features/dentists/dentistStore'
import { DentistsPageV51 } from './DentistsPageV51'

export function DentistsBranchAssignmentsV126() {
  const { refreshBranchAccess } = useBranchContext()
  const [revision, setRevision] = useState(0)
  const branches = useMemo(() => { void revision; return getStoredBranches().filter((branch) => branch.status === 'active') }, [revision])
  const providers = useMemo(() => { void revision; return getStoredProviders().filter((provider) => provider.status !== 'inactive') }, [revision])
  const [assignments, setAssignments] = useState<ProviderBranchAssignmentAdminRow[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState(providers[0]?.id ?? '')
  const [draftBranches, setDraftBranches] = useState<string[]>([])
  const [primaryBranchId, setPrimaryBranchId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const [rows] = await Promise.all([
      loadProviderBranchAssignmentsAdmin(),
      loadProviderFoundationFromSupabase({ strict: true }),
    ])
    setAssignments(rows)
    setRevision((value) => value + 1)
  }

  useEffect(() => { void reload().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load dentist branch assignments.')) }, [])

  const selected = providers.find((provider) => provider.id === selectedProviderId) ?? providers[0] ?? null
  const selectedAssignments = selected ? assignments.filter((row) => row.providerId === selected.id && row.status === 'active') : []

  useEffect(() => {
    const ids = selectedAssignments.map((row) => row.branchId)
    setDraftBranches(ids)
    setPrimaryBranchId(selectedAssignments.find((row) => row.isPrimary)?.branchId ?? ids[0] ?? '')
    setMessage(null); setError(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProviderId, assignments])

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
      await replaceProviderBranchAssignmentsPersisted(selected.id, draftBranches, primaryBranchId || undefined)
      await reload()
      await refreshBranchAccess()
      setMessage(draftBranches.length ? 'Dentist branch assignments saved. Removed branches are no longer available for scheduling.' : 'All branch assignments removed. This dentist cannot be booked until a branch is assigned.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save dentist branch assignments.')
    } finally { setBusy(false) }
  }

  return <>
    <section className="branch126-admin-card branch126-dentists">
      <header><div><span>DENTISTS · BRANCH AUTHORIZATION</span><h2>Dentist branch assignments</h2><p>Dentist profiles remain clinic-wide. Branch assignment controls where each dentist may work and be booked.</p></div><Badge tone="info"><ShieldCheck size={13}/>Schedule protected</Badge></header>
      {!providers.length ? <div className="branch126-empty"><Stethoscope size={22}/><strong>No dentist profiles found</strong></div> : <div className="branch126-layout">
        <nav aria-label="Dentist profiles">{providers.map((provider) => <button key={provider.id} type="button" className={selected?.id === provider.id ? 'is-active' : ''} onClick={() => setSelectedProviderId(provider.id)}><span><Stethoscope size={15}/></span><div><strong>{provider.displayName}</strong><small>{provider.role.replaceAll('_',' ')} · {provider.status}</small></div></button>)}</nav>
        {selected && <section className="branch126-editor">
          <div className="branch126-identity"><div><span>DENTIST PROFILE</span><h3>{selected.displayName}</h3><p>{selected.email || 'No email recorded'} · {selected.specialization || 'General dentistry'}</p></div><Badge tone={selected.status === 'active' ? 'success' : 'neutral'}>{selected.status}</Badge></div>
          <div className="branch126-meta"><div><span>Role</span><strong>{selected.role.replaceAll('_',' ')}</strong></div><div><span>Primary branch</span><strong>{branches.find((branch) => branch.id === primaryBranchId)?.name ?? 'Not assigned'}</strong></div><div><span>Assigned branches</span><strong>{draftBranches.length}</strong></div><div><span>License</span><strong>{selected.licenseNumber || 'Not recorded'}</strong></div></div>
          <fieldset><legend>Assigned branches</legend>{branches.map((branch) => { const checked = draftBranches.includes(branch.id); return <label key={branch.id} className={checked ? 'is-selected' : ''}><input type="checkbox" checked={checked} onChange={() => toggleBranch(branch.id)}/><span className="branch126-check">{checked ? <Check size={14}/> : <Building2 size={14}/>}</span><span><strong>{branch.name}</strong><small>{checked && primaryBranchId === branch.id ? 'Primary branch' : checked ? 'Available for branch scheduling' : 'Not assigned'}</small></span>{checked && <input className="branch126-radio" type="radio" name="dentist-primary-branch" checked={primaryBranchId === branch.id} onChange={() => setPrimaryBranchId(branch.id)} aria-label={`Make ${branch.name} primary`}/>}</label>})}</fieldset>
          <div className="branch126-schedule-note"><Clock3 size={16}/><div><strong>Cross-branch conflict protection</strong><p>A dentist cannot hold overlapping working-hour blocks or simultaneous appointments across Pulilan and Plaridel. Removing a branch also deactivates future working-hour blocks for that branch.</p></div></div>
          {error && <div className="branch126-alert is-error" role="alert">{error}</div>}{message && <div className="branch126-alert is-success" role="status">{message}</div>}
          <footer><p>{draftBranches.length > 1 ? 'Multi-branch dentist: schedules must use non-overlapping time blocks per branch.' : draftBranches.length === 1 ? 'Single-branch dentist: booking is limited to this branch.' : 'No branch assignment: booking and schedule creation remain blocked.'}</p><Button onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save dentist branches'}</Button></footer>
        </section>}
      </div>}
    </section>
    <DentistsPageV51 />
  </>
}
