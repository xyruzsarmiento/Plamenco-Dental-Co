import type { StaffMember } from './authTypes'

const STAFF_STORAGE_KEY = 'plamenco.staff.accounts'

const seedStaff: StaffMember[] = []

function safeParseStaff(value: string | null): StaffMember[] | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as StaffMember[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function getStoredStaff(): StaffMember[] {
  const stored = safeParseStaff(window.localStorage.getItem(STAFF_STORAGE_KEY))

  if (stored?.length) {
    return stored
  }

  window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(seedStaff))
  return seedStaff
}

export function saveStoredStaff(staff: StaffMember[]) {
  window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(staff))
}

export function deleteStaffMember(staffId: string) {
  const nextStaff = getStoredStaff().filter((member) => member.id !== staffId)
  saveStoredStaff(nextStaff)
  return nextStaff
}

export function findStaffByEmail(email: string) {
  return getStoredStaff().find((staff) => staff.email.toLowerCase() === email.trim().toLowerCase())
}

export { STAFF_STORAGE_KEY }
