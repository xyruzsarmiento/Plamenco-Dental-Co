import { supabase } from '../../lib/supabase'
import { loadBranchesFromSupabase } from '../branches/branchStore'
import { loadProviderFoundationFromSupabase } from '../dentists/dentistStore'
import { loadServicesFromSupabase } from '../services/serviceStore'
import { saveOperatories, saveScheduleBlocks } from '../appointments/appointmentStore'
import { saveBookingBusyWindows } from '../appointments/bookingBusyStore'
import type { Operatory, ScheduleBlock } from '../appointments/appointmentTypes'

function requireDatabase() {
  if (!supabase) throw new Error('Clinic database is not configured. Booking availability cannot be refreshed.')
  return supabase
}

function manilaDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const base = `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`
  const date = new Date(`${base}T00:00:00+08:00`)
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

export async function hydratePatientBookingFoundation() {
  const db = requireDatabase()

  const foundationPromise = Promise.all([
    loadBranchesFromSupabase({ strict: true }),
    loadServicesFromSupabase({ strict: true }),
    loadProviderFoundationFromSupabase({ strict: true }),
  ])

  const [operatoryResult, blockResult, busyResult] = await Promise.all([
    db.from('operatories').select('*').eq('status', 'active'),
    db.from('schedule_blocks').select('*').gte('block_date', manilaDate()).lte('block_date', manilaDate(180)),
    db.rpc('get_patient_booking_busy_windows_v130', { p_start_date: manilaDate(), p_end_date: manilaDate(180) }),
    foundationPromise,
  ])

  if (operatoryResult.error) throw new Error(`Unable to load clinic operatories: ${operatoryResult.error.message}`)
  if (blockResult.error) throw new Error(`Unable to load schedule blocks: ${blockResult.error.message}`)
  if (busyResult.error) throw new Error(`Unable to load current appointment availability: ${busyResult.error.message}`)

  const operatories: Operatory[] = (operatoryResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    name: row.name ?? 'Operatory',
    branchId: String(row.branch_id ?? ''),
    status: row.status ?? 'active',
    notes: row.notes ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }))

  const blocks: ScheduleBlock[] = (blockResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    branchId: String(row.branch_id ?? ''),
    providerId: row.provider_id ? String(row.provider_id) : undefined,
    operatoryId: row.operatory_id ? String(row.operatory_id) : undefined,
    date: String(row.block_date ?? ''),
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : undefined,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : undefined,
    fullDay: Boolean(row.full_day),
    type: row.block_type ?? 'other',
    reason: row.reason ?? '',
    notes: row.notes ?? '',
    createdBy: row.created_by ?? 'Clinic',
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
  }))

  saveOperatories(operatories)
  saveScheduleBlocks(blocks)
  saveBookingBusyWindows((busyResult.data ?? []).map((row: any) => ({
    appointmentId: String(row.appointment_id ?? ''),
    branchId: String(row.branch_id ?? ''),
    providerId: row.provider_id ? String(row.provider_id) : undefined,
    operatoryId: row.operatory_id ? String(row.operatory_id) : undefined,
    date: String(row.appointment_date ?? ''),
    startTime: String(row.start_time ?? '').slice(0, 5),
    endTime: String(row.end_time ?? '').slice(0, 5),
    status: String(row.status ?? ''),
  })))

  window.dispatchEvent(new Event('plamenco:booking-foundation-hydrated'))
}
