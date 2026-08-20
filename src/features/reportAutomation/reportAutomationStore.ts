import { supabase } from '../../lib/supabase'

export type ManagementReportSchedule = {
  id: string
  name: string
  reportType: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual'
  timezone: string
  branchScope: 'clinic_wide' | 'branch'
  branchId?: string
  format: 'pdf' | 'excel' | 'secure_link' | 'html_summary'
  recipientConfig: Array<Record<string, unknown>>
  enabled: boolean
  scheduleConfig: Record<string, unknown>
  nextRunAt?: string
  lastRunAt?: string
  updatedAt: string
}

export type ManagementReportRun = {
  id: string
  scheduleId?: string
  runKey: string
  generationAttempt: number
  reportType: string
  periodStart: string
  periodEnd: string
  branchScopeSnapshot: Record<string, unknown>
  filtersSnapshot: Record<string, unknown>
  metricDefinitionVersion?: string
  status: 'queued' | 'running' | 'generated' | 'delivery_pending' | 'delivered' | 'partially_delivered' | 'failed' | 'cancelled'
  generatedFilePath?: string
  generatedFormat?: string
  generatedAt?: string
  completedAt?: string
  failedAt?: string
  failureReason: string
  createdAt: string
}

export type ManagementReportDelivery = {
  id: string
  runId: string
  recipientType: 'profile' | 'approved_external_email'
  recipientProfileId?: string
  recipientEmail?: string
  channel: 'email' | 'in_app'
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'cancelled'
  providerMessageId?: string
  sentAt?: string
  deliveredAt?: string
  failedAt?: string
  failureReason: string
  attemptCount: number
  createdAt: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Management report automation is unavailable because Supabase is not configured.')
  return supabase
}

function mapSchedule(row: Record<string, any>): ManagementReportSchedule {
  return {
    id: String(row.id),
    name: row.name ?? 'Scheduled Report',
    reportType: row.report_type,
    frequency: row.frequency,
    timezone: row.timezone ?? 'Asia/Manila',
    branchScope: row.branch_scope,
    branchId: row.branch_id ?? undefined,
    format: row.format,
    recipientConfig: Array.isArray(row.recipient_config) ? row.recipient_config : [],
    enabled: Boolean(row.enabled),
    scheduleConfig: row.schedule_config ?? {},
    nextRunAt: row.next_run_at ?? undefined,
    lastRunAt: row.last_run_at ?? undefined,
    updatedAt: row.updated_at,
  }
}

function mapRun(row: Record<string, any>): ManagementReportRun {
  return {
    id: String(row.id),
    scheduleId: row.schedule_id ?? undefined,
    runKey: row.run_key,
    generationAttempt: Number(row.generation_attempt ?? 1),
    reportType: row.report_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    branchScopeSnapshot: row.branch_scope_snapshot ?? {},
    filtersSnapshot: row.filters_snapshot ?? {},
    metricDefinitionVersion: row.metric_definition_version ?? undefined,
    status: row.status,
    generatedFilePath: row.generated_file_path ?? undefined,
    generatedFormat: row.generated_format ?? undefined,
    generatedAt: row.generated_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    failureReason: row.failure_reason ?? '',
    createdAt: row.created_at,
  }
}

function mapDelivery(row: Record<string, any>): ManagementReportDelivery {
  return {
    id: String(row.id),
    runId: row.run_id,
    recipientType: row.recipient_type,
    recipientProfileId: row.recipient_profile_id ?? undefined,
    recipientEmail: row.recipient_email ?? undefined,
    channel: row.channel,
    status: row.status,
    providerMessageId: row.provider_message_id ?? undefined,
    sentAt: row.sent_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    failedAt: row.failed_at ?? undefined,
    failureReason: row.failure_reason ?? '',
    attemptCount: Number(row.attempt_count ?? 0),
    createdAt: row.created_at,
  }
}

export async function listManagementReportSchedules(): Promise<ManagementReportSchedule[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('management_report_schedules')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapSchedule)
}

export async function listManagementReportRuns(limit = 100): Promise<ManagementReportRun[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('management_report_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(mapRun)
}

export async function listManagementReportDeliveries(limit = 100): Promise<ManagementReportDelivery[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('management_report_deliveries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(mapDelivery)
}

export async function createManagementReportSchedule(input: {
  name: string
  reportType: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'manual'
  branchScope: 'clinic_wide' | 'branch'
  branchId?: string
  format: 'pdf' | 'excel' | 'secure_link' | 'html_summary'
  recipientConfig?: Array<Record<string, unknown>>
  scheduleConfig?: Record<string, unknown>
}) {
  const client = requireSupabase()
  const name = input.name.trim()
  if (!name) throw new Error('Schedule name is required.')
  if (input.branchScope === 'branch' && !input.branchId) throw new Error('Select a branch for this report schedule.')

  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError) throw new Error(`Unable to verify the current account: ${authError.message}`)
  if (!authData.user) throw new Error('You must be signed in to create a management report schedule.')

  // Persist the disabled schedule directly through the RLS-protected table. This avoids
  // client/RPC signature drift while preserving the same database constraints and
  // management-only authorization. A worker is still required for generation/delivery.
  const { data, error } = await client
    .from('management_report_schedules')
    .insert({
      name,
      report_type: input.reportType,
      frequency: input.frequency,
      timezone: 'Asia/Manila',
      branch_scope: input.branchScope,
      branch_id: input.branchScope === 'branch' ? input.branchId ?? null : null,
      format: input.format,
      recipient_config: input.recipientConfig ?? [],
      enabled: false,
      schedule_config: input.scheduleConfig ?? {},
      created_by: authData.user.id,
      updated_by: authData.user.id,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Unable to create report schedule: ${error.message}`)
  if (!data?.id) throw new Error('The report schedule was not returned by the database after creation.')
  return String(data.id)
}

export async function setManagementReportScheduleEnabled(schedule: ManagementReportSchedule, enabled: boolean) {
  const client = requireSupabase()
  const { error } = await client.rpc('set_management_report_schedule_enabled', {
    p_schedule_id: schedule.id,
    p_enabled: enabled,
    p_expected_updated_at: schedule.updatedAt,
  })
  if (error) throw error
}

export async function queueManagementReportRun(scheduleId: string, periodStart: string, periodEnd: string, manualRegeneration = false) {
  const client = requireSupabase()
  const { data, error } = await client.rpc('queue_management_report_run', {
    p_schedule_id: scheduleId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_manual_regeneration: manualRegeneration,
  })
  if (error) throw error
  return String(data)
}
