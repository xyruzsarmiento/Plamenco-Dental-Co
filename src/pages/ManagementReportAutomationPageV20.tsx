import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  FileClock,
  MailCheck,
  Play,
  RefreshCw,
  Settings2,
  TimerReset,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { getStoredBranches } from '../features/branches/branchStore'
import {
  createManagementReportSchedule,
  listManagementReportDeliveries,
  listManagementReportRuns,
  listManagementReportSchedules,
  queueManagementReportRun,
  setManagementReportScheduleEnabled,
  type ManagementReportDelivery,
  type ManagementReportRun,
  type ManagementReportSchedule,
} from '../features/reportAutomation/reportAutomationStore'

const reportTypes = [
  ['daily_operations', 'Daily Operations Summary'],
  ['weekly_management', 'Weekly Management Summary'],
  ['monthly_management', 'Monthly Management Operations Report'],
  ['branch_summary', 'Branch Summary'],
  ['collections_summary', 'Collections Summary'],
  ['receivables_summary', 'Receivables Summary'],
  ['expense_summary', 'Expense Summary'],
  ['inventory_exception_summary', 'Inventory Exception Summary'],
  ['recall_followup_summary', 'Recall / Follow-Up Summary'],
  ['operational_tasks_summary', 'Operational Tasks Summary'],
] as const

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function dateTimeLabel(value?: string) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function statusTone(status: string) {
  if (['delivered', 'generated'].includes(status)) return 'success'
  if (['failed', 'bounced'].includes(status)) return 'danger'
  if (['queued', 'running', 'delivery_pending', 'sending'].includes(status)) return 'warning'
  return 'neutral'
}

function MiniStatusChart({ runs }: { runs: ManagementReportRun[] }) {
  const groups = [
    { key: 'queued', label: 'Queued', value: runs.filter((run) => run.status === 'queued').length },
    { key: 'running', label: 'Running', value: runs.filter((run) => run.status === 'running').length },
    { key: 'generated', label: 'Generated', value: runs.filter((run) => run.status === 'generated').length },
    { key: 'delivered', label: 'Delivered', value: runs.filter((run) => ['delivered', 'partially_delivered'].includes(run.status)).length },
    { key: 'failed', label: 'Failed', value: runs.filter((run) => run.status === 'failed').length },
  ]
  const max = Math.max(1, ...groups.map((item) => item.value))
  return (
    <div className="automation-v20-bars" aria-label="Report run status distribution">
      {groups.map((item) => (
        <div key={item.key} className="automation-v20-bar-row">
          <span>{item.label}</span>
          <div><i style={{ width: `${(item.value / max) * 100}%` }} /></div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  )
}

function DeliveryChart({ deliveries }: { deliveries: ManagementReportDelivery[] }) {
  const delivered = deliveries.filter((item) => item.status === 'delivered').length
  const inFlight = deliveries.filter((item) => ['queued', 'sending', 'sent'].includes(item.status)).length
  const failed = deliveries.filter((item) => ['failed', 'bounced'].includes(item.status)).length
  const total = Math.max(1, deliveries.length)
  return (
    <div className="automation-v20-delivery-chart">
      <div className="automation-v20-delivery-ring" style={{ background: `conic-gradient(#2563EB 0 ${(delivered / total) * 100}%, #93C5FD ${(delivered / total) * 100}% ${((delivered + inFlight) / total) * 100}%, #FCA5A5 ${((delivered + inFlight) / total) * 100}% ${((delivered + inFlight + failed) / total) * 100}%, #E5E7EB ${((delivered + inFlight + failed) / total) * 100}% 100%)` }}>
        <span><strong>{deliveries.length}</strong><small>deliveries</small></span>
      </div>
      <div className="automation-v20-delivery-legend">
        <div><i className="is-delivered" /><span>Delivered</span><strong>{delivered}</strong></div>
        <div><i className="is-flight" /><span>In progress</span><strong>{inFlight}</strong></div>
        <div><i className="is-failed" /><span>Failed / bounced</span><strong>{failed}</strong></div>
      </div>
    </div>
  )
}

export function ManagementReportAutomationPageV20() {
  const branches = useMemo(() => getStoredBranches(), [])
  const [schedules, setSchedules] = useState<ManagementReportSchedule[]>([])
  const [runs, setRuns] = useState<ManagementReportRun[]>([])
  const [deliveries, setDeliveries] = useState<ManagementReportDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [reportType, setReportType] = useState<(typeof reportTypes)[number][0]>('daily_operations')
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'manual'>('manual')
  const [branchScope, setBranchScope] = useState<'clinic_wide' | 'branch'>('clinic_wide')
  const [branchId, setBranchId] = useState('')
  const [format, setFormat] = useState<'pdf' | 'excel' | 'secure_link' | 'html_summary'>('pdf')
  const [periodStart, setPeriodStart] = useState(todayManila())
  const [periodEnd, setPeriodEnd] = useState(todayManila())
  const [selectedScheduleId, setSelectedScheduleId] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [scheduleRows, runRows, deliveryRows] = await Promise.all([
        listManagementReportSchedules(), listManagementReportRuns(), listManagementReportDeliveries(),
      ])
      setSchedules(scheduleRows)
      setRuns(runRows)
      setDeliveries(deliveryRows)
      setSelectedScheduleId((current) => current && scheduleRows.some((row) => row.id === current) ? current : scheduleRows[0]?.id ?? '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Management automation could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function runAction(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(success)
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The report automation action could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const queued = runs.filter((run) => ['queued', 'running'].includes(run.status)).length
  const delivered = deliveries.filter((delivery) => delivery.status === 'delivered').length
  const failures = runs.filter((run) => run.status === 'failed').length + deliveries.filter((delivery) => ['failed', 'bounced'].includes(delivery.status)).length
  const enabledSchedules = schedules.filter((schedule) => schedule.enabled).length
  const selectedSchedule = schedules.find((schedule) => schedule.id === selectedScheduleId)

  const validateRunRange = () => {
    if (!selectedScheduleId) return 'Select a schedule before queueing a report run.'
    if (!periodStart || !periodEnd) return 'Select both period start and end dates.'
    if (periodStart > periodEnd) return 'Period start cannot be later than period end.'
    return ''
  }

  return (
    <PageScaffold title="Management Automation" description="Scheduled report configuration, persisted generation queue, and provider-backed delivery evidence.">
      <div className="automation-v20">
        <section className="automation-v20-hero">
          <div>
            <span>Management operations</span>
            <h2>Reporting automation control center</h2>
            <p>Configure schedules, queue real report-generation jobs, and review persisted run and delivery states without implying success before providers confirm it.</p>
          </div>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> Refresh data</Button>
        </section>

        <section className="automation-v20-metrics">
          <article><CalendarClock size={18} /><div><span>Configured schedules</span><strong>{schedules.length}</strong><small>{enabledSchedules} enabled</small></div></article>
          <article><FileClock size={18} /><div><span>Queued / running</span><strong>{queued}</strong><small>Persisted run states</small></div></article>
          <article><MailCheck size={18} /><div><span>Delivered</span><strong>{delivered}</strong><small>Provider-confirmed only</small></div></article>
          <article><AlertTriangle size={18} /><div><span>Failures</span><strong>{failures}</strong><small>Generation + delivery</small></div></article>
        </section>

        <section className="automation-v20-analytics">
          <article className="automation-v20-card">
            <header><div><span>Run pipeline</span><h3>Generation status</h3></div><TimerReset size={18} /></header>
            <MiniStatusChart runs={runs} />
          </article>
          <article className="automation-v20-card">
            <header><div><span>Provider evidence</span><h3>Delivery status</h3></div><MailCheck size={18} /></header>
            <DeliveryChart deliveries={deliveries} />
          </article>
        </section>

        {error && <div className="automation-v20-alert is-error">{error}</div>}
        {message && <div className="automation-v20-alert is-success"><CheckCircle2 size={16} /> {message}</div>}

        <section className="automation-v20-card automation-v20-builder">
          <header><div><span>Schedule builder</span><h3>Create a disabled report schedule</h3><p>Schedules stay disabled until recipient and timing configuration is ready.</p></div><Settings2 size={19} /></header>
          <div className="automation-v20-builder-grid">
            <label><span>Schedule name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weekly management report" /></label>
            <label><span>Report type</span><select value={reportType} onChange={(event) => setReportType(event.target.value as typeof reportType)}>{reportTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label><span>Frequency</span><select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}><option value="manual">Manual</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
            <label><span>Scope</span><select value={branchScope} onChange={(event) => { setBranchScope(event.target.value as typeof branchScope); setBranchId('') }}><option value="clinic_wide">Clinic-wide</option><option value="branch">Single branch</option></select></label>
            {branchScope === 'branch' && <label><span>Branch</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
            <label><span>Output format</span><select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="pdf">PDF</option><option value="excel">Excel</option><option value="secure_link">Secure Link</option><option value="html_summary">HTML Summary</option></select></label>
          </div>
          <div className="automation-v20-builder-footer"><div><CirclePause size={16} /><span>New schedules are persisted in Disabled state. No delivery is implied.</span></div><Button disabled={busy || !name.trim() || (branchScope === 'branch' && !branchId)} onClick={() => void runAction(async () => { await createManagementReportSchedule({ name, reportType, frequency, branchScope, branchId: branchId || undefined, format }); setName('') }, 'Report schedule created in Disabled state.')}>Create schedule</Button></div>
        </section>

        <section className="automation-v20-card">
          <header><div><span>Schedules</span><h3>Configured automation</h3><p>{schedules.length} schedule{schedules.length === 1 ? '' : 's'} in this management workspace.</p></div></header>
          {loading ? <div className="automation-v20-skeletons"><i /><i /></div> : schedules.length === 0 ? (
            <div className="automation-v20-empty"><CalendarClock size={28} /><h3>No report schedules configured</h3><p>Create a disabled schedule above. Nothing will be sent automatically.</p></div>
          ) : <div className="automation-v20-schedule-grid">{schedules.map((schedule) => {
            const branch = schedule.branchId ? branches.find((item) => item.id === schedule.branchId) : undefined
            return <article key={schedule.id} className="automation-v20-schedule-card">
              <div className="automation-v20-schedule-top"><div><span>{labelize(schedule.reportType)}</span><h4>{schedule.name}</h4></div><em className={schedule.enabled ? 'is-enabled' : 'is-disabled'}>{schedule.enabled ? 'Enabled' : 'Disabled'}</em></div>
              <div className="automation-v20-schedule-meta"><div><span>Frequency</span><strong>{labelize(schedule.frequency)}</strong></div><div><span>Scope</span><strong>{schedule.branchScope === 'clinic_wide' ? 'Clinic-wide' : branch?.name || schedule.branchId || 'Unresolved branch'}</strong></div><div><span>Format</span><strong>{labelize(schedule.format)}</strong></div><div><span>Recipients</span><strong>{schedule.recipientConfig.length}</strong></div></div>
              <div className="automation-v20-schedule-times"><span>Next run <b>{dateTimeLabel(schedule.nextRunAt)}</b></span><span>Last run <b>{dateTimeLabel(schedule.lastRunAt)}</b></span></div>
              {!schedule.enabled && schedule.recipientConfig.length === 0 && <div className="automation-v20-inline-note">Recipient configuration is empty, so enablement remains blocked.</div>}
              <div className="automation-v20-schedule-actions"><Button variant="secondary" onClick={() => setSelectedScheduleId(schedule.id)}>Use for manual run <ChevronRight size={14} /></Button><Button variant="secondary" disabled={busy || (!schedule.enabled && schedule.recipientConfig.length === 0)} onClick={() => void runAction(() => setManagementReportScheduleEnabled(schedule, !schedule.enabled), schedule.enabled ? 'Schedule disabled.' : 'Schedule enabled.')}>{schedule.enabled ? 'Disable' : 'Enable'}</Button></div>
            </article>
          })}</div>}
        </section>

        <section className="automation-v20-card automation-v20-manual">
          <header><div><span>Manual generation</span><h3>Queue a persisted report run</h3><p>Queueing creates a run record only. A trusted server worker must generate the report and delivery records.</p></div><Play size={18} /></header>
          <div className="automation-v20-manual-grid">
            <label><span>Schedule</span><select value={selectedScheduleId} onChange={(event) => setSelectedScheduleId(event.target.value)}><option value="">Select schedule</option>{schedules.map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.name}</option>)}</select></label>
            <label><span>Period start</span><input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
            <label><span>Period end</span><input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
            <Button disabled={busy || Boolean(validateRunRange())} onClick={() => void runAction(() => queueManagementReportRun(selectedScheduleId, periodStart, periodEnd), `${selectedSchedule?.name || 'Report'} queued. This does not mean it was generated or sent.`)}><Play size={15} /> Queue run</Button>
          </div>
          {validateRunRange() && <div className="automation-v20-form-hint">{validateRunRange()}</div>}
        </section>

        <section className="automation-v20-history-grid">
          <article className="automation-v20-card">
            <header><div><span>Generation history</span><h3>Recent report runs</h3></div><b>{runs.length}</b></header>
            {runs.length === 0 ? <div className="automation-v20-empty is-compact"><FileClock size={24} /><h3>No report runs</h3><p>No queued or generated management report history is available.</p></div> : <div className="automation-v20-history-list">{runs.slice(0, 12).map((run) => <div key={run.id} className="automation-v20-history-row"><i className={`tone-${statusTone(run.status)}`} /><div><strong>{labelize(run.reportType)}</strong><span>{run.periodStart} – {run.periodEnd}</span><small>Attempt {run.generationAttempt} · {dateTimeLabel(run.generatedAt || run.createdAt)}</small>{run.failureReason && <p>{run.failureReason}</p>}</div><em className={`tone-${statusTone(run.status)}`}>{labelize(run.status)}</em></div>)}</div>}
          </article>

          <article className="automation-v20-card">
            <header><div><span>Delivery evidence</span><h3>Recent recipient status</h3></div><b>{deliveries.length}</b></header>
            {deliveries.length === 0 ? <div className="automation-v20-empty is-compact"><MailCheck size={24} /><h3>No delivery attempts</h3><p>No provider-backed delivery has been recorded, so this is not treated as successful delivery.</p></div> : <div className="automation-v20-history-list">{deliveries.slice(0, 12).map((delivery) => <div key={delivery.id} className="automation-v20-history-row"><i className={`tone-${statusTone(delivery.status)}`} /><div><strong>{delivery.recipientEmail || delivery.recipientProfileId || 'Recipient unavailable'}</strong><span>{labelize(delivery.channel)} · {dateTimeLabel(delivery.sentAt || delivery.createdAt)}</span><small>{delivery.providerMessageId ? `Provider ID: ${delivery.providerMessageId}` : 'No provider message ID recorded'}</small>{delivery.failureReason && <p>{delivery.failureReason}</p>}</div><em className={`tone-${statusTone(delivery.status)}`}>{labelize(delivery.status)}</em></div>)}</div>}
          </article>
        </section>
      </div>
    </PageScaffold>
  )
}
