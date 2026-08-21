import { supabase } from '../../lib/supabase'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'
import type {
  Provider,
  ProviderAvailabilityOverride,
  ProviderBranchAssignment,
  ProviderFormValues,
  ProviderScheduleBlock,
} from './dentistTypes'

const PROVIDER_STORAGE_KEY = 'plamenco.providers'
const PROVIDER_BRANCH_ASSIGNMENT_STORAGE_KEY = 'plamenco.providerBranchAssignments'
const PROVIDER_SCHEDULE_STORAGE_KEY = 'plamenco.providerScheduleBlocks'
const PROVIDER_AVAILABILITY_STORAGE_KEY = 'plamenco.providerAvailabilityOverrides'

const nowIso = () => new Date().toISOString()

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function parseList<T>(value: string | null): T[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveList<T>(key: string, rows: T[]) {
  window.localStorage.setItem(key, JSON.stringify(rows))
}

function mapProviderRow(row: Record<string, any>): Provider {
  return {
    id: row.id,
    profileId: row.profile_id ?? undefined,
    displayName: row.display_name ?? '',
    role: row.role ?? 'dentist',
    email: row.email ?? '',
    phone: row.phone ?? '',
    specialization: row.specialization ?? '',
    licenseNumber: row.license_number ?? '',
    bio: row.bio ?? '',
    photoUrl: row.photo_url ?? '',
    status: row.status ?? 'active',
    createdAt: row.created_at ?? nowIso(),
    updatedAt: row.updated_at ?? row.created_at ?? nowIso(),
  }
}

function mapAssignmentRow(row: Record<string, any>): ProviderBranchAssignment {
  return {
    id: row.id,
    providerId: row.provider_id,
    branchId: row.branch_id,
    isPrimary: Boolean(row.is_primary),
    status: row.status ?? 'active',
    createdAt: row.created_at ?? nowIso(),
    updatedAt: row.updated_at ?? row.created_at ?? nowIso(),
  }
}

function mapScheduleRow(row: Record<string, any>): ProviderScheduleBlock {
  return {
    id: row.id,
    providerId: row.provider_id,
    branchId: row.branch_id,
    dayOfWeek: Number(row.day_of_week ?? 1),
    startTime: String(row.start_time ?? '09:00').slice(0, 5),
    endTime: String(row.end_time ?? '18:00').slice(0, 5),
    status: row.status ?? 'active',
    createdAt: row.created_at ?? nowIso(),
    updatedAt: row.updated_at ?? row.created_at ?? nowIso(),
  }
}

function mapOverrideRow(row: Record<string, any>): ProviderAvailabilityOverride {
  return {
    id: row.id,
    providerId: row.provider_id,
    branchId: row.branch_id ?? undefined,
    date: row.override_date,
    type: row.type ?? 'unavailable',
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : undefined,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : undefined,
    reason: row.reason ?? '',
    privateNotes: row.private_notes ?? '',
    createdAt: row.created_at ?? nowIso(),
    updatedAt: row.updated_at ?? row.created_at ?? nowIso(),
  }
}

export function getStoredProviders(): Provider[] {
  return parseList<Provider>(window.localStorage.getItem(PROVIDER_STORAGE_KEY))
}

export function saveStoredProviders(providers: Provider[]) {
  saveList(PROVIDER_STORAGE_KEY, providers)
}

export function getProviderBranchAssignments(): ProviderBranchAssignment[] {
  return parseList<ProviderBranchAssignment>(window.localStorage.getItem(PROVIDER_BRANCH_ASSIGNMENT_STORAGE_KEY))
}

export function saveProviderBranchAssignments(assignments: ProviderBranchAssignment[]) {
  saveList(PROVIDER_BRANCH_ASSIGNMENT_STORAGE_KEY, assignments)
}

export function getProviderScheduleBlocks(): ProviderScheduleBlock[] {
  return parseList<ProviderScheduleBlock>(window.localStorage.getItem(PROVIDER_SCHEDULE_STORAGE_KEY))
}

export function saveProviderScheduleBlocks(blocks: ProviderScheduleBlock[]) {
  saveList(PROVIDER_SCHEDULE_STORAGE_KEY, blocks)
}

export function getProviderAvailabilityOverrides(): ProviderAvailabilityOverride[] {
  return parseList<ProviderAvailabilityOverride>(window.localStorage.getItem(PROVIDER_AVAILABILITY_STORAGE_KEY))
}

export function saveProviderAvailabilityOverrides(overrides: ProviderAvailabilityOverride[]) {
  saveList(PROVIDER_AVAILABILITY_STORAGE_KEY, overrides)
}

export async function loadProviderFoundationFromSupabase(options: { strict?: boolean } = {}) {
  if (!supabase) {
    return {
      providers: getStoredProviders(),
      assignments: getProviderBranchAssignments(),
      schedules: getProviderScheduleBlocks(),
      overrides: getProviderAvailabilityOverrides(),
    }
  }

  const [providerResult, assignmentResult, scheduleResult, overrideResult] = await Promise.all([
    supabase.from('providers').select('*').order('display_name', { ascending: true }),
    supabase.from('provider_branch_assignments').select('*'),
    supabase.from('provider_schedule_blocks').select('*'),
    supabase.from('provider_availability_overrides').select('*'),
  ])

  const failures = [
    ['dentists', providerResult.error],
    ['provider branch assignments', assignmentResult.error],
    ['provider schedules', scheduleResult.error],
    ['provider availability overrides', overrideResult.error],
  ].filter((entry) => entry[1]) as Array<[string, { message: string }]>

  if (failures.length && options.strict) {
    throw new Error(`Unable to load ${failures[0][0]}: ${failures[0][1].message}`)
  }

  if (!providerResult.error && Array.isArray(providerResult.data)) saveStoredProviders(providerResult.data.map(mapProviderRow))
  if (!assignmentResult.error && Array.isArray(assignmentResult.data)) saveProviderBranchAssignments(assignmentResult.data.map(mapAssignmentRow))
  if (!scheduleResult.error && Array.isArray(scheduleResult.data)) saveProviderScheduleBlocks(scheduleResult.data.map(mapScheduleRow))
  if (!overrideResult.error && Array.isArray(overrideResult.data)) saveProviderAvailabilityOverrides(overrideResult.data.map(mapOverrideRow))

  return {
    providers: getStoredProviders(),
    assignments: getProviderBranchAssignments(),
    schedules: getProviderScheduleBlocks(),
    overrides: getProviderAvailabilityOverrides(),
  }
}

export function createProvider(values: ProviderFormValues, branchIds: string[]): Provider {
  const timestamp = nowIso()
  const provider: Provider = {
    id: generateUUID(),
    ...values,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  saveStoredProviders([provider, ...getStoredProviders()])
  void insertRemoteTableRow('providers', {
    id: provider.id,
    profile_id: provider.profileId || null,
    display_name: provider.displayName,
    role: provider.role,
    email: provider.email,
    phone: provider.phone,
    specialization: provider.specialization,
    license_number: provider.licenseNumber,
    bio: provider.bio,
    photo_url: provider.photoUrl,
    status: provider.status,
  })

  saveProviderAssignments(provider.id, branchIds)
  return provider
}

export function updateProvider(id: string, values: ProviderFormValues, branchIds?: string[]): Provider | null {
  const providers = getStoredProviders()
  const index = providers.findIndex((provider) => provider.id === id)
  if (index === -1) return null

  const updated: Provider = { ...providers[index], ...values, updatedAt: nowIso() }
  providers[index] = updated
  saveStoredProviders(providers)
  void updateRemoteTableRow('providers', id, {
    profile_id: updated.profileId || null,
    display_name: updated.displayName,
    role: updated.role,
    email: updated.email,
    phone: updated.phone,
    specialization: updated.specialization,
    license_number: updated.licenseNumber,
    bio: updated.bio,
    photo_url: updated.photoUrl,
    status: updated.status,
  })

  if (branchIds) saveProviderAssignments(id, branchIds)
  return updated
}

export function saveProviderAssignments(providerId: string, branchIds: string[]) {
  const existing = getProviderBranchAssignments().filter((assignment) => assignment.providerId !== providerId)
  const timestamp = nowIso()
  const nextAssignments = branchIds.map((branchId, index): ProviderBranchAssignment => ({
    id: generateUUID(),
    providerId,
    branchId,
    isPrimary: index === 0,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  }))

  saveProviderBranchAssignments([...existing, ...nextAssignments])
  nextAssignments.forEach((assignment) => {
    void insertRemoteTableRow('provider_branch_assignments', {
      id: assignment.id,
      provider_id: assignment.providerId,
      branch_id: assignment.branchId,
      is_primary: assignment.isPrimary,
      status: assignment.status,
    })
  })
}

export async function saveScheduleBlocks(providerId: string, blocks: Omit<ProviderScheduleBlock, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>[]) {
  const normalized = blocks
    .filter((block) => block.branchId && block.startTime && block.endTime && block.startTime < block.endTime)
    .map((block) => ({ ...block, status: block.status ?? 'active' as const }))
  const timestamp = nowIso()
  const previousAll = getProviderScheduleBlocks()
  const previousProviderBlocks = previousAll.filter((block) => block.providerId === providerId)
  const otherProviderBlocks = previousAll.filter((block) => block.providerId !== providerId)
  const nextBlocks = normalized.map((block): ProviderScheduleBlock => ({
    id: generateUUID(),
    providerId,
    ...block,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))

  if (!supabase) {
    saveProviderScheduleBlocks([...otherProviderBlocks, ...nextBlocks])
    return { blocks: nextBlocks, persisted: false }
  }

  const deleteResult = await supabase.from('provider_schedule_blocks').delete().eq('provider_id', providerId)
  if (deleteResult.error) throw new Error(`Unable to replace provider schedule: ${deleteResult.error.message}`)

  if (nextBlocks.length) {
    const insertResult = await supabase.from('provider_schedule_blocks').insert(nextBlocks.map((block) => ({
      id: block.id,
      provider_id: block.providerId,
      branch_id: block.branchId,
      day_of_week: block.dayOfWeek,
      start_time: block.startTime,
      end_time: block.endTime,
      status: block.status,
    })))
    if (insertResult.error) {
      if (previousProviderBlocks.length) {
        await supabase.from('provider_schedule_blocks').insert(previousProviderBlocks.map((block) => ({
          id: block.id,
          provider_id: block.providerId,
          branch_id: block.branchId,
          day_of_week: block.dayOfWeek,
          start_time: block.startTime,
          end_time: block.endTime,
          status: block.status,
        })))
      }
      throw new Error(`Unable to save provider schedule: ${insertResult.error.message}`)
    }
  }

  saveProviderScheduleBlocks([...otherProviderBlocks, ...nextBlocks])
  return { blocks: nextBlocks, persisted: true }
}

export function createAvailabilityOverride(input: Omit<ProviderAvailabilityOverride, 'id' | 'createdAt' | 'updatedAt'>) {
  const timestamp = nowIso()
  const override: ProviderAvailabilityOverride = {
    id: generateUUID(),
    ...input,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  saveProviderAvailabilityOverrides([override, ...getProviderAvailabilityOverrides()])
  void insertRemoteTableRow('provider_availability_overrides', {
    id: override.id,
    provider_id: override.providerId,
    branch_id: override.branchId || null,
    override_date: override.date,
    type: override.type,
    start_time: override.startTime || null,
    end_time: override.endTime || null,
    reason: override.reason,
    private_notes: override.privateNotes,
  })

  return override
}

export {
  PROVIDER_AVAILABILITY_STORAGE_KEY,
  PROVIDER_BRANCH_ASSIGNMENT_STORAGE_KEY,
  PROVIDER_SCHEDULE_STORAGE_KEY,
  PROVIDER_STORAGE_KEY,
}
