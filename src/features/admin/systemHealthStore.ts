import { getPaymentMethods, getStoredPayments } from '../billing/billingStore'
import { getCommunicationDeliveryLogs, getCommunicationOutbox, getCommunicationSettings } from '../communications/communicationStore'
import { getInventoryOverview, getPurchaseOrders, getStockCounts, getStockTransfers } from '../inventory/inventoryStore'
import { getStoredPatientImportBatches, getStoredPatientImportRows } from '../patients/patientImportStore'
import { getRecentAuditLogs, recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { isSupabaseConfigured } from '../../lib/supabase'

export type OperationalState = 'operational' | 'degraded' | 'unavailable' | 'not_configured' | 'unknown'
export type JobRunStatus = 'running' | 'succeeded' | 'failed' | 'partial' | 'skipped'
export type BackupKind = 'platform_database_backup' | 'data_export' | 'pre_migration_snapshot' | 'configuration_backup' | 'storage_backup'
export type BackupVerificationStatus = 'unknown' | 'created' | 'verified' | 'verification_failed'
export type RestorePlanStatus = 'draft' | 'approved' | 'completed' | 'cancelled'

export type SystemHealthCheck = {
  id: string
  area: string
  name: string
  state: OperationalState
  detail: string
  lastCheckedAt: string
  source: string
}

export type JobRunRecord = {
  id: string
  jobName: string
  status: JobRunStatus
  startedAt: string
  finishedAt?: string
  processed: number
  succeeded: number
  failed: number
  errorSummary?: string
  nextScheduledRun?: string
}

export type BackupRegistryEntry = {
  id: string
  kind: BackupKind
  environment: 'production' | 'staging' | 'development' | 'unknown'
  status: 'planned' | 'running' | 'completed' | 'failed'
  verificationStatus: BackupVerificationStatus
  startedAt: string
  completedAt?: string
  createdBy: string
  location: string
  sizeBytes?: number
  checksum?: string
  retentionPolicy?: string
  notes: string
}

export type RestorePlan = {
  id: string
  backupId: string
  targetEnvironment: string
  dataScope: string
  reason: string
  impact: string
  status: RestorePlanStatus
  requestedBy: string
  requestedAt: string
  approvedBy?: string
  approvedAt?: string
}

export type DisasterRecoveryReadiness = {
  backupStatus: OperationalState
  latestVerifiedRecoveryPoint?: BackupRegistryEntry
  rpoDecisionRequired: boolean
  rtoDecisionRequired: boolean
  guidance: string[]
}

export type SystemHealthSnapshot = {
  generatedAt: string
  overallState: OperationalState
  checks: SystemHealthCheck[]
  jobRuns: JobRunRecord[]
  backupRegistry: BackupRegistryEntry[]
  restorePlans: RestorePlan[]
  disasterRecovery: DisasterRecoveryReadiness
  recentFailures: Array<{ id: string; area: string; detail: string; occurredAt: string }>
  migrationSafety: {
    environment: string
    latestVerifiedRecoveryPoint?: string
    latestImportBatch?: string
    importRowsStored: number
    warnings: string[]
  }
}

const BACKUP_REGISTRY_KEY = 'plamenco.systemHealth.backupRegistry'
const RESTORE_PLAN_KEY = 'plamenco.systemHealth.restorePlans'
const JOB_RUN_KEY = 'plamenco.systemHealth.jobRuns'

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) return globalThis.localStorage
  const globalWithMemory = globalThis as typeof globalThis & { __plamencoSystemHealthStorage?: Storage }
  if (globalWithMemory.__plamencoSystemHealthStorage) return globalWithMemory.__plamencoSystemHealthStorage
  const rows = new Map<string, string>()
  const storage = {
    get length() { return rows.size },
    clear: () => rows.clear(),
    getItem: (key: string) => (rows.has(key) ? rows.get(key)! : null),
    key: (index: number) => Array.from(rows.keys())[index] ?? null,
    removeItem: (key: string) => rows.delete(key),
    setItem: (key: string, value: string) => rows.set(key, value),
  } as Storage
  globalWithMemory.__plamencoSystemHealthStorage = storage
  return storage
}

function safeParseList<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(getStorage().getItem(key) ?? '[]') as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveList<T>(key: string, rows: T[]) {
  getStorage().setItem(key, JSON.stringify(rows))
}

function daysSince(value?: string) {
  if (!value) return Infinity
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return Infinity
  return (Date.now() - time) / 86_400_000
}

function mostRecent<T>(rows: T[], getDate: (row: T) => string | undefined) {
  return rows
    .filter((row) => getDate(row))
    .sort((a, b) => new Date(getDate(b) ?? '').getTime() - new Date(getDate(a) ?? '').getTime())[0]
}

function strongestState(states: OperationalState[]): OperationalState {
  if (states.includes('unavailable')) return 'unavailable'
  if (states.includes('degraded')) return 'degraded'
  if (states.includes('not_configured')) return 'degraded'
  if (states.includes('unknown')) return 'unknown'
  return 'operational'
}

export function getBackupRegistry() {
  return safeParseList<BackupRegistryEntry>(BACKUP_REGISTRY_KEY)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
}

export function getRestorePlans() {
  return safeParseList<RestorePlan>(RESTORE_PLAN_KEY)
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
}

export function getJobRunRegistry() {
  return safeParseList<JobRunRecord>(JOB_RUN_KEY)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
}

export function recordBackupEvidence(input: Omit<BackupRegistryEntry, 'id' | 'startedAt' | 'createdBy' | 'verificationStatus'> & { startedAt?: string; createdBy?: string; verificationStatus?: BackupVerificationStatus }) {
  if (!input.location.trim()) throw new Error('Backup location or platform reference is required.')
  const entry: BackupRegistryEntry = {
    id: makeId('backup'),
    startedAt: input.startedAt ?? nowIso(),
    createdBy: input.createdBy ?? getCurrentSessionUserName(),
    verificationStatus: input.verificationStatus ?? (input.status === 'completed' ? 'created' : 'unknown'),
    ...input,
  }
  saveList(BACKUP_REGISTRY_KEY, [entry, ...getBackupRegistry()])
  recordAuditEntry({ user: entry.createdBy, action: 'backup_evidence_recorded', entity: 'backup_registry', entityId: entry.id, metadata: { kind: entry.kind, environment: entry.environment, status: entry.status } })
  return entry
}

export function updateBackupVerification(backupId: string, verificationStatus: BackupVerificationStatus, actor = getCurrentSessionUserName(), notes?: string) {
  const backups = getBackupRegistry()
  const entry = backups.find((backup) => backup.id === backupId)
  if (!entry) throw new Error('Backup registry entry not found.')
  const updated: BackupRegistryEntry = {
    ...entry,
    verificationStatus,
    notes: notes ? `${entry.notes}\nVerification: ${notes}`.trim() : entry.notes,
  }
  saveList(BACKUP_REGISTRY_KEY, backups.map((backup) => backup.id === backupId ? updated : backup))
  recordAuditEntry({ user: actor, action: 'backup_verification_recorded', entity: 'backup_registry', entityId: backupId, metadata: { verificationStatus } })
  return updated
}

export function createRestorePlan(input: Omit<RestorePlan, 'id' | 'status' | 'requestedAt' | 'requestedBy'> & { requestedBy?: string }) {
  if (!input.backupId.trim() || !input.reason.trim() || !input.impact.trim()) throw new Error('Backup, reason, and impact are required for a restore plan.')
  const plan: RestorePlan = {
    id: makeId('restore-plan'),
    status: 'draft',
    requestedAt: nowIso(),
    requestedBy: input.requestedBy ?? getCurrentSessionUserName(),
    ...input,
  }
  saveList(RESTORE_PLAN_KEY, [plan, ...getRestorePlans()])
  recordAuditEntry({ user: plan.requestedBy, action: 'restore_plan_created', entity: 'restore_plan', entityId: plan.id, metadata: { backupId: plan.backupId, targetEnvironment: plan.targetEnvironment, dataScope: plan.dataScope } })
  return plan
}

export function approveRestorePlan(planId: string, actor = getCurrentSessionUserName()) {
  const plans = getRestorePlans()
  const plan = plans.find((entry) => entry.id === planId)
  if (!plan) throw new Error('Restore plan not found.')
  const updated: RestorePlan = { ...plan, status: 'approved', approvedAt: nowIso(), approvedBy: actor }
  saveList(RESTORE_PLAN_KEY, plans.map((entry) => entry.id === planId ? updated : entry))
  recordAuditEntry({ user: actor, action: 'restore_plan_approved', entity: 'restore_plan', entityId: planId, metadata: { backupId: plan.backupId, targetEnvironment: plan.targetEnvironment } })
  return updated
}

export function recordJobRun(input: Omit<JobRunRecord, 'id' | 'startedAt'> & { startedAt?: string }) {
  const run: JobRunRecord = { id: makeId('job-run'), startedAt: input.startedAt ?? nowIso(), ...input }
  saveList(JOB_RUN_KEY, [run, ...getJobRunRegistry()].slice(0, 500))
  return run
}

export function getSystemHealthSnapshot(): SystemHealthSnapshot {
  const generatedAt = nowIso()
  const communicationSettings = getCommunicationSettings()
  const communicationLogs = getCommunicationDeliveryLogs()
  const outbox = getCommunicationOutbox()
  const paymentMethods = getPaymentMethods()
  const payments = getStoredPayments()
  const inventory = getInventoryOverview()
  const auditLogs = getRecentAuditLogs(250)
  const importBatches = getStoredPatientImportBatches()
  const importRows = getStoredPatientImportRows()
  const backups = getBackupRegistry()
  const restorePlans = getRestorePlans()
  const jobRuns = deriveJobRuns(getJobRunRegistry(), outbox)
  const latestVerifiedBackup = backups.find((backup) => backup.verificationStatus === 'verified')
  const recentFailedCommunications = communicationLogs.filter((log) => log.status === 'failed')
  const failedGatewayPayments = payments.filter((payment) => payment.source === 'online_gateway' && payment.status === 'failed')
  const openOutbox = outbox.filter((entry) => entry.status === 'queued' || entry.status === 'processing')
  const staleOutbox = openOutbox.filter((entry) => daysSince(entry.nextAttemptAt) > 1)
  const onlineGatewayConfigured = paymentMethods.some((method) => method.id === 'online_gateway' && method.active && method.isOnline)

  const checks: SystemHealthCheck[] = [
    {
      id: 'app-config',
      area: 'Application',
      name: 'Runtime configuration',
      state: isSupabaseConfigured ? 'operational' : 'not_configured',
      detail: isSupabaseConfigured ? 'Supabase browser configuration is present. Server secrets are intentionally hidden.' : 'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.',
      lastCheckedAt: generatedAt,
      source: 'Vite environment',
    },
    {
      id: 'database-health',
      area: 'Database',
      name: 'Supabase connectivity',
      state: isSupabaseConfigured ? 'unknown' : 'not_configured',
      detail: isSupabaseConfigured ? 'Client configuration exists, but this local dashboard does not perform a live database ping yet.' : 'Database status unavailable until Supabase env is configured.',
      lastCheckedAt: generatedAt,
      source: 'Safe configuration check',
    },
    {
      id: 'storage-health',
      area: 'Storage',
      name: 'Bucket inventory',
      state: 'unknown',
      detail: 'Storage buckets, object counts, public/private status, and orphan checks require a Supabase Storage admin/API check. No private filenames are exposed locally.',
      lastCheckedAt: generatedAt,
      source: 'Storage review required',
    },
    {
      id: 'backup-health',
      area: 'Backups',
      name: 'Verified recovery point',
      state: latestVerifiedBackup ? (daysSince(latestVerifiedBackup.completedAt ?? latestVerifiedBackup.startedAt) <= 7 ? 'operational' : 'degraded') : 'unknown',
      detail: latestVerifiedBackup ? `Latest verified ${latestVerifiedBackup.kind.replaceAll('_', ' ')} recorded ${latestVerifiedBackup.completedAt ?? latestVerifiedBackup.startedAt}.` : 'No verified recovery point recorded in the application registry.',
      lastCheckedAt: generatedAt,
      source: 'Application backup registry',
    },
    {
      id: 'communication-health',
      area: 'Communications',
      name: 'Outbox and provider state',
      state: recentFailedCommunications.length || staleOutbox.length ? 'degraded' : openOutbox.length ? 'operational' : 'unknown',
      detail: `${openOutbox.length} queued job(s), ${staleOutbox.length} stale job(s), ${recentFailedCommunications.length} failed delivery record(s).`,
      lastCheckedAt: generatedAt,
      source: 'Communication outbox and delivery logs',
    },
    {
      id: 'sms-health',
      area: 'Communications',
      name: 'SMS',
      state: communicationSettings.smsConfigured ? channelState('sms', communicationLogs) : 'not_configured',
      detail: communicationSettings.smsConfigured ? `${communicationSettings.smsProvider} marked configured; no automatic SMS probe is sent.` : 'SMS provider is not configured.',
      lastCheckedAt: generatedAt,
      source: 'Communication settings',
    },
    {
      id: 'email-health',
      area: 'Communications',
      name: 'Email',
      state: communicationSettings.emailConfigured ? channelState('email', communicationLogs) : 'not_configured',
      detail: communicationSettings.emailConfigured ? `${communicationSettings.emailProvider.replaceAll('_', ' ')} marked configured; no automatic email probe is sent.` : 'Email provider is not configured.',
      lastCheckedAt: generatedAt,
      source: 'Communication settings',
    },
    {
      id: 'messenger-health',
      area: 'Communications',
      name: 'Messenger',
      state: communicationSettings.messengerConfigured ? channelState('messenger', communicationLogs) : 'not_configured',
      detail: communicationSettings.messengerConfigured ? 'Messenger provider marked configured; page and webhook state must be confirmed server-side.' : 'Messenger provider is not configured.',
      lastCheckedAt: generatedAt,
      source: 'Communication settings',
    },
    {
      id: 'payment-gateway',
      area: 'Payments',
      name: 'Gateway and webhook processing',
      state: onlineGatewayConfigured ? (failedGatewayPayments.length ? 'degraded' : 'unknown') : 'not_configured',
      detail: onlineGatewayConfigured ? `${failedGatewayPayments.length} failed online gateway payment(s). Last webhook health is unavailable from the browser.` : 'Online gateway method is not active/configured.',
      lastCheckedAt: generatedAt,
      source: 'Payment records and method configuration',
    },
    {
      id: 'audit-log-health',
      area: 'Audit',
      name: 'Audit log continuity',
      state: auditLogs.length ? (daysSince(auditLogs[0]?.timestamp) <= 14 ? 'operational' : 'degraded') : 'unknown',
      detail: auditLogs.length ? `${auditLogs.length} recent audit event(s) available locally. Latest: ${auditLogs[0]?.timestamp}.` : 'No audit log entries found in local storage.',
      lastCheckedAt: generatedAt,
      source: 'Audit log store',
    },
    {
      id: 'inventory-jobs',
      area: 'Background Jobs',
      name: 'Inventory operational queues',
      state: inventory.pendingPurchaseOrders || inventory.pendingTransfers || inventory.openStockCounts ? 'degraded' : 'operational',
      detail: `${inventory.pendingPurchaseOrders} pending PO(s), ${inventory.pendingTransfers} stock transfer(s), ${inventory.openStockCounts} open stock count(s).`,
      lastCheckedAt: generatedAt,
      source: 'Inventory store',
    },
  ]

  const migrationWarnings = [
    !latestVerifiedBackup ? 'No verified recovery point is recorded before high-volume import or migration.' : '',
    importBatches.some((batch) => batch.status === 'failed' || batch.status === 'partially_completed') ? 'One or more import batches need review before additional migration work.' : '',
    importRows.length > 500 ? 'Large import row history exists; confirm retention and privacy handling.' : '',
  ].filter(Boolean)

  return {
    generatedAt,
    overallState: strongestState(checks.map((check) => check.state)),
    checks,
    jobRuns,
    backupRegistry: backups,
    restorePlans,
    disasterRecovery: {
      backupStatus: latestVerifiedBackup ? 'operational' : 'unknown',
      latestVerifiedRecoveryPoint: latestVerifiedBackup,
      rpoDecisionRequired: true,
      rtoDecisionRequired: true,
      guidance: [
        'Use platform-managed PostgreSQL backups for relational recovery.',
        'Treat CSV/application exports as reporting or migration aids, not complete database backups.',
        'Verify storage backup coverage separately for documents, receipts, proofs, and import files.',
        'Prefer restore rehearsal in an isolated Supabase project before production recovery.',
      ],
    },
    recentFailures: [
      ...recentFailedCommunications.slice(0, 8).map((log) => ({ id: log.id, area: 'Communications', detail: `${log.channel} to ${log.recipient}: ${log.failureReason || 'failed delivery'}`, occurredAt: log.failedAt ?? log.updatedAt })),
      ...failedGatewayPayments.slice(0, 6).map((payment) => ({ id: payment.id, area: 'Payments', detail: `${payment.paymentNumber} gateway payment failed`, occurredAt: payment.verifiedAt ?? payment.createdAt })),
    ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
    migrationSafety: {
      environment: isSupabaseConfigured ? 'Supabase configured from Vite env' : 'Local/development only',
      latestVerifiedRecoveryPoint: latestVerifiedBackup?.completedAt ?? latestVerifiedBackup?.startedAt,
      latestImportBatch: mostRecent(importBatches, (batch) => batch.createdAt)?.id,
      importRowsStored: importRows.length,
      warnings: migrationWarnings,
    },
  }
}

function channelState(channel: 'sms' | 'email' | 'messenger', logs: ReturnType<typeof getCommunicationDeliveryLogs>): OperationalState {
  const channelLogs = logs.filter((log) => log.channel === channel)
  const recent = channelLogs.filter((log) => daysSince(log.updatedAt) <= 7)
  const recentFailed = recent.filter((log) => log.status === 'failed')
  if (recentFailed.length) return 'degraded'
  if (recent.some((log) => log.status === 'sent' || log.status === 'delivered')) return 'operational'
  return 'unknown'
}

function deriveJobRuns(savedRuns: JobRunRecord[], outbox: ReturnType<typeof getCommunicationOutbox>): JobRunRecord[] {
  const latestQueuedReminder = mostRecent(outbox.filter((entry) => entry.payload?.templateKey === 'appointment.reminder'), (entry) => entry.createdAt)
  const latestOutbox = mostRecent(outbox, (entry) => entry.updatedAt)
  const syntheticRuns: JobRunRecord[] = [
    {
      id: 'synthetic-appointment-reminders',
      jobName: 'Appointment Reminder Processor',
      status: latestQueuedReminder ? 'succeeded' : 'skipped',
      startedAt: latestQueuedReminder?.createdAt ?? nowIso(),
      finishedAt: latestQueuedReminder?.updatedAt,
      processed: latestQueuedReminder ? 1 : 0,
      succeeded: latestQueuedReminder ? 1 : 0,
      failed: 0,
      errorSummary: latestQueuedReminder ? undefined : 'No reminder outbox activity recorded locally.',
      nextScheduledRun: 'Configured outside the browser via scheduler/cron.',
    },
    {
      id: 'synthetic-communication-outbox',
      jobName: 'Communication Outbox Processor',
      status: outbox.some((entry) => entry.status === 'failed') ? 'failed' : outbox.some((entry) => entry.status === 'queued') ? 'running' : 'skipped',
      startedAt: latestOutbox?.createdAt ?? nowIso(),
      finishedAt: latestOutbox?.updatedAt,
      processed: outbox.length,
      succeeded: outbox.filter((entry) => entry.status === 'sent').length,
      failed: outbox.filter((entry) => entry.status === 'failed').length,
      errorSummary: outbox.some((entry) => entry.status === 'failed') ? 'One or more communication outbox entries failed.' : undefined,
      nextScheduledRun: 'Configured by Supabase scheduled invocation or external cron.',
    },
    {
      id: 'synthetic-inventory-review',
      jobName: 'Inventory Stock Review',
      status: getPurchaseOrders().length || getStockTransfers().length || getStockCounts().length ? 'partial' : 'skipped',
      startedAt: nowIso(),
      processed: getPurchaseOrders().length + getStockTransfers().length + getStockCounts().length,
      succeeded: 0,
      failed: 0,
      errorSummary: 'Automated inventory job execution registry is not configured yet.',
      nextScheduledRun: 'Clinic decision required.',
    },
  ]

  return [...savedRuns, ...syntheticRuns].slice(0, 12)
}
