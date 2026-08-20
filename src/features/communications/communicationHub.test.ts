import test from 'node:test'
import assert from 'node:assert/strict'

import { saveStoredPatients } from '../patients/patientStore.ts'
import { updateCommunicationPreference } from './communicationPreferencesStore.ts'
import { sendManualPatientCommunication } from './communicationService.ts'
import {
  createCommunicationDeliveryLog,
  getCommunicationOutbox,
  retryCommunicationDelivery,
  saveCommunicationDeliveryLogs,
  saveCommunicationOutbox,
  saveCommunicationSettings,
} from './communicationStore.ts'

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
  saveCommunicationDeliveryLogs([])
  saveCommunicationOutbox([])
  saveCommunicationSettings({
    smsProvider: 'semaphore',
    smsSenderName: 'PLAMENCO',
    smsConfigured: true,
    emailProvider: 'not_configured',
    emailConfigured: false,
    messengerProvider: 'meta_messenger',
    messengerConfigured: false,
    defaultChannels: ['sms', 'in_app'],
    reminderOffsetsHours: [24],
    maxRetryAttempts: 3,
    timezone: 'Asia/Manila',
    updatedAt: '2026-08-18T00:00:00Z',
    updatedBy: 'test',
  })
  saveStoredPatients([{
    id: 'patient-row-1',
    patientId: 'P-0001',
    firstName: 'Nina',
    middleName: '',
    lastName: 'Santos',
    fullName: 'Nina Santos',
    dateOfBirth: '1990-01-01',
    sex: 'female',
    phone: '09171234567',
    email: 'nina@example.com',
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
})

test('manual patient communication uses consent and central outbox', () => {
  updateCommunicationPreference('P-0001', { smsEnabled: true, preferredChannel: 'sms' }, 'Admin')

  const logs = sendManualPatientCommunication({
    patientId: 'P-0001',
    templateKey: 'appointment_confirmed',
    actor: 'Admin',
    channels: ['sms'],
    messageOverride: 'Manual confirmation',
  })

  assert.equal(logs.length, 1)
  assert.equal(logs[0].dispatchMode, 'manual')
  assert.equal(logs[0].status, 'queued')
  assert.equal(getCommunicationOutbox().length, 1)
})

test('retry creates queued provider job for failed delivery', () => {
  const failed = createCommunicationDeliveryLog({
    patientId: 'P-0001',
    channel: 'sms',
    templateKey: 'appointment_reminder',
    recipient: '+639171234567',
    message: 'Reminder',
    status: 'failed',
    provider: 'semaphore',
    failureReason: 'Provider timeout',
    idempotencyKey: 'failed-reminder-1',
  })

  const retried = retryCommunicationDelivery(failed.id, 'Admin')

  assert.equal(retried.status, 'queued')
  assert.equal(retried.attemptCount, 1)
  assert.equal(getCommunicationOutbox().length, 1)
})
