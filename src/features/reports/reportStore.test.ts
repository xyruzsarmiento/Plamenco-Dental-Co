import assert from 'node:assert/strict'
import test from 'node:test'

import { buildReportSnapshot } from './reportStore.ts'

test('buildReportSnapshot calculates revenue, patient, appointment, and service metrics correctly', () => {
  const today = new Date()
  const dayOne = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toISOString().slice(0, 10)
  const dayTwo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2).toISOString().slice(0, 10)

  const snapshot = buildReportSnapshot({
    patients: [
      {
        id: 'p1',
        patientId: 'PT-000001',
        firstName: 'A',
        middleName: '',
        lastName: 'One',
        dateOfBirth: '1990-01-01',
        sex: 'female',
        phone: '+63 912 000 0001',
        email: 'a.one@example.com',
        address: 'Quezon City',
        emergencyContact: 'Contact A',
        emergencyContactPhone: '+63 912 000 0002',
        registrationDate: dayTwo,
        status: 'active',
        allergies: 'None',
        medicalConditions: 'None',
        currentMedications: 'None',
        previousSurgeries: 'None',
        medicalNotes: 'None',
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        id: 'p2',
        patientId: 'PT-000002',
        firstName: 'B',
        middleName: '',
        lastName: 'Two',
        dateOfBirth: '1991-02-02',
        sex: 'male',
        phone: '+63 912 000 0003',
        email: 'b.two@example.com',
        address: 'Makati',
        emergencyContact: 'Contact B',
        emergencyContactPhone: '+63 912 000 0004',
        registrationDate: dayOne,
        status: 'active',
        allergies: 'None',
        medicalConditions: 'None',
        currentMedications: 'None',
        previousSurgeries: 'None',
        medicalNotes: 'None',
        createdAt: '2026-08-05T00:00:00.000Z',
        updatedAt: '2026-08-05T00:00:00.000Z',
      },
      {
        id: 'p3',
        patientId: 'PT-000003',
        firstName: 'C',
        middleName: '',
        lastName: 'Three',
        dateOfBirth: '1992-03-03',
        sex: 'other',
        phone: '+63 912 000 0005',
        email: 'c.three@example.com',
        address: 'Parañaque',
        emergencyContact: 'Contact C',
        emergencyContactPhone: '+63 912 000 0006',
        registrationDate: today.toISOString().slice(0, 10),
        status: 'active',
        allergies: 'None',
        medicalConditions: 'None',
        currentMedications: 'None',
        previousSurgeries: 'None',
        medicalNotes: 'None',
        createdAt: '2026-08-10T00:00:00.000Z',
        updatedAt: '2026-08-10T00:00:00.000Z',
      },
      {
        id: 'p4',
        patientId: 'PT-000004',
        firstName: 'D',
        middleName: '',
        lastName: 'Four',
        dateOfBirth: '1993-04-04',
        sex: 'prefer_not_to_say',
        phone: '+63 912 000 0007',
        email: 'd.four@example.com',
        address: 'Pasig',
        emergencyContact: 'Contact D',
        emergencyContactPhone: '+63 912 000 0008',
        registrationDate: today.toISOString().slice(0, 10),
        status: 'inactive',
        allergies: 'None',
        medicalConditions: 'None',
        currentMedications: 'None',
        previousSurgeries: 'None',
        medicalNotes: 'None',
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-12T00:00:00.000Z',
      },
    ],
    appointments: [
      { id: 'a1', patientId: 'p1', serviceId: 's1', date: today.toISOString().slice(0, 10), status: 'completed', startTime: '09:00', endTime: '09:30', notes: '', createdBy: 'admin', createdAt: today.toISOString(), updatedAt: today.toISOString() },
      { id: 'a2', patientId: 'p2', serviceId: 's2', date: dayOne, status: 'cancelled', startTime: '10:00', endTime: '10:45', notes: '', createdBy: 'admin', createdAt: dayOne, updatedAt: dayOne },
      { id: 'a3', patientId: 'p3', serviceId: 's1', date: dayTwo, status: 'no_show', startTime: '11:00', endTime: '11:30', notes: '', createdBy: 'admin', createdAt: dayTwo, updatedAt: dayTwo },
      { id: 'a4', patientId: 'p1', serviceId: 's3', date: today.toISOString().slice(0, 10), status: 'pending', startTime: '15:00', endTime: '16:00', notes: '', createdBy: 'admin', createdAt: today.toISOString(), updatedAt: today.toISOString() },
    ],
    invoices: [
      { id: 'i1', patientId: 'p1', invoiceDate: today.toISOString().slice(0, 10), totalCents: 3000, amountPaidCents: 3000, balanceCents: 0, status: 'paid', notes: '', createdAt: today.toISOString(), updatedAt: today.toISOString(), items: [{ id: 'it1', description: 'Consultation', quantity: 1, unitPriceCents: 3000 }], invoiceNumber: 'INV-1001' },
      { id: 'i2', patientId: 'p2', invoiceDate: dayOne, totalCents: 5000, amountPaidCents: 2000, balanceCents: 3000, status: 'partially_paid', notes: '', createdAt: dayOne, updatedAt: dayOne, items: [{ id: 'it2', description: 'Cleaning', quantity: 1, unitPriceCents: 5000 }], invoiceNumber: 'INV-1002' },
    ],
    payments: [
      { id: 'pay1', patientId: 'p1', invoiceId: 'i1', amountCents: 3000, paymentMethod: 'cash', date: today.toISOString().slice(0, 10), recordedBy: 'admin', createdAt: today.toISOString() },
      { id: 'pay2', patientId: 'p2', invoiceId: 'i2', amountCents: 2000, paymentMethod: 'gcash', date: dayOne, recordedBy: 'admin', createdAt: dayOne },
    ],
    services: [
      { id: 's1', name: 'Consultation', description: '', duration: 30, price: 3000, category: 'General', status: 'active', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
      { id: 's2', name: 'Cleaning', description: '', duration: 45, price: 5000, category: 'Preventive', status: 'active', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
      { id: 's3', name: 'Whitening', description: '', duration: 60, price: 8000, category: 'Cosmetic', status: 'active', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
    ],
  })

  assert.equal(snapshot.revenue.dailyTotal, 3000)
  assert.equal(snapshot.revenue.weeklyTotal, 5000)
  assert.equal(snapshot.revenue.monthlyTotal, 5000)
  assert.equal(snapshot.revenue.outstandingBalance, 3000)
  assert.deepEqual(snapshot.revenue.paymentMethods, [
    { method: 'cash', total: 3000 },
    { method: 'gcash', total: 2000 },
  ])
  assert.equal(snapshot.patients.total, 4)
  assert.equal(snapshot.patients.newThisMonth, 4)
  assert.equal(snapshot.patients.returning, 0)
  assert.deepEqual(snapshot.appointments.statusCounts, {
    completed: 1,
    cancelled: 1,
    no_show: 1,
    pending: 1,
  })
  assert.deepEqual(snapshot.services.topRequested, [
    { serviceId: 's1', name: 'Consultation', count: 2, revenue: 6000 },
    { serviceId: 's3', name: 'Whitening', count: 1, revenue: 8000 },
    { serviceId: 's2', name: 'Cleaning', count: 1, revenue: 5000 },
  ])
})
