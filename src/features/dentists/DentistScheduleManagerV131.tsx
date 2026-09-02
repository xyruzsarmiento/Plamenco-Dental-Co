import {
  AlertCircle,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Plus,
  Save,
  Stethoscope,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { supabase } from '../../lib/supabase'
import { getStoredBranches, loadBranchesFromSupabase } from '../branches/branchStore'
import {
  createAvailabilityOverride,
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
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type EditableBlock = Omit<ProviderScheduleBlock, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>

function activeSchedule(providerId: string): EditableBlock[] {
  return getProviderScheduleBlocks()
    .filter((block) => block.providerId === providerId && block.status === 'active')
    .map(({ branchId, dayOfWeek, startTime, endTime }) => ({ branchId, dayOfWeek, startTime, endTime, status: 'active' }))
}

function formatTime(value?: string) {
  if (!value) return 'Not set'
  const date = new Date(`2026-01-01T${value}`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function minutesBetween(start: string, end: string) {
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) return 0
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute))
}

function formatDuration(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes}m`
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

function dayBlocks(blocks: EditableBlock[], dayOfWeek: number) {
  return blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.dayOfWeek === dayOfWeek)
    .sort((left, right) => left.block.startTime.localeCompare(right.block.startTime))
}

export function DentistScheduleManagerV131() {
  const [revision, setRevision] = useState(0)
  const [providerId, setProviderId] = useState('')
  const [blocks, setBlocks] = useState<EditableBlock[]>([])
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exception, setException] = useState({ date: '', branchId: '', type: 'unavailable' as AvailabilityOverrideType, startTime: '', endTime: '', reason: '' })

  const providers = useMemo(() => { void revision; return getStoredProviders().filter((row) => row.status === 'active') }, [revision])
  const branches = useMemo(() => { void revision; return getStoredBranches().filter((row) => row.status === 'active') }, [revision])
  const assignments = useMemo(() => { void revision; return getProviderBranchAssignments().filter((row) => row.status === 'active') }, [revision])
  const selected = providers.find((row) => row.id === providerId) ?? providers[0] ?? null
  const assignedBranches = selected ? branches.filter((branch) => assignments.some((assignment) => assignment.providerId === selected.id && assignment.branchId === branch.id)) : []
  const overrides = selected ? getProviderAvailabilityOverrides().filter((row) => row.providerId === selected.id).sort((a, b) => b.date.localeCompare(a.date)) : []
  const workingDays = DAYS.map((_, day) => dayBlocks(blocks, day)).filter((entries) => entries.length > 0).length
  const weeklyMinutes = blocks.reduce((sum, block) => sum + minutesBetween(block.startTime, block.endTime), 0)
  const nextWorkingDay = DAYS.find((_, day) => dayBlocks(blocks, day).length > 0) ?? 'No working day'
  const initials = selected?.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DR'

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

  function removeBlock(index: number) {
    setBlocks((current) => current.filter((_, rowIndex) => rowIndex !== index))
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
      setFeedback('Bookable hours saved. Patient booking now uses this weekly pattern.')
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
    try {
      await createAvailabilityOverride({
        providerId: selected.id,
        branchId: exception.branchId,
        date: exception.date,
        type: exception.type,
        startTime: exception.startTime || undefined,
        endTime: exception.endTime || undefined,
        reason: exception.reason.trim(),
        privateNotes: '',
      })
      await reload(selected.id)
      setException({ date: '', branchId: assignedBranches[0]?.id ?? '', type: 'unavailable', startTime: '', endTime: '', reason: '' })
      setFeedback('One-time schedule exception saved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save schedule exception.')
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
    <header className="dsm131-hero">
      <div className="dsm131-hero-copy">
        <span>AUTHORITATIVE BOOKING SCHEDULE</span>
        <h2>Dentist availability command center</h2>
        <p>Control the exact branch, day, and time windows used by patient booking. Active weekly periods and one-time exceptions stay separate so the schedule is easier to audit.</p>
      </div>
      <div className="dsm131-hero-metrics" aria-label="Schedule summary">
        <article><strong>{workingDays}</strong><span>Working days</span></article>
        <article><strong>{formatDuration(weeklyMinutes)}</strong><span>Weekly capacity</span></article>
        <article><strong>{overrides.length}</strong><span>Exceptions</span></article>
      </div>
    </header>

    <section className="dsm131-control-panel">
      <label className="dsm131-provider-picker">
        <span>Dentist profile</span>
        <select value={selected?.id ?? ''} onChange={(event) => { setProviderId(event.target.value); setBlocks(activeSchedule(event.target.value)) }}>
          {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}
        </select>
      </label>
      {selected && <aside className="dsm131-provider-card">
        <span className="dsm131-avatar">{initials}</span>
        <div>
          <strong>{selected.displayName}</strong>
          <small>{selected.specialization || 'General dentist'} - {assignedBranches.length} active branch assignment{assignedBranches.length === 1 ? '' : 's'}</small>
        </div>
      </aside>}
    </section>

    {error && <div className="dsm131-message is-error" role="alert"><XCircle size={16}/>{error}</div>}
    {feedback && <div className="dsm131-message is-success" role="status"><CheckCircle2 size={16}/>{feedback}</div>}

    {!selected ? <div className="dsm131-empty"><Stethoscope size={24}/><strong>No dentist profiles available.</strong><span>Create or activate a dentist profile before configuring bookable hours.</span></div> : !assignedBranches.length ? <div className="dsm131-empty"><AlertCircle size={24}/><strong>No active branch assignment.</strong><span>Assign this dentist to a branch first. A dentist without an active branch cannot be booked.</span></div> : <>
      <section className="dsm131-overview">
        <div className="dsm131-week-strip" aria-label="Weekly availability overview">
          {DAYS.map((day, dayOfWeek) => {
            const entries = dayBlocks(blocks, dayOfWeek)
            return <button key={day} type="button" className={entries.length ? 'is-working' : ''} onClick={() => document.getElementById(`dsm131-day-${dayOfWeek}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              <strong>{SHORT_DAYS[dayOfWeek]}</strong>
              <span>{entries.length ? `${entries.length} period${entries.length === 1 ? '' : 's'}` : 'Off'}</span>
            </button>
          })}
        </div>
        <div className="dsm131-next-card">
          <CalendarDays size={18}/>
          <div><span>Next configured day</span><strong>{nextWorkingDay}</strong></div>
        </div>
      </section>

      <section className="dsm131-schedule-shell">
        <header>
          <div><span>WEEKLY TEMPLATE</span><h3>Bookable working periods</h3><p>Each active period must use one of the dentist's assigned branches.</p></div>
          <Button icon={<Save size={15}/>} onClick={() => void save()} disabled={busy}>{busy ? 'Saving...' : 'Save schedule'}</Button>
        </header>
        <div className="dsm131-week">
          {DAYS.map((day, dayOfWeek) => {
            const entries = dayBlocks(blocks, dayOfWeek)
            const total = entries.reduce((sum, { block }) => sum + minutesBetween(block.startTime, block.endTime), 0)
            return <article key={day} id={`dsm131-day-${dayOfWeek}`} className={entries.length ? 'is-working' : ''}>
              <header>
                <div className="dsm131-day-title">
                  <strong>{day}</strong>
                  <small>{entries.length ? `${entries.length} period${entries.length === 1 ? '' : 's'} - ${formatDuration(total)}` : 'Off calendar for booking'}</small>
                </div>
                <label className="dsm131-switch">
                  <input type="checkbox" checked={entries.length > 0} onChange={() => toggleDay(dayOfWeek)}/>
                  <span>{entries.length ? 'Working' : 'Off'}</span>
                </label>
              </header>
              {entries.length ? <div className="dsm131-period-list">
                {entries.map(({ block, index }, entryIndex) => {
                  const branch = assignedBranches.find((row) => row.id === block.branchId)
                  return <div className="dsm131-period" key={`${day}-${index}`}>
                    <span className="dsm131-period-number">{entryIndex + 1}</span>
                    <label><small>Branch</small><select value={block.branchId} onChange={(event) => updateBlock(index, { branchId: event.target.value })}>{assignedBranches.map((assignedBranch) => <option key={assignedBranch.id} value={assignedBranch.id}>{assignedBranch.name}</option>)}</select></label>
                    <label><small>Start</small><input type="time" value={block.startTime} onChange={(event) => updateBlock(index, { startTime: event.target.value })}/></label>
                    <label><small>End</small><input type="time" value={block.endTime} onChange={(event) => updateBlock(index, { endTime: event.target.value })}/></label>
                    <div className="dsm131-period-summary"><Clock3 size={14}/><span>{formatTime(block.startTime)} - {formatTime(block.endTime)}</span><small>{branch?.name ?? 'Assigned branch'}</small></div>
                    <button type="button" aria-label={`Remove ${day} period ${entryIndex + 1}`} onClick={() => removeBlock(index)}><Trash2 size={14}/></button>
                  </div>
                })}
                <button type="button" className="dsm131-add" onClick={() => addPeriod(dayOfWeek)}><Plus size={14}/>Add another period</button>
              </div> : <button type="button" className="dsm131-off-state" onClick={() => addPeriod(dayOfWeek)}><Plus size={15}/><span>Add working hours for {day}</span></button>}
            </article>
          })}
        </div>
        <footer className="dsm131-save-note"><Building2 size={15}/><span>Saving replaces only this dentist's active weekly template. Existing appointments remain untouched.</span></footer>
      </section>

      <section className="dsm131-exceptions">
        <header>
          <div><span>ONE-TIME CHANGES</span><h3>Leave, unavailable dates, and special hours</h3><p>Use exceptions for holidays, emergency leave, temporary coverage, or a single-day schedule change.</p></div>
          <CalendarClock size={19}/>
        </header>
        <div className="dsm131-exception-form">
          <label><span>Date</span><input type="date" value={exception.date} onChange={(event) => setException({ ...exception, date: event.target.value })}/></label>
          <label><span>Branch</span><select value={exception.branchId} onChange={(event) => setException({ ...exception, branchId: event.target.value })}>{assignedBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label><span>Type</span><select value={exception.type} onChange={(event) => setException({ ...exception, type: event.target.value as AvailabilityOverrideType })}><option value="unavailable">Unavailable</option><option value="leave">Leave</option><option value="special_hours">Special hours</option><option value="available">Available hours</option></select></label>
          <label><span>Start</span><input type="time" value={exception.startTime} onChange={(event) => setException({ ...exception, startTime: event.target.value })}/></label>
          <label><span>End</span><input type="time" value={exception.endTime} onChange={(event) => setException({ ...exception, endTime: event.target.value })}/></label>
          <label><span>Reason</span><input value={exception.reason} onChange={(event) => setException({ ...exception, reason: event.target.value })} placeholder="Reason or note"/></label>
          <Button variant="secondary" onClick={() => void addException()} disabled={busy}>Add exception</Button>
        </div>
        <div className="dsm131-exception-list">
          {overrides.slice(0, 8).map((row) => <article key={row.id}>
            <div><strong>{row.date} - {row.type.replaceAll('_', ' ')}</strong><small>{branches.find((branch) => branch.id === row.branchId)?.name ?? 'All assigned branches'}{row.startTime && row.endTime ? ` - ${formatTime(row.startTime)} to ${formatTime(row.endTime)}` : ' - Full day'}{row.reason ? ` - ${row.reason}` : ''}</small></div>
            <button type="button" aria-label={`Remove exception for ${row.date}`} onClick={() => void removeException(row.id)} disabled={busy}><Trash2 size={14}/></button>
          </article>)}
          {!overrides.length && <p>No one-time exceptions recorded.</p>}
        </div>
      </section>
    </>}
  </section>
}
