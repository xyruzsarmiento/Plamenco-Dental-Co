import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, FileClock, MailCheck, RefreshCw } from 'lucide-react'
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
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function todayManila() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function ManagementReportAutomationPage() {
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

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [scheduleRows, runRows, deliveryRows] = await Promise.all([
        listManagementReportSchedules(),
        listManagementReportRuns(),
        listManagementReportDeliveries(),
      ])
      setSchedules(scheduleRows)
      setRuns(runRows)
      setDeliveries(deliveryRows)
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

  const failures = runs.filter((run) => run.status === 'failed').length + deliveries.filter((delivery) => ['failed', 'bounced'].includes(delivery.status)).length
  const delivered = deliveries.filter((delivery) => delivery.status === 'delivered').length
  const queued = runs.filter((run) => ['queued', 'running'].includes(run.status)).length

  return (
    <PageScaffold
      title="Management Automation"
      description="Scheduled report configuration, generation history, and provider-backed delivery status."
    >
      <div className="page-stack">
        <section className="dashboard-stat-grid">
          <div className="stat-card"><CalendarClock size={18} /><span>Configured schedules</span><strong>{schedules.length}</strong></div>
          <div className="stat-card"><FileClock size={18} /><span>Queued / running</span><strong>{queued}</strong></div>
          <div className="stat-card"><MailCheck size={18} /><span>Provider-confirmed delivered</span><strong>{delivered}</strong></div>
          <div className="stat-card"><AlertTriangle size={18} /><span>Generation / delivery failures</span><strong>{failures}</strong></div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Schedule Configuration</p>
              <h2>Create disabled report schedule</h2>
              <p className="muted-label">Schedules are created disabled. Recipients and timing must be explicitly configured before enablement.</p>
            </div>
            <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Refresh</Button>
          </div>

          <div className="treatment-filter-grid">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Schedule name" />
            <select value={reportType} onChange={(event) => setReportType(event.target.value as typeof reportType)}>
              {reportTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}>
              <option value="manual">Manual</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select value={branchScope} onChange={(event) => { setBranchScope(event.target.value as typeof branchScope); setBranchId('') }}>
              <option value="clinic_wide">Clinic-wide</option>
              <option value="branch">Single branch</option>
            </select>
            {branchScope === 'branch' && (
              <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                <option value="">Select branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            )}
            <select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>
              <option value="pdf">PDF</option>
              <option value="excel">Excel</option>
              <option value="secure_link">Secure Link</option>
              <option value="html_summary">HTML Summary</option>
            </select>
          </div>
          <Button disabled={busy || !name.trim() || (branchScope === 'branch' && !branchId)} onClick={() => void runAction(async () => {
            await createManagementReportSchedule({ name, reportType, frequency, branchScope, branchId: branchId || undefined, format })
            setName('')
          }, 'Report schedule created in Disabled state.')}>Create schedule</Button>
        </section>

        {error && <div className="error-alert">{error}</div>}
        {message && <div className="success-text"><CheckCircle2 size={15} /> {message}</div>}

        <section className="panel">
          <div className="panel-header"><div><p className="eyebrow">Schedules</p><h2>{schedules.length} configured</h2></div></div>
          {loading ? <p>Loading report schedules...</p> : schedules.length === 0 ? (
            <div className="empty-state-panel"><CalendarClock size={22} /><h3>No report schedules configured</h3><p>Create a disabled schedule first. Nothing will be sent automatically.</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Report</th><th>Frequency</th><th>Scope</th><th>Recipients</th><th>Next Run</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {schedules.map((schedule) => (
                    <tr key={schedule.id}>
                      <td><strong>{schedule.name}</strong><br /><span className="muted-label">{labelize(schedule.reportType)}</span></td>
                      <td>{labelize(schedule.frequency)}</td>
                      <td>{schedule.branchScope === 'clinic_wide' ? 'Clinic-wide' : schedule.branchId || 'Branch not resolved'}</td>
                      <td>{schedule.recipientConfig.length}</td>
                      <td>{dateTimeLabel(schedule.nextRunAt)}</td>
                      <td>{schedule.enabled ? 'Enabled' : 'Disabled'}</td>
                      <td>
                        <Button variant="secondary" disabled={busy || (!schedule.enabled && schedule.recipientConfig.length === 0)} onClick={() => void runAction(() => setManagementReportScheduleEnabled(schedule, !schedule.enabled), schedule.enabled ? 'Schedule disabled.' : 'Schedule enabled.')}>{schedule.enabled ? 'Disable' : 'Enable'}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header"><div><p className="eyebrow">Manual Generation Queue</p><h2>Queue a persisted run</h2><p className="muted-label">Queueing is not generation or delivery. A trusted server worker must produce the file and delivery records.</p></div></div>
          <div className="treatment-filter-grid">
            <select id="manual-report-schedule" defaultValue="">
              <option value="" disabled>Select schedule below using Queue button</option>
            </select>
            <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
            <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </div>
          <div className="button-row">
            {schedules.map((schedule) => (
              <Button key={schedule.id} variant="secondary" disabled={busy || !periodStart || !periodEnd} onClick={() => void runAction(() => queueManagementReportRun(schedule.id, periodStart, periodEnd), `${schedule.name} queued. This does not mean the report was generated or sent.`)}>Queue {schedule.name}</Button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header"><div><p className="eyebrow">Report Runs</p><h2>Generation history</h2></div></div>
          {runs.length === 0 ? <div className="empty-state-panel"><FileClock size={22} /><h3>No report runs</h3><p>No generated or queued management report history is available.</p></div> : (
            <div className="table-wrap"><table><thead><tr><th>Report</th><th>Period</th><th>Attempt</th><th>Status</th><th>Generated</th><th>Failure</th></tr></thead><tbody>
              {runs.map((run) => <tr key={run.id}><td>{labelize(run.reportType)}</td><td>{run.periodStart} – {run.periodEnd}</td><td>{run.generationAttempt}</td><td>{labelize(run.status)}</td><td>{dateTimeLabel(run.generatedAt)}</td><td>{run.failureReason || '—'}</td></tr>)}
            </tbody></table></div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header"><div><p className="eyebrow">Delivery History</p><h2>Provider-backed recipient status</h2></div></div>
          {deliveries.length === 0 ? <div className="empty-state-panel"><MailCheck size={22} /><h3>No delivery attempts</h3><p>No email or in-app delivery has been recorded. This is not treated as successful delivery.</p></div> : (
            <div className="table-wrap"><table><thead><tr><th>Recipient</th><th>Channel</th><th>Status</th><th>Provider ID</th><th>Sent</th><th>Delivered</th><th>Failure</th></tr></thead><tbody>
              {deliveries.map((delivery) => <tr key={delivery.id}><td>{delivery.recipientEmail || delivery.recipientProfileId || 'Recipient unavailable'}</td><td>{labelize(delivery.channel)}</td><td>{labelize(delivery.status)}</td><td>{delivery.providerMessageId || '—'}</td><td>{dateTimeLabel(delivery.sentAt)}</td><td>{dateTimeLabel(delivery.deliveredAt)}</td><td>{delivery.failureReason || '—'}</td></tr>)}
            </tbody></table></div>
          )}
        </section>
      </div>
    </PageScaffold>
  )
}
