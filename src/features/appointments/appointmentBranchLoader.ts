import { supabase } from '../../lib/supabase'
import { cachedQuery, queryCachePolicy } from '../../lib/queryCache'
import { getStoredAppointments, saveStoredAppointments } from './appointmentStore'
import { mapAppointmentRow } from './appointmentPersistence'
import type { Appointment } from './appointmentTypes'

type AppointmentBranchLoadOptions = {
  branchId: string | null
  isAllBranchesMode: boolean
  userId: string
  strict?: boolean
  bypassCache?: boolean
}

function localScopedAppointments(branchId: string | null, isAllBranchesMode: boolean) {
  const rows = getStoredAppointments()
  if (isAllBranchesMode || !branchId) return rows
  return rows.filter((appointment) => appointment.branchId === branchId)
}

async function fetchScopedAppointments(options: AppointmentBranchLoadOptions): Promise<Appointment[]> {
  if (!supabase) {
    if (options.strict) throw new Error('Clinic database is not configured. Unable to load appointments.')
    return localScopedAppointments(options.branchId, options.isAllBranchesMode)
  }

  let request = supabase
    .from('appointments')
    .select('*')
    .order('appointment_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (!options.isAllBranchesMode && options.branchId) {
    request = request.eq('branch_id', options.branchId)
  }

  const { data, error } = await request
  if (error) {
    if (options.strict) throw new Error('Unable to load appointments for the selected branch workspace.')
    return localScopedAppointments(options.branchId, options.isAllBranchesMode)
  }

  const appointments = (data ?? []).map((row) => mapAppointmentRow(row as Record<string, any>))
  saveStoredAppointments(appointments)
  return appointments
}

export async function loadAppointmentsForBranchScope(options: AppointmentBranchLoadOptions) {
  const branchScopeKey = options.isAllBranchesMode ? 'all-branches' : options.branchId ?? 'no-branch'

  if (options.bypassCache) {
    return fetchScopedAppointments(options)
  }

  return cachedQuery(
    `appointments-workspace:${branchScopeKey}`,
    () => fetchScopedAppointments(options),
    {
      ...queryCachePolicy.frequent,
      tags: ['appointments', 'appointments-workspace', `branch:${branchScopeKey}`],
      scope: `user:${options.userId}:branch:${branchScopeKey}`,
    },
  )
}
