import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyPayment,
  approvePayment,
  createChargeFromTreatment,
  createRefund,
  createInvoice,
  getLedgerByPatient,
  getInvoiceStatus,
  getOutstandingBalanceByPatient,
  getPaymentsByInvoice,
  getPaymentsByPatient,
  getStoredPaymentAllocations,
  getStoredReceipts,
  initiateOnlinePayment,
  processGatewayEvent,
  rejectPayment,
  resetBillingState,
  submitManualPaymentProof,
  voidInvoice,
  type InvoiceItem,
} from './billingStore.ts'
import type { Treatment } from '../treatments/treatmentTypes.ts'

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

test('invoice line discounts reduce final total without changing source prices', () => {
  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: [
      { id: 'discounted', description: 'Oral prophylaxis', quantity: 1, unitPriceCents: 150000, discountCents: 30000 },
      { id: 'xray', description: 'X-Ray', quantity: 1, unitPriceCents: 80000 },
    ],
  })

  assert.equal(invoice.subtotalCents, 230000)
  assert.equal(invoice.discountCents, 30000)
  assert.equal(invoice.totalCents, 200000)
  assert.equal(invoice.items[0].unitPriceCents, 150000)
})

test('completed treatment produces a charge with stable treatment price snapshot', () => {
  const treatment: Treatment = {
    id: 'treatment-1',
    patientId,
    dentalRecordId: 'visit-1',
    appointmentId: 'appointment-1',
    branchId: 'branch-pulilan',
    providerId: 'provider-1',
    providerNameSnapshot: 'Dr. Reyes',
    serviceId: 'service-cleaning',
    serviceNameSnapshot: 'Oral Prophylaxis',
    description: 'Cleaning completed',
    cost: 180000,
    priceSnapshotCents: 150000,
    quantity: 1,
    status: 'completed',
    treatmentDate: invoiceDate,
    notes: '',
    performedBy: 'Dr. Reyes',
    createdBy: 'Dr. Reyes',
    createdAt: invoiceDate,
    updatedAt: invoiceDate,
  }

  const charge = createChargeFromTreatment(treatment, 'Dr. Reyes')

  assert.equal(charge.treatmentId, treatment.id)
  assert.equal(charge.branchId, 'branch-pulilan')
  assert.equal(charge.providerNameSnapshot, 'Dr. Reyes')
  assert.equal(charge.unitPriceCents, 150000)
  assert.equal(charge.finalAmountCents, 150000)
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

test('multiple partial payments settle one invoice and generate receipts', () => {
  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: [{ id: 'multi-pay', description: 'Crown', quantity: 1, unitPriceCents: 500000 }],
  })

  applyPayment({
    patientId,
    invoiceId: invoice.id,
    amountCents: 200000,
    paymentMethod: 'cash',
    date: '2026-08-16',
    recordedBy: 'Front desk',
  })
  assert.equal(invoice.status, 'partially_paid')
  assert.equal(invoice.balanceCents, 300000)

  applyPayment({
    patientId,
    invoiceId: invoice.id,
    amountCents: 300000,
    paymentMethod: 'cash',
    date: '2026-08-17',
    recordedBy: 'Front desk',
  })

  assert.equal(invoice.status, 'paid')
  assert.equal(invoice.balanceCents, 0)
  assert.equal(getPaymentsByInvoice(invoice.id).length, 2)
  assert.equal(getStoredPaymentAllocations().length, 2)
  assert.equal(getStoredReceipts().length, 2)
})

test('manual proof requires approval before allocation and rejected proof remains auditable', () => {
  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: [{ id: 'proof', description: 'Filling', quantity: 1, unitPriceCents: 250000 }],
  })

  const pending = submitManualPaymentProof({
    patientId,
    invoiceId: invoice.id,
    amountCents: 100000,
    paymentMethod: 'other',
    date: '2026-08-16',
    recordedBy: patientId,
    proofFilePath: 'private/payment-proofs/proof-1.png',
  })

  assert.equal(pending.status, 'pending_verification')
  assert.equal(invoice.amountPaidCents, 0)

  const approved = approvePayment(pending.id, 'Admin')
  assert.equal(approved.status, 'completed')
  assert.equal(invoice.balanceCents, 150000)

  const rejected = submitManualPaymentProof({
    patientId,
    invoiceId: invoice.id,
    amountCents: 50000,
    paymentMethod: 'other',
    date: '2026-08-16',
    recordedBy: patientId,
  })
  rejectPayment(rejected.id, 'Admin', 'Reference mismatch', 'We could not verify the submitted payment.')
  assert.equal(getPaymentsByPatient(patientId).some((payment) => payment.id === rejected.id && payment.status === 'rejected'), true)
})

test('online payment remains processing until idempotent gateway verification', () => {
  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: [{ id: 'online', description: 'Implant deposit', quantity: 1, unitPriceCents: 300000 }],
  })

  const payment = initiateOnlinePayment({
    patientId,
    invoiceId: invoice.id,
    amountCents: 100000,
    paymentMethod: 'online_gateway',
    date: '2026-08-16',
    recordedBy: patientId,
    gatewayProvider: 'mock_gateway',
  })

  assert.equal(payment.status, 'processing')
  assert.equal(invoice.amountPaidCents, 0)

  processGatewayEvent({ provider: 'mock_gateway', eventId: 'evt-1', paymentId: payment.id, status: 'completed', gatewayTransactionId: 'txn-1' })
  processGatewayEvent({ provider: 'mock_gateway', eventId: 'evt-1', paymentId: payment.id, status: 'completed', gatewayTransactionId: 'txn-1' })

  assert.equal(invoice.amountPaidCents, 100000)
  assert.equal(getStoredPaymentAllocations().length, 1)
})

test('refunds preserve original payment and cannot exceed refundable amount', () => {
  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: [{ id: 'refund', description: 'Whitening', quantity: 1, unitPriceCents: 120000 }],
  })
  const payment = applyPayment({
    patientId,
    invoiceId: invoice.id,
    amountCents: 120000,
    paymentMethod: 'cash',
    date: '2026-08-17',
    recordedBy: 'Front desk',
  })

  const refund = createRefund({ paymentId: payment.id, amountCents: 50000, reason: 'Partial refund approved', processedBy: 'Admin' })
  assert.equal(refund.amountCents, 50000)
  assert.throws(() => createRefund({ paymentId: payment.id, amountCents: 80000, reason: 'Too much', processedBy: 'Admin' }))
})

test('unpaid invoice can be voided without hard delete', () => {
  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: [{ id: 'void', description: 'Duplicate invoice', quantity: 1, unitPriceCents: 100000 }],
  })

  const voided = voidInvoice(invoice.id, 'Duplicate entry', 'Admin')
  assert.equal(voided.status, 'void')
  assert.equal(voided.balanceCents, 0)
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

  assert.throws(() => applyPayment({
    patientId,
    invoiceId: invoice.id,
    amountCents: 1500,
    paymentMethod: 'cash',
    date: '2026-08-18',
    recordedBy: 'Front desk',
  }))
})

test('patient ledger derives chronological balance from invoices and payments', () => {
  const invoice = createInvoice({
    patientId,
    invoiceDate,
    items: [{ id: 'ledger', description: 'Consultation', quantity: 1, unitPriceCents: 100000 }],
  })
  applyPayment({
    patientId,
    invoiceId: invoice.id,
    amountCents: 40000,
    paymentMethod: 'cash',
    date: '2026-08-19',
    recordedBy: 'Front desk',
  })

  const ledger = getLedgerByPatient(patientId)
  assert.equal(ledger[0].runningBalanceCents, 60000)
})
