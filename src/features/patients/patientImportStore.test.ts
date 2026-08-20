import test from 'node:test'
import assert from 'node:assert/strict'

import { getStoredPatients, saveStoredPatients } from './patientStore.ts'
import {
  confirmPatientImport,
  createSuggestedPatientMapping,
  runPatientImportDryRun,
  validatePatientImportRows,
  type ParsedImportSheet,
} from './patientImportStore.ts'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
}

test.beforeEach(() => {
  const storage = createMemoryStorage()
  Object.assign(globalThis, { window: { localStorage: storage }, localStorage: storage })
  saveStoredPatients([])
})

test('legacy patient number is preserved when it does not collide', () => {
  const sheet: ParsedImportSheet = {
    name: 'Patients',
    headers: ['Patient No', 'Full Name', 'Phone', 'Branch'],
    rows: [{ 'Patient No': 'LEG-001', 'Full Name': 'Nina Santos', Phone: '09171234567', Branch: 'Pulilan' }],
  }
  const mapping = createSuggestedPatientMapping(sheet.headers)
  const rows = validatePatientImportRows(sheet, mapping)
  const dryRun = runPatientImportDryRun(rows)

  assert.equal(dryRun.canImport, true)
  confirmPatientImport('legacy.xlsx', 'Patients', rows, { mapping })
  assert.equal(getStoredPatients()[0].patientId, 'LEG-001')
  assert.equal(getStoredPatients()[0].authUserId, undefined)
})

test('dry run blocks unresolved duplicate rows before confirmation', () => {
  saveStoredPatients([{
    id: 'patient-existing',
    patientId: 'LEG-001',
    firstName: 'Nina',
    middleName: '',
    lastName: 'Santos',
    fullName: 'Nina Santos',
    dateOfBirth: '',
    sex: 'female',
    phone: '+639171234567',
    email: '',
    address: '',
    emergencyContact: '',
    emergencyContactPhone: '',
    registrationDate: '2026-08-18',
    status: 'active',
    allergies: '',
    medicalConditions: '',
    currentMedications: '',
    previousSurgeries: '',
    medicalNotes: '',
    createdAt: '2026-08-18T00:00:00Z',
    updatedAt: '2026-08-18T00:00:00Z',
  }])
  const sheet: ParsedImportSheet = {
    name: 'Patients',
    headers: ['Patient No', 'Full Name', 'Phone'],
    rows: [{ 'Patient No': 'LEG-001', 'Full Name': 'Nina Santos', Phone: '09171234567' }],
  }
  const rows = validatePatientImportRows(sheet, createSuggestedPatientMapping(sheet.headers))

  assert.equal(runPatientImportDryRun(rows).canImport, false)
  assert.throws(() => confirmPatientImport('legacy.xlsx', 'Patients', rows), /Resolve/)
})
