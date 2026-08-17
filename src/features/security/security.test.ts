import test from 'node:test'
import assert from 'node:assert/strict'

import { getCurrentSessionRole, getCurrentSessionUserName, requireRole } from './security.ts'
import { getStoredAuditLogs, recordAuditEntry } from './auditLogStore.ts'

test('security helpers read authenticated user data from browser storage and enforce roles', () => {
  const storage: Storage = {
    getItem: (key: string) => {
      if (key === 'plamenco.auth.user') {
        return JSON.stringify({ role: 'admin', name: 'Dr. Santos' })
      }
      return null
    },
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })

  assert.equal(getCurrentSessionRole(), 'admin')
  assert.equal(getCurrentSessionUserName(), 'Dr. Santos')
  assert.throws(() => requireRole('staff', ['admin'], 'settings update'))
})

test('audit logs capture sensitive actions for review', () => {
  const storageObject = {
    store: new Map<string, string>(),
    getItem: (key: string) => (storageObject.store.has(key) ? storageObject.store.get(key)! : null),
    setItem: (key: string, value: string) => storageObject.store.set(key, value),
    removeItem: (key: string) => storageObject.store.delete(key),
    clear: () => storageObject.store.clear(),
    key: (index: number) => Array.from(storageObject.store.keys())[index] ?? null,
    length: 0,
  }

  const storage: Storage = storageObject as Storage

  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  })

  const entry = recordAuditEntry({
    user: 'Dr. Santos',
    action: 'patient_updated',
    entity: 'patient',
    entityId: 'PT-000001',
    metadata: { source: 'staff portal' },
  })

  const logs = getStoredAuditLogs()

  assert.equal(entry.action, 'patient_updated')
  assert.equal(logs[0]?.entityId, 'PT-000001')
  assert.equal(logs[0]?.user, 'Dr. Santos')
})
