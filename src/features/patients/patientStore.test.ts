import test from 'node:test'
import assert from 'node:assert/strict'

import { createPatient, findPatientByEmail } from './patientStore.ts'

function createStorageMock() {
  const store = new Map<string, string>()

  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    length: store.size,
  } as Storage
}

test('patient records can be looked up by email regardless of case', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: createStorageMock(),
    configurable: true,
    writable: true,
  })

  const patient = createPatient({
    firstName: 'Alicia',
    middleName: '',
    lastName: 'Green',
    dateOfBirth: '1990-04-12',
    sex: 'prefer_not_to_say',
    phone: '+63 912 345 6789',
    email: 'User@Example.com',
    address: '',
    emergencyContact: '',
    emergencyContactPhone: '',
    registrationDate: new Date().toISOString(),
    status: 'active',
    allergies: '',
    medicalConditions: '',
    currentMedications: '',
    previousSurgeries: '',
    medicalNotes: '',
  })

  assert.equal(patient.email, 'User@Example.com')
  assert.ok(findPatientByEmail('user@example.com'))
  assert.equal(findPatientByEmail('user@example.com')?.id, patient.id)
})
