import { Activity, Building2, CalendarClock, CheckCircle2, Clock3, Mail, MapPin, Plus, Save, Search, Trash2, UsersRound, XCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { usePermissions } from '../features/auth/permissions'
import { getStoredBranches, loadBranchesFromSupabase } from '../features/branches/branchStore'
import type { Branch } from '../features/branches/branchTypes'
import {
  createAvailabilityOverride,
  getProviderAvailabilityOverrides,
  getProviderBranchAssignments,
  getProviderScheduleBlocks,
  getStoredProviders,
  loadProviderFoundationFromSupabase,
  saveScheduleBlocks,
} from '../features/dentists/dentistStore'
import type { Provider, ProviderScheduleBlock } from '../features/dentists/dentistTypes'
import { recordAuditEntry } from '../features/security/auditLogStore'
import { getCurrentSessionUserName } from '../features/security/security'

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
type EditableBlock = Omit<ProviderScheduleBlock, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>

function formatTime(value: string) {
  const [hour = 0, minute = 0] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}
function initials(name: string) { return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'DR' }
function roleLabel(role: Provider['role']) { return role === 'associate_dentist' ? 'Associate Dentist' : 'Dentist' }
function scheduleFor(providerId: string): EditableBlock[] {
  return getProviderScheduleBlocks().filter((block) => block.providerId === providerId).map(({ branchId, dayOfWeek, startTime, endTime, status }) => ({ branchId, dayOfWeek, startTime, endTime, status }))
}

export function DentistsPageV51() {
  const { can } = usePermissions()
  const canManageSchedules = can('schedule.manage_all')
  const [branches, setBranches] = useState<Branch[]>(() => getStoredBranches())
  const [providers, setProviders] = useState<Provider[]>(() => getStoredProviders())
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [query, setQuery] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [scheduleBlocks, setScheduleBlocks] = useState<EditableBlock[]>([])
  const [saving, setSaving] = useState(false)
  const [scheduleFeedback, setScheduleFeedback] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [overrideForm, setOverrideForm] = useState({ date: '', type: 'unavailable', branchId: '', startTime: '', endTime: '', reason: '' })

  useEffect(() => {
    let mounted = true
    void Promise.all([loadBranchesFromSupabase(), loadProviderFoundationFromSupabase()]).then(([loadedBranches, foundation]) => {
      if (!mounted) return
      setBranches(loadedBranches)
      setProviders(foundation.providers)
      const first = foundation.providers[0]?.id || ''
      setSelectedProviderId((current) => current || first)
      if (first) setScheduleBlocks(scheduleFor(first))
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!selectedProviderId) return
    setScheduleBlocks(scheduleFor(selectedProviderId))
    setScheduleFeedback(null)
    setScheduleError(null)
  }, [selectedProviderId])

  const filteredProviders = useMemo(() => {
    const q = query.trim().toLowerCase()
    return providers.filter((provider) => {
      const assignments = getProviderBranchAssignments().filter((assignment) => assignment.providerId === provider.id && assignment.status === 'active')
      const matchesQuery = !q || `${provider.displayName} ${provider.email} ${provider.specialization} ${provider.licenseNumber}`.toLowerCase().includes(q)
      const matchesBranch = branchFilter === 'all' || assignments.some((assignment) => assignment.branchId === branchFilter)
      return matchesQuery && matchesBranch
    }).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [branchFilter, providers, query])

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? filteredProviders[0] ?? null
  const assignedBranchIds = selectedProvider ? getProviderBranchAssignments().filter((a) => a.providerId === selectedProvider.id && a.status === 'active').map((a) => a.branchId) : []
  const assignedBranches = branches.filter((branch) => assignedBranchIds.includes(branch.id))
  const selectedOverrides = selectedProvider ? getProviderAvailabilityOverrides().filter((item) => item.providerId === selectedProvider.id) : []
  const persistedBlocks = selectedProvider ? getProviderScheduleBlocks().filter((block) => block.providerId === selectedProvider.id) : []
  const workingDays = new Set(scheduleBlocks.map((block) => block.dayOfWeek)).size

  function addBlock(dayOfWeek: number) {
    if (!selectedProvider) return
    const defaultBranchId = assignedBranches[0]?.id ?? ''
    if (!defaultBranchId) {
      setScheduleError('Assign this provider to a branch before adding working hours.')
      return
    }
    setScheduleError(null)
    setScheduleBlocks((current) => [...current, { dayOfWeek, branchId: defaultBranchId, startTime: '09:00', endTime: '17:00', status: 'active' }])
  }

  function toggleDay(dayOfWeek: number) {
    const open = scheduleBlocks.some((block) => block.dayOfWeek === dayOfWeek)
    if (open) {
      setScheduleBlocks((current) => current.filter((block) => block.dayOfWeek !== dayOfWeek))
      setScheduleFeedback(null)
      return
    }
    addBlock(dayOfWeek)
  }

  function updateBlock(index: number, patch: Partial<EditableBlock>) {
    setScheduleBlocks((current) => current.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block))
    setScheduleFeedback(null)
  }

  function removeBlock(index: number) {
    setScheduleBlocks((current) => current.filter((_, blockIndex) => blockIndex !== index))
    setScheduleFeedback(null)
  }

  function validateSchedule() {
    for (const block of scheduleBlocks) {
      if (!block.branchId || !assignedBranchIds.includes(block.branchId)) return 'Every schedule period must use one of the provider’s assigned branches.'
      if (!block.startTime || !block.endTime || block.startTime >= block.endTime) return `${days[block.dayOfWeek]} has an invalid time range.`
    }
    for (let day = 0; day < 7; day += 1) {
      const blocks = scheduleBlocks.filter((block) => block.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime))
      for (let i = 1; i < blocks.length; i += 1) if (blocks[i].startTime < blocks[i - 1].endTime) return `${days[day]} has overlapping working hours.`
    }
    return null
  }

  async function saveWeeklySchedule() {
    if (!selectedProvider || saving) return
    const validation = validateSchedule()
    if (validation) { setScheduleError(validation); return }
    setSaving(true)
    setScheduleFeedback(null)
    setScheduleError(null)
    try {
      const result = await saveScheduleBlocks(selectedProvider.id, scheduleBlocks)
      setScheduleBlocks(result.blocks.map(({ branchId, dayOfWeek, startTime, endTime, status }) => ({ branchId, dayOfWeek, startTime, endTime, status })))
      setScheduleFeedback(result.persisted ? 'Weekly schedule saved to the clinic database.' : 'Weekly schedule saved locally. Supabase is not configured in this environment.')
      recordAuditEntry({ user: getCurrentSessionUserName(), action: 'provider_schedule_updated', entity: 'provider', entityId: selectedProvider.id, metadata: { blockCount: result.blocks.length } })
    } catch (cause) {
      setScheduleError(cause instanceof Error ? cause.message : 'The weekly schedule could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function resetSchedule() {
    if (!selectedProvider) return
    setScheduleBlocks(scheduleFor(selectedProvider.id))
    setScheduleFeedback(null)
    setScheduleError(null)
  }

  function addOverride() {
    if (!selectedProvider || !overrideForm.date) return
    createAvailabilityOverride({ providerId: selectedProvider.id, branchId: overrideForm.branchId || undefined, date: overrideForm.date, type: overrideForm.type as any, startTime: overrideForm.startTime || undefined, endTime: overrideForm.endTime || undefined, reason: overrideForm.reason.trim(), privateNotes: '' })
    setOverrideForm({ date: '', type: 'unavailable', branchId: '', startTime: '', endTime: '', reason: '' })
    recordAuditEntry({ user: getCurrentSessionUserName(), action: 'provider_availability_changed', entity: 'provider', entityId: selectedProvider.id, metadata: { type: overrideForm.type, date: overrideForm.date } })
  }

  return (
    <section className="dv51-page">
      <header className="dv51-hero"><div><span>Provider operations</span><h2>Dentists & providers</h2><p>Manage provider coverage and working hours with a simpler weekly schedule editor.</p></div><div className="dv51-hero-badge"><CalendarClock size={18}/><strong>{persistedBlocks.length}</strong><span>saved schedule blocks</span></div></header>

      <section className="dv51-filterbar"><label className="dv51-search"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search dentist, specialization or email" /></label><select value={branchFilter} onChange={(event)=>setBranchFilter(event.target.value)}><option value="all">All branches</option>{branches.map((branch)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></section>

      {!providers.length ? <EmptyState title="No dentist profiles yet" message="Add a provider profile before configuring weekly availability." /> : <div className="dv51-workspace">
        <aside className="dv51-directory"><header><div><span>Provider directory</span><h3>{filteredProviders.length} providers</h3></div><UsersRound size={18}/></header><div className="dv51-provider-list">{filteredProviders.map((provider)=>{ const count=getProviderScheduleBlocks().filter((block)=>block.providerId===provider.id).length; return <button key={provider.id} type="button" className={selectedProvider?.id===provider.id?'is-selected':''} onClick={()=>setSelectedProviderId(provider.id)}><span className="dv51-avatar">{initials(provider.displayName)}</span><span><strong>{provider.displayName}</strong><small>{roleLabel(provider.role)}{provider.specialization?` · ${provider.specialization}`:''}</small><em><CalendarClock size={12}/>{count ? `${count} saved block${count===1?'':'s'}` : 'No weekly schedule'}</em></span></button>})}</div></aside>

        {selectedProvider && <main className="dv51-main">
          <section className="dv51-provider-card"><div className="dv51-identity"><span className="dv51-avatar is-large">{initials(selectedProvider.displayName)}</span><div><span>Selected provider</span><h2>{selectedProvider.displayName}</h2><p>{roleLabel(selectedProvider.role)}{selectedProvider.specialization?` · ${selectedProvider.specialization}`:''}</p><div><span><Mail size={13}/>{selectedProvider.email}</span></div></div></div><Badge tone={selectedProvider.status==='active'?'success':'neutral'}>{selectedProvider.status.replace('_',' ')}</Badge></section>

          <section className="dv51-branch-card"><div className="dv51-section-title"><MapPin size={17}/><div><span>Branch coverage</span><h3>Assigned locations</h3></div></div><div className="dv51-branch-chips">{assignedBranches.length?assignedBranches.map((branch)=><span key={branch.id}><Building2 size={13}/>{branch.name}</span>):<p>No branch assignments. Add a branch assignment before scheduling.</p>}</div></section>

          <section className="dv53-schedule-card">
            <header className="dv53-schedule-header">
              <div>
                <span className="dv53-kicker">Weekly schedule</span>
                <h3>Set regular working hours</h3>
                <p>Turn a day on, choose the clinic and hours, then save. Days turned off mean the dentist is unavailable.</p>
              </div>
              <div className="dv53-header-actions">
                <Button variant="secondary" size="sm" onClick={resetSchedule} disabled={saving}>Reset</Button>
                <Button className="dv61-save-schedule" icon={<Save size={15}/>} onClick={saveWeeklySchedule} disabled={!canManageSchedules||saving}>{saving?'Saving…':'Save schedule'}</Button>
              </div>
            </header>

            <div className="dv53-overview">
              <div><CalendarClock size={17}/><span>Working days</span><strong>{workingDays} of 7</strong></div>
              <div><Clock3 size={17}/><span>Working periods</span><strong>{scheduleBlocks.length}</strong></div>
              <div><Building2 size={17}/><span>Assigned clinics</span><strong>{assignedBranches.length}</strong></div>
            </div>

            {scheduleError&&<div className="dv51-message is-error"><XCircle size={16}/>{scheduleError}</div>}
            {scheduleFeedback&&<div className="dv51-message is-success"><CheckCircle2 size={16}/>{scheduleFeedback}</div>}

            {!assignedBranches.length ? (
              <div className="dv53-no-branch"><Building2 size={20}/><div><strong>No branch assignment</strong><span>Assign this dentist to at least one clinic before setting working hours.</span></div></div>
            ) : (
              <div className="dv53-week">
                {days.map((day,dayOfWeek)=>{
                  const entries=scheduleBlocks.map((block,index)=>({block,index})).filter((entry)=>entry.block.dayOfWeek===dayOfWeek)
                  const isOpen=entries.length>0
                  return <article key={day} className={`dv53-day ${isOpen?'is-open':'is-closed'}`}>
                    <div className="dv53-day-summary">
                      <div className="dv53-day-name"><strong>{day}</strong><span>{isOpen?entries.map(({block})=>`${formatTime(block.startTime)}–${formatTime(block.endTime)}`).join(' · '):'Unavailable'}</span></div>
                      <label className="dv53-toggle">
                        <input type="checkbox" checked={isOpen} disabled={!canManageSchedules} onChange={()=>toggleDay(dayOfWeek)}/>
                        <span className="dv53-toggle-track"><i/></span>
                        <b>{isOpen?'Working':'Off'}</b>
                      </label>
                    </div>

                    {isOpen&&<div className="dv53-periods">
                      {entries.map(({block,index},entryIndex)=><div className="dv53-period" key={`${day}-${index}`}>
                        <span className="dv53-period-number">{entryIndex+1}</span>
                        <label><span>Clinic</span><select value={block.branchId} disabled={!canManageSchedules} onChange={(event)=>updateBlock(index,{branchId:event.target.value})}>{assignedBranches.map((branch)=><option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
                        <label><span>From</span><input type="time" value={block.startTime} disabled={!canManageSchedules} onChange={(event)=>updateBlock(index,{startTime:event.target.value})}/></label>
                        <label><span>To</span><input type="time" value={block.endTime} disabled={!canManageSchedules} onChange={(event)=>updateBlock(index,{endTime:event.target.value})}/></label>
                        {canManageSchedules&&entries.length>1&&<button type="button" className="dv53-remove" onClick={()=>removeBlock(index)} aria-label={`Remove ${day} period ${entryIndex+1}`}><Trash2 size={14}/><span>Remove</span></button>}
                      </div>)}
                      {canManageSchedules&&<button type="button" className="dv53-add-period" onClick={()=>addBlock(dayOfWeek)}><Plus size={14}/>Add another time period</button>}
                    </div>}
                  </article>
                })}
              </div>
            )}

            <footer className="dv53-savebar">
              <div><strong>{workingDays ? `${workingDays} working day${workingDays===1?'':'s'} configured` : 'No working days configured'}</strong><span>Use Availability Exceptions below only for one-time changes such as leave or special hours.</span></div>
              <Button className="dv61-save-schedule" icon={<Save size={15}/>} onClick={saveWeeklySchedule} disabled={!canManageSchedules||saving||!assignedBranches.length}>{saving?'Saving…':'Save schedule'}</Button>
            </footer>
          </section>

          <section className="dv51-exceptions"><div className="dv51-section-title"><Activity size={17}/><div><span>One-time changes</span><h3>Availability exceptions</h3><p>Use this for leave, special clinic hours or a single unavailable date without changing the weekly pattern.</p></div></div>{canManageSchedules&&<div className="dv51-exception-form"><Input type="date" label="Date" value={overrideForm.date} onChange={(event)=>setOverrideForm({...overrideForm,date:event.target.value})}/><Select label="Type" value={overrideForm.type} onChange={(event)=>setOverrideForm({...overrideForm,type:event.target.value})} options={[{label:'Unavailable',value:'unavailable'},{label:'Special hours',value:'special_hours'},{label:'Available',value:'available'},{label:'Leave',value:'leave'}]}/><Select label="Branch" value={overrideForm.branchId} onChange={(event)=>setOverrideForm({...overrideForm,branchId:event.target.value})} options={[{label:'All assigned branches',value:''},...assignedBranches.map((branch)=>({label:branch.name,value:branch.id}))]}/><Input type="time" label="Start" value={overrideForm.startTime} onChange={(event)=>setOverrideForm({...overrideForm,startTime:event.target.value})}/><Input type="time" label="End" value={overrideForm.endTime} onChange={(event)=>setOverrideForm({...overrideForm,endTime:event.target.value})}/><Input label="Reason" value={overrideForm.reason} onChange={(event)=>setOverrideForm({...overrideForm,reason:event.target.value})}/><Button variant="secondary" onClick={addOverride}>Add exception</Button></div>}<div className="dv51-exception-list">{selectedOverrides.length?selectedOverrides.map((item)=><div key={item.id}><span><strong>{item.date}</strong><small>{item.reason||item.type.replace('_',' ')}</small></span><span>{item.startTime&&item.endTime?`${formatTime(item.startTime)} – ${formatTime(item.endTime)}`:'Full day'}</span></div>):<p>No availability exceptions recorded.</p>}</div></section>
        </main>}
      </div>}
    </section>
  )
}
