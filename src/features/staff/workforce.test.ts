import test from 'node:test'
import assert from 'node:assert/strict'

import { STAFF_STORAGE_KEY, saveStoredStaff } from '../auth/staffStore.ts'
import { saveProviderBranchAssignments, saveProviderScheduleBlocks, saveStoredProviders } from '../dentists/dentistStore.ts'
import { saveStoredTreatments } from '../treatments/treatmentStore.ts'
import {
  clockInStaff,
  createProviderCompensationRule,
  createProviderPayout,
  createStaffShiftPlan,
  getProviderWorkload,
  processProviderPayout,
  resetWorkforceState,
} from './workforceStore.ts'

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
  storage.removeItem(STAFF_STORAGE_KEY)
  resetWorkforceState()
  saveStoredStaff([{ id: 'staff-1', name: 'Ana Staff', email: 'ana@example.com', phone: '', position: 'Front desk', role: 'staff', status: 'active', password: 'pw', createdAt: '2026-08-18T00:00:00Z', updatedAt: '2026-08-18T00:00:00Z' }])
  saveStoredProviders([{ id: 'provider-1', displayName: 'Dr. Reyes', role: 'dentist', email: '', phone: '', specialization: '', licenseNumber: '', bio: '', photoUrl: '', status: 'active', createdAt: '2026-08-18T00:00:00Z', updatedAt: '2026-08-18T00:00:00Z' }])
  saveProviderBranchAssignments([{ id: 'assignment-1', providerId: 'provider-1', branchId: 'branch-pulilan', isPrimary: true, status: 'active', createdAt: '2026-08-18T00:00:00Z', updatedAt: '2026-08-18T00:00:00Z' }])
  saveProviderScheduleBlocks([{ id: 'schedule-1', providerId: 'provider-1', branchId: 'branch-pulilan', dayOfWeek: 2, startTime: '09:00', endTime: '17:00', status: 'active', createdAt: '2026-08-18T00:00:00Z', updatedAt: '2026-08-18T00:00:00Z' }])
})

test('clock in derives late status from planned shift', () => {
  createStaffShiftPlan({ staffId: 'staff-1', branchId: 'branch-pulilan', workDate: '2026-08-18', startTime: '09:00', endTime: '18:00', notes: '', createdBy: 'Admin' })
  const attendance = clockInStaff({ staffId: 'staff-1', branchId: 'branch-pulilan', workDate: '2026-08-18', timeIn: '09:20', recordedBy: 'Admin' })

  assert.equal(attendance.status, 'late')
  assert.equal(attendance.minutesLate, 10)
})

test('provider payout uses completed treatment value and creates payroll expense when processed', () => {
  saveStoredTreatments([
    { id: 'treatment-1', patientId: 'patient-1', branchId: 'branch-pulilan', providerId: 'provider-1', providerNameSnapshot: 'Dr. Reyes', serviceId: 'service-1', description: 'Restoration', cost: 100000, priceSnapshotCents: 500000, quantity: 2, status: 'completed', treatmentDate: '2026-08-18', notes: '', performedBy: 'Dr. Reyes', createdBy: 'Admin', createdAt: '2026-08-18T00:00:00Z', updatedAt: '2026-08-18T00:00:00Z' },
  ])
  createProviderCompensationRule({ providerId: 'provider-1', basis: 'percentage', commissionRatePercent: 10, fixedAmountCents: 0, status: 'active', notes: '', createdBy: 'Admin' })

  const workload = getProviderWorkload('provider-1', '2026-08-01', '2026-08-31', 'branch-pulilan')
  const payout = createProviderPayout({ providerId: 'provider-1', branchId: 'branch-pulilan', periodStart: '2026-08-01', periodEnd: '2026-08-31', createdBy: 'Admin' })
  const processed = processProviderPayout(payout.id, 'Admin')

  assert.equal(workload.grossTreatmentValueCents, 1000000)
  assert.equal(payout.payoutAmountCents, 100000)
  assert.equal(processed.status, 'processed')
  assert.ok(processed.expenseId)
})
