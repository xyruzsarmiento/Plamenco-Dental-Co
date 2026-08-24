import assert from 'node:assert/strict'
import test from 'node:test'
import { createPublicBooking, getAvailableBookingTimes } from './patientPortalStore.ts'
import { getStoredPatients, mapSupabasePatientRow } from '../patients/patientStore.ts'

function createMemoryStorage() {
  const store = new Map<string, string>()
  return {
    length: 0,
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  } as Storage
}

const memory = createMemoryStorage()
Object.defineProperty(globalThis, 'localStorage', {
  value: memory,
  configurable: true,
})
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: memory },
  configurable: true,
})

test('public booking creates a pending appointment and assigns a patient record', async () => {
  localStorage.clear()

  const appointment = await createPublicBooking({
    serviceId: 'service-2',
    date: '2026-08-30',
    startTime: '10:00',
    firstName: 'Nina',
    lastName: 'Santos',
    email: 'nina@example.com',
    phone: '+63 917 000 1111',
    notes: 'Needs a cleaning checkup.',
  })

  assert.ok(appointment.id)
  assert.equal(appointment.patientId, getStoredPatients().find((patient) => patient.email === 'nina@example.com')?.patientId)
  assert.equal(appointment.duplicate, false)
})

test('available booking times skip occupied slots', () => {
  localStorage.clear()
  const times = getAvailableBookingTimes('service-1', '2026-08-30')

  assert.ok(times.length > 0)
  assert.ok(times.includes('09:00'))
})

test('patient profile image hydrates from the patient row payload', () => {
  const row = mapSupabasePatientRow({
    id: 'patient-1',
    patient_id: 'PT-000001',
    first_name: 'Ari',
    last_name: 'Lopez',
    email: 'ari@example.com',
    profile_image: 'data:image/png;base64,abc123',
  })

  assert.equal(row.profileImage, 'data:image/png;base64,abc123')
  assert.equal(row.email, 'ari@example.com')
})
