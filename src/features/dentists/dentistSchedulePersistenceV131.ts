import { supabase } from '../../lib/supabase'
import {
  loadProviderFoundationFromSupabase,
  saveProviderAvailabilityOverrides,
  saveProviderScheduleBlocks,
} from './dentistStore'
import type { ProviderAvailabilityOverride, ProviderScheduleBlock } from './dentistTypes'

type EditableBlock = Omit<ProviderScheduleBlock, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Dentist availability cannot be saved safely.')
  return supabase
}

function mapScheduleRow(row: Record<string, any>): ProviderScheduleBlock {
  const createdAt = String(row.created_at ?? new Date().toISOString())
  return {
    id: String(row.id),
    providerId: String(row.provider_id),
    branchId: String(row.branch_id),
    dayOfWeek: Number(row.day_of_week),
    startTime: String(row.start_time ?? '').slice(0, 5),
    endTime: String(row.end_time ?? '').slice(0, 5),
    status: row.status ?? 'active',
    createdAt,
    updatedAt: String(row.updated_at ?? createdAt),
  }
}

function mapOverrideRow(row: Record<string, any>): ProviderAvailabilityOverride {
  const createdAt = String(row.created_at ?? new Date().toISOString())
  return {
    id: String(row.id),
    providerId: String(row.provider_id),
    branchId: row.branch_id ? String(row.branch_id) : undefined,
    date: String(row.override_date),
    type: row.type ?? 'unavailable',
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : undefined,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : undefined,
    reason: row.reason ?? '',
    privateNotes: row.private_notes ?? '',
    createdAt,
    updatedAt: String(row.updated_at ?? createdAt),
  }
}

export async function replaceProviderWeeklySchedulePersistedV131(providerId: string, blocks: EditableBlock[]) {
  const db = requireDatabase()
  const { data, error } = await db.rpc('replace_provider_weekly_schedule_v131', {
    p_provider_id: providerId,
    p_blocks: blocks.map((block) => ({
      branchId: block.branchId,
      dayOfWeek: block.dayOfWeek,
      startTime: block.startTime,
      endTime: block.endTime,
      status: block.status ?? 'active',
    })),
  })
  if (error) throw new Error(error.message || 'Dentist availability could not be saved.')

  const mapped = Array.isArray(data) ? data.map((row) => mapScheduleRow(row as Record<string, any>)) : []
  const foundation = await loadProviderFoundationFromSupabase({ strict: true })
  saveProviderScheduleBlocks(foundation.schedules)
  return foundation.schedules.filter((block) => block.providerId === providerId).length
    ? foundation.schedules.filter((block) => block.providerId === providerId)
    : mapped
}

export async function createProviderAvailabilityOverridePersistedV131(input: {
  providerId: string
  branchId?: string
  date: string
  type: ProviderAvailabilityOverride['type']
  startTime?: string
  endTime?: string
  reason?: string
  privateNotes?: string
}) {
  const db = requireDatabase()
  const { data, error } = await db.rpc('create_provider_availability_override_v131', {
    p_provider_id: input.providerId,
    p_branch_id: input.branchId || null,
    p_date: input.date,
    p_type: input.type,
    p_start_time: input.startTime || null,
    p_end_time: input.endTime || null,
    p_reason: input.reason?.trim() ?? '',
    p_private_notes: input.privateNotes?.trim() ?? '',
  })
  if (error || !data) throw new Error(error?.message || 'Availability exception could not be saved.')

  const created = mapOverrideRow(data as Record<string, any>)
  const foundation = await loadProviderFoundationFromSupabase({ strict: true })
  saveProviderAvailabilityOverrides(foundation.overrides)
  return foundation.overrides.find((row) => row.id === created.id) ?? created
}
