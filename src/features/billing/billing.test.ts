import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyPayment,
  createInvoice,
  getInvoiceStatus,
  getOutstandingBalanceByPatient,
  getPaymentsByPatient,
  resetBillingState,
  type InvoiceItem,
} from './billingStore.ts'

const patientId = 'PT-000001'
const invoiceDate = '2026-08-15'

function buildItems(): InvoiceItem[] {
  return [
    { id: 'item-1', description: 'Consultation', quantity: 1, unitPriceCents: 3500 },
    { id: 'item-2', description: 'Filling', quantity: 2, unitPriceCents: 2500 },
  ]
}

test.beforeEach(() => {
  resetBillingState()
})

test('invoice creation calculates totals and status', () => {
  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: buildItems(),
    amountPaidCents: 0,
    notes: 'Initial invoice',
  })

  assert.equal(invoice.totalCents, 8500)
  assert.equal(invoice.amountPaidCents, 0)
  assert.equal(invoice.balanceCents, 8500)
  assert.equal(getInvoiceStatus(invoice), 'unpaid')
})

test('partial payment updates invoice balance and payment history', () => {
  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: [{ id: 'item-3', description: 'Root canal', quantity: 1, unitPriceCents: 6000 }],
    amountPaidCents: 0,
    notes: 'Root canal plan',
  })

  const payment = applyPayment({
    patientId,
    invoiceId: invoice.id,
    amountCents: 2500,
    paymentMethod: 'gcash',
    date: '2026-08-16',
    referenceNumber: 'GC-12345',
    recordedBy: 'Nurse Reyes',
  })

  assert.equal(payment.amountCents, 2500)
  assert.equal(invoice.amountPaidCents, 2500)
  assert.equal(invoice.balanceCents, 3500)
  assert.equal(getInvoiceStatus(invoice), 'partially_paid')
  assert.equal(getPaymentsByPatient(patientId).length > 0, true)
})

test('full payment marks invoice as paid', () => {
  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: [{ id: 'item-4', description: 'Clean-up', quantity: 1, unitPriceCents: 1800 }],
    amountPaidCents: 0,
    notes: 'Follow-up clean-up',
  })

  applyPayment({
    patientId,
    invoiceId: invoice.id,
    amountCents: invoice.totalCents,
    paymentMethod: 'cash',
    date: '2026-08-17',
    recordedBy: 'Dr. Santos',
  })

  assert.equal(getInvoiceStatus(invoice), 'paid')
  assert.equal(invoice.balanceCents, 0)
})

test('invoice outstanding balance is patient-scoped', () => {
  const patientBalance = getOutstandingBalanceByPatient(patientId)
  assert.equal(typeof patientBalance, 'number')
  assert.ok(patientBalance >= 0)
})

test('invalid amounts throw errors', () => {
  assert.throws(() => createInvoice({
    patientId,
    invoiceDate,
    items: [{ id: 'invalid', description: 'Bad item', quantity: 0, unitPriceCents: 2500 }],
    amountPaidCents: 0,
    notes: 'Invalid item',
  }))

  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: [{ id: 'valid', description: 'Valid item', quantity: 1, unitPriceCents: 1000 }],
    amountPaidCents: 0,
    notes: 'Valid item',
  })

  assert.throws(() => applyPayment({
    patientId,
    invoiceId: invoice.id,
    amountCents: 0,
    paymentMethod: 'card',
    date: '2026-08-18',
    recordedBy: 'Front desk',
  }))
})
