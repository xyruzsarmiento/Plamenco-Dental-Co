import { CalendarClock, CheckCircle2, Clock3, Plus, Save, Stethoscope, Trash2, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'
import { getStoredBranches, loadBranchesFromSupabase } from '../branches/branchStore'
import {
  getProviderAvailabilityOverrides,
  getProviderBranchAssignments,
  getProviderScheduleBlocks,
  getStoredProviders,
  loadProviderFoundationFromSupabase,
  saveScheduleBlocks,
} from './dentistStore'
import type { AvailabilityOverrideType, ProviderScheduleBlock } from './dentistTypes'
import '../../styles/dentist-schedule-manager-v131.css'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
type EditableBlock = Omit<ProviderScheduleBlock, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>

function activeSchedule(providerId: string): EditableBlock[] {
  return getProviderScheduleBlocks()
    .filter((block) => block.providerId === providerId && block.status === 'active')
    .map(({ branchId, dayOfWeek, startTime, endTime }) => ({ branchId, dayOfWeek, startTime, endTime, status: 'active' }))
}

export function DentistScheduleManagerV131() {
  const [revision, setRevision] = useState(0)
  const [providerId, setProviderId] = useState('')
  const [blocks, setBlocks] = useState<EditableBlock[]>([])
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exception, setException] = useState({ date: '', branchId: '', type: 'unavailable' as AvailabilityOverrideType, startTime: '', endTime: '', reason: '' })

  const providers = useMemo(() => { void revision; return getStoredProviders().filter((row) => row.status !== 'inactive') }, [revision])
  const branches = useMemo(() => { void revision; return getStoredBranches().filter((row) => row.status === 'active') }, [revision])
  const assignments = useMemo(() => { void revision; return getProviderBranchAssignments().filter((row) => row.status === 'active') }, [revision])
  const selected = providers.find((row) => row.id === providerId) ?? providers[0] ?? null
  const assignedBranches = selected ? branches.filter((branch) => assignments.some((assignment) => assignment.providerId === selected.id && assignment.branchId === branch.id)) : []
  const overrides = selected ? getProviderAvailabilityOverrides().filter((row) => row.providerId === selected.id).sort((a, b) => b.date.localeCompare(a.date)) : []

  async function reload(preferredProviderId?: string) {
    const [, foundation] = await Promise.all([
      loadBranchesFromSupabase({ strict: true }),
      loadProviderFoundationFromSupabase({ strict: true }),
    ])
    const nextProvider = preferredProviderId || providerId || foundation.providers[0]?.id || ''
    setProviderId(nextProvider)
    setBlocks(nextProvider ? activeSchedule(nextProvider) : [])
    setRevision((value) => value + 1)
  }

  useEffect(() => { void reload().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load dentist schedules.')) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected) return
    setBlocks(activeSchedule(selected.id))
    const firstBranch = assignments.find((row) => row.providerId === selected.id)?.branchId ?? ''
    setException((current) => ({ ...current, branchId: firstBranch }))
    setFeedback(null)
    setError(null)
  }, [selected?.id, revision]) // eslint-disable-line react-hooks/exhaustive-deps

  function addPeriod(dayOfWeek: number) {
    const branchId = assignedBranches[0]?.id
    if (!branchId) return setError('Assign this dentist to a branch before adding working hours.')
    setBlocks((current) => [...current, { branchId, dayOfWeek, startTime: '09:00', endTime: '17:00', status: 'active' }])
    setFeedback(null)
  }

  function toggleDay(dayOfWeek: number) {
    const hasDay = blocks.some((block) => block.dayOfWeek === dayOfWeek)
    if (hasDay) setBlocks((current) => current.filter((block) => block.dayOfWeek !== dayOfWeek))
    else addPeriod(dayOfWeek)
  }

  function updateBlock(index: number, patch: Partial<EditableBlock>) {
    setBlocks((current) => current.map((block, rowIndex) => rowIndex === index ? { ...block, ...patch, status: 'active' } : block))
    setFeedback(null)
  }

  function validate() {
    const assignedIds = new Set(assignedBranches.map((branch) => branch.id))
    for (const block of blocks) {
      if (!assignedIds.has(block.branchId)) return 'Every schedule period must use an actively assigned branch.'
      if (!block.startTime || !block.endTime || block.startTime >= block.endTime) return `${DAYS[block.dayOfWeek]} has an invalid time range.`
    }
    for (let day = 0; day < 7; day += 1) {
      const rows = blocks.filter((block) => block.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime))
      for (let index = 1; index < rows.length; index += 1) {
        if (rows[index].startTime < rows[index - 1].endTime) return `${DAYS[day]} has overlapping working periods.`
      }
    }
    return null
  }

  async function save() {
    if (!selected || busy) return
    const validation = validate()
    if (validation) return setError(validation)
    setBusy(true); setError(null); setFeedback(null)
    try {
      await saveScheduleBlocks(selected.id, blocks.map((block) => ({ ...block, status: 'active' })))
      await reload(selected.id)
      setFeedback('Bookable hours saved. Patient booking now uses these active periods.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save dentist availability.')
    } finally { setBusy(false) }
  }

  async function addException() {
    if (!selected || !supabase || busy) return
    if (!exception.date || !exception.branchId) return setError('Choose a date and assigned branch for the exception.')
    if ((exception.type === 'available' || exception.type === 'special_hours') && (!exception.startTime || !exception.endTime || exception.startTime >= exception.endTime)) return setError('Special hours require a valid start and end time.')
    if (!assignedBranches.some((branch) => branch.id === exception.branchId)) return setError('The exception branch must be assigned to this dentist.')
    setBusy(true); setError(null); setFeedback(null)
    const { error: insertError } = await supabase.from('provider_availability_overrides').insert({
      provider_id: selected.id,
      branch_id: exception.branchId,
      override_date: exception.date,
      type: exception.type,
      start_time: exception.startTime || null,
      end_time: exception.endTime || null,
      reason: exception.reason.trim(),
      private_notes: '',
    })
    if (insertError) setError(insertError.message)
    else {
      await reload(selected.id)
      setException({ date: '', branchId: assignedBranches[0]?.id ?? '', type: 'unavailable', startTime: '', endTime: '', reason: '' })
      setFeedback('One-time schedule exception saved.')
    }
    setBusy(false)
  }

  async function removeException(id: string) {
    if (!selected || !supabase || busy) return
    setBusy(true); setError(null)
    const { error: deleteError } = await supabase.from('provider_availability_overrides').delete().eq('id', id).eq('provider_id', selected.id)
    if (deleteError) setError(deleteError.message)
    else { await reload(selected.id); setFeedback('Schedule exception removed.') }
    setBusy(false)
  }

  return <section className="dsm131">
    <header className="dsm131-hero"><div><span>AUTHORITATIVE BOOKING SCHEDULE</span><h2>Dentist schedules</h2><p>Only active working periods shown here are used by patient booking. Inactive legacy periods are intentionally excluded.</p></div><CalendarClock size={22}/></header>
    <div className="dsm131-toolbar"><label>Dentist<select value={selected?.id ?? ''} onChange={(event) => { setProviderId(event.target.value); setBlocks(activeSchedule(event.target.value)) }}>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}</select></label>{selected && <div className="dsm131-context"><Stethoscope size={16}/><span><strong>{selected.displayName}</strong><small>{assignedBranches.length} active branch assignment{assignedBranches.length === 1 ? '' : 's'}</small></span></div>}</div>
    {error && <div className="dsm131-message is-error"><XCircle size={16}/>{error}</div>}{feedback && <div className="dsm131-message is-success"><CheckCircle2 size={16}/>{feedback}</div>}
    {!selected ? <div className="dsm131-empty">No dentist profiles available.</div> : !assignedBranches.length ? <div className="dsm131-empty">Assign this dentist to a branch first. A dentist without an active branch cannot be booked.</div> : <>
      <div className="dsm131-week">{DAYS.map((day, dayOfWeek) => { const entries = blocks.map((block, index) => ({ block, index })).filter(({ block }) => block.dayOfWeek === dayOfWeek); return <article key={day} className={entries.length ? 'is-working' : ''}><header><div><strong>{day}</strong><small>{entries.length ? `${entries.length} bookable period${entries.length === 1 ? '' : 's'}` : 'Not bookable'}</small></div><label><input type="checkbox" checked={entries.length > 0} onChange={() => toggleDay(dayOfWeek)}/><span>{entries.length ? 'Working' : 'Off'}</span></label></header>{entries.map(({ block, index }) => <div className="dsm131-period" key={`${day}-${index}`}><Clock3 size={15}/><select value={block.branchId} onChange={(event) => updateBlock(index, { branchId: event.target.value })}>{assignedBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><input type="time" value={block.startTime} onChange={(event) => updateBlock(index, { startTime: event.target.value })}/><span>to</span><input type="time" value={block.endTime} onChange={(event) => updateBlock(index, { endTime: event.target.value })}/><button type="button" aria-label={`Remove ${day} period`} onClick={() => setBlocks((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={14}/></button></div>)}{entries.length > 0 && <button type="button" className="dsm131-add" onClick={() => addPeriod(dayOfWeek)}><Plus size={14}/>Add period</button>}</article> })}</div>
      <div className="dsm131-save"><span>Saving replaces the active weekly pattern for this dentist. Existing appointments are not deleted.</span><Button icon={<Save size={15}/>} onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save bookable hours'}</Button></div>
      <section className="dsm131-exceptions"><header><div><span>ONE-TIME CHANGES</span><h3>Leave, unavailable dates & special hours</h3></div></header><div className="dsm131-exception-form"><input type="date" value={exception.date} onChange={(event) => setException({ ...exception, date: event.target.value })}/><select value={exception.branchId} onChange={(event) => setException({ ...exception, branchId: event.target.value })}>{assignedBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><select value={exception.type} onChange={(event) => setException({ ...exception, type: event.target.value as AvailabilityOverrideType })}><option value="unavailable">Unavailable</option><option value="leave">Leave</option><option value="special_hours">Special hours</option><option value="available">Available hours</option></select><input type="time" value={exception.startTime} onChange={(event) => setException({ ...exception, startTime: event.target.value })}/><input type="time" value={exception.endTime} onChange={(event) => setException({ ...exception, endTime: event.target.value })}/><input value={exception.reason} onChange={(event) => setException({ ...exception, reason: event.target.value })} placeholder="Reason / note"/><Button variant="secondary" onClick={() => void addException()} disabled={busy}>Add exception</Button></div><div className="dsm131-exception-list">{overrides.map((row) => <article key={row.id}><div><strong>{row.date} · {row.type.replaceAll('_', ' ')}</strong><small>{branches.find((branch) => branch.id === row.branchId)?.name ?? 'All assigned branches'}{row.startTime && row.endTime ? ` · ${row.startTime}-${row.endTime}` : ''}{row.reason ? ` · ${row.reason}` : ''}</small></div><button type="button" onClick={() => void removeException(row.id)} disabled={busy}><Trash2 size={14}/></button></article>)}{!overrides.length && <p>No one-time exceptions recorded.</p>}</div></section>
    </>}
  </section>
}
