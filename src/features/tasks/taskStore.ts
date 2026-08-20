import { supabase } from '../../lib/supabase'

export type TaskStatus = 'open' | 'in_progress' | 'waiting' | 'blocked' | 'completed' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical'

export type OperationalTask = {
  id: string
  taskKey: string
  taskType: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  patientId?: string
  branchId?: string
  providerId?: string
  assigneeProfileId?: string
  sourceType: string
  sourceId: string
  sourceRoute?: string
  automationRuleKey?: string
  dueAt?: string
  claimedAt?: string
  completedAt?: string
  blockedReason: string
  createdSource: 'user' | 'system' | 'edge_function' | 'database_event'
  createdAt: string
  updatedAt: string
}

export type TaskEvent = {
  id: string
  eventType: string
  oldValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  notes: string
  actorProfileId?: string
  createdAt: string
}

export type TaskNote = {
  id: string
  note: string
  authorProfileId?: string
  createdAt: string
}

function db() {
  if (!supabase) throw new Error('Tasks are unavailable because the database connection is not configured.')
  return supabase
}

function mapTask(row: Record<string, any>): OperationalTask {
  return {
    id: row.id,
    taskKey: row.task_key,
    taskType: row.task_type,
    title: row.title,
    description: row.description ?? '',
    status: row.status,
    priority: row.priority,
    patientId: row.patient_id ?? undefined,
    branchId: row.branch_id ?? undefined,
    providerId: row.provider_id ?? undefined,
    assigneeProfileId: row.assignee_profile_id ?? undefined,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceRoute: row.source_route ?? undefined,
    automationRuleKey: row.automation_rule_key ?? undefined,
    dueAt: row.due_at ?? undefined,
    claimedAt: row.claimed_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    blockedReason: row.blocked_reason ?? '',
    createdSource: row.created_source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function manilaBusinessDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function isTaskOverdue(task: OperationalTask) {
  if (!task.dueAt || ['completed', 'cancelled'].includes(task.status)) return false
  const dueDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(task.dueAt))
  return dueDate < manilaBusinessDate()
}

export async function listOperationalTasks(input?: {
  status?: TaskStatus
  priority?: TaskPriority
  branchId?: string
  assigneeProfileId?: string
  sourceType?: string
  limit?: number
}) {
  let query = db()
    .from('operational_tasks')
    .select('*')
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input?.limit ?? 200, 1), 500))

  if (input?.status) query = query.eq('status', input.status)
  if (input?.priority) query = query.eq('priority', input.priority)
  if (input?.branchId) query = query.eq('branch_id', input.branchId)
  if (input?.assigneeProfileId) query = query.eq('assignee_profile_id', input.assigneeProfileId)
  if (input?.sourceType) query = query.eq('source_type', input.sourceType)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapTask)
}

export async function listTaskEvents(taskId: string) {
  const { data, error } = await db()
    .from('task_events')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []).map((row): TaskEvent => ({
    id: row.id,
    eventType: row.event_type,
    actorProfileId: row.actor_profile_id ?? undefined,
    oldValue: row.old_value ?? undefined,
    newValue: row.new_value ?? undefined,
    notes: row.notes ?? '',
    createdAt: row.created_at,
  }))
}

export async function listTaskNotes(taskId: string) {
  const { data, error } = await db()
    .from('task_notes')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []).map((row): TaskNote => ({
    id: row.id,
    note: row.note,
    authorProfileId: row.author_profile_id ?? undefined,
    createdAt: row.created_at,
  }))
}

export async function createManualOperationalTask(input: {
  title: string
  description?: string
  taskType?: string
  sourceType: string
  sourceId: string
  sourceRoute?: string
  patientId?: string
  branchId?: string
  providerId?: string
  priority?: TaskPriority
  dueAt?: string
}) {
  const key = `MANUAL:${input.sourceType}:${input.sourceId}:${crypto.randomUUID()}`
  const { data, error } = await db().rpc('create_operational_task', {
    p_task_key: key,
    p_task_type: input.taskType ?? 'general_operational',
    p_title: input.title.trim(),
    p_description: input.description?.trim() ?? '',
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_source_route: input.sourceRoute ?? null,
    p_patient_id: input.patientId ?? null,
    p_branch_id: input.branchId ?? null,
    p_provider_id: input.providerId ?? null,
    p_priority: input.priority ?? 'normal',
    p_due_at: input.dueAt || null,
    p_assignee_profile_id: null,
    p_automation_rule_key: null,
    p_created_source: 'user',
  })
  if (error) throw error
  return data as string
}

export async function claimOperationalTask(task: OperationalTask) {
  const { data, error } = await db().rpc('claim_operational_task', {
    p_task_id: task.id,
    p_expected_updated_at: task.updatedAt,
  })
  if (error) throw error
  return data as string
}

export async function updateOperationalTaskState(task: OperationalTask, input: {
  status: TaskStatus
  blockedReason?: string
  priority?: TaskPriority
  dueAt?: string
}) {
  const { data, error } = await db().rpc('update_operational_task_state', {
    p_task_id: task.id,
    p_status: input.status,
    p_expected_updated_at: task.updatedAt,
    p_blocked_reason: input.blockedReason ?? '',
    p_priority: input.priority ?? null,
    p_due_at: input.dueAt ?? null,
  })
  if (error) throw error
  return data as string
}

export async function addOperationalTaskNote(taskId: string, note: string) {
  const { data, error } = await db().rpc('add_operational_task_note', {
    p_task_id: taskId,
    p_note: note.trim(),
  })
  if (error) throw error
  return data as string
}
