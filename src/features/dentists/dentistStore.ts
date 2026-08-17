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

export async function loadProviderFoundationFromSupabase() {
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

  if (Array.isArray(providerResult.data)) saveStoredProviders(providerResult.data.map(mapProviderRow))
  if (Array.isArray(assignmentResult.data)) saveProviderBranchAssignments(assignmentResult.data.map(mapAssignmentRow))
  if (Array.isArray(scheduleResult.data)) saveProviderScheduleBlocks(scheduleResult.data.map(mapScheduleRow))
  if (Array.isArray(overrideResult.data)) saveProviderAvailabilityOverrides(overrideResult.data.map(mapOverrideRow))

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
    id: `provider-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    id: `assignment-${providerId}-${branchId}`,
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

export function saveScheduleBlocks(providerId: string, blocks: Omit<ProviderScheduleBlock, 'id' | 'providerId' | 'createdAt' | 'updatedAt'>[]) {
  const existing = getProviderScheduleBlocks().filter((block) => block.providerId !== providerId)
  const timestamp = nowIso()
  const nextBlocks = blocks.map((block, index): ProviderScheduleBlock => ({
    id: `schedule-${providerId}-${block.dayOfWeek}-${index}-${Date.now()}`,
    providerId,
    ...block,
    createdAt: timestamp,
    updatedAt: timestamp,
  }))

  saveProviderScheduleBlocks([...existing, ...nextBlocks])
  nextBlocks.forEach((block) => {
    void insertRemoteTableRow('provider_schedule_blocks', {
      id: block.id,
      provider_id: block.providerId,
      branch_id: block.branchId,
      day_of_week: block.dayOfWeek,
      start_time: block.startTime,
      end_time: block.endTime,
      status: block.status,
    })
  })
}

export function createAvailabilityOverride(input: Omit<ProviderAvailabilityOverride, 'id' | 'createdAt' | 'updatedAt'>) {
  const timestamp = nowIso()
  const override: ProviderAvailabilityOverride = {
    id: `override-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
