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
    .select('id, full_name, email, phone, role, status, created_at, updated_at')
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
      position: prior?.position || rolePosition(role),
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

export function deleteStaffMember(staffId: string) {
  const nextStaff = getStoredStaff().filter((member) => member.id !== staffId)
  saveStoredStaff(nextStaff)
  return nextStaff
}

export function findStaffByEmail(email: string) { return getStoredStaff().find((staff) => staff.email.toLowerCase() === email.trim().toLowerCase()) }

export { STAFF_STORAGE_KEY }
