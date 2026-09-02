import { supabase } from '../../lib/supabase'
import type { StaffMember, UserRole } from './authTypes'

const STAFF_STORAGE_KEY = 'plamenco.staff.accounts'
const seedStaff: StaffMember[] = []

function normalizeStaffMember(member: StaffMember): StaffMember {
  const legacyRole = (member as { role?: unknown }).role
  return legacyRole === 'admin' ? { ...member, role: 'staff', position: member.position || 'Staff' } : member
}

function safeParseStaff(value: string | null): StaffMember[] | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as StaffMember[]
    return Array.isArray(parsed) ? parsed.map(normalizeStaffMember) : null
  } catch { return null }
}

export function getStoredStaff(): StaffMember[] {
  const stored = safeParseStaff(window.localStorage.getItem(STAFF_STORAGE_KEY))
  if (stored?.length) return stored
  window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(seedStaff))
  return seedStaff
}

export function saveStoredStaff(staff: StaffMember[]) { window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(staff)) }

function rolePosition(role: Exclude<UserRole, 'patient'>) {
  if (role === 'super_admin') return 'Super Admin'
  if (role === 'associate_dentist') return 'Associate Dentist'
  if (role === 'dentist') return 'Dentist'
  return 'Clinic Staff'
}

/** Team & Access is the authenticated internal-account directory. Providers remain
 * clinical profiles, but Dentist/Associate Dentist accounts are sourced from the
 * same profiles rows so they do not disappear after reload or become duplicates. */
export async function loadInternalAccountsFromProfiles(options: { strict?: boolean } = {}) {
  if (!supabase) return getStoredStaff()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, status, job_title, created_at, updated_at')
    .in('role', ['super_admin', 'staff', 'dentist', 'associate_dentist'])
    .order('full_name', { ascending: true })
  if (error) {
    if (options.strict) throw new Error(`Unable to load internal accounts: ${error.message}`)
    return getStoredStaff()
  }
  const existing = getStoredStaff()
  const byId = new Map(existing.map((member) => [member.id, member]))
  const byEmail = new Map(existing.map((member) => [member.email.toLowerCase(), member]))
  const rows = (data ?? []).map((row): StaffMember => {
    const role = row.role as Exclude<UserRole, 'patient'>
    const prior = byId.get(String(row.id)) ?? byEmail.get(String(row.email ?? '').toLowerCase())
    return {
      id: String(row.id),
      name: String(row.full_name || prior?.name || row.email || 'Internal account'),
      email: String(row.email || prior?.email || ''),
      phone: String(row.phone || prior?.phone || ''),
      position: String(row.job_title || prior?.position || rolePosition(role)),
      role,
      status: row.status === 'active' ? 'active' : 'inactive',
      password: '',
      createdAt: String(row.created_at || prior?.createdAt || new Date().toISOString()),
      updatedAt: String(row.updated_at || prior?.updatedAt || row.created_at || new Date().toISOString()),
    }
  })
  saveStoredStaff(rows)
  return rows
}

export async function updateInternalAccountProfilePersisted(staffId: string, values: { name: string; email: string; phone: string; position: string }) {
  if (!supabase) throw new Error('Clinic database is not configured.')
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      phone: values.phone.trim(),
      job_title: values.position.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', staffId)
  if (error) throw new Error(`Unable to update internal account profile: ${error.message}`)
  return loadInternalAccountsFromProfiles({ strict: true })
}

export async function updateInternalAccountStatusPersisted(staffId: string, status: StaffMember['status']) {
  if (!supabase) throw new Error('Clinic database is not configured.')
  const { error } = await supabase.rpc('set_internal_account_status', { p_profile_id: staffId, p_status: status })
  if (error) throw new Error(`Unable to update internal account status: ${error.message}`)
  return loadInternalAccountsFromProfiles({ strict: true })
}

export function deleteStaffMember(staffId: string) {
  const nextStaff = getStoredStaff().filter((member) => member.id !== staffId)
  saveStoredStaff(nextStaff)
  return nextStaff
}

export function findStaffByEmail(email: string) { return getStoredStaff().find((staff) => staff.email.toLowerCase() === email.trim().toLowerCase()) }

export { STAFF_STORAGE_KEY }
