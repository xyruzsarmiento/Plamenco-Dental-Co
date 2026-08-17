import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canAccessPatientFiles,
  createDentalImage,
  createDocument,
  getDocumentsByPatient,
  type DocumentCategory,
} from './documentStore.ts'

import {
  createPrescription,
  getPrescriptionPrintableText,
} from '../prescriptions/prescriptionStore.ts'

test('document creation stores metadata and validates file type', () => {
  const document = createDocument({
    patientId: 'PT-000001',
    fileName: 'xray-1.png',
    fileType: 'image/png',
    category: 'xray' as DocumentCategory,
    uploadedBy: 'Dr. Santos',
    content: 'data:image/png;base64,AAAA',
  })

  assert.equal(document.fileName, 'xray-1.png')
  assert.equal(document.category, 'xray')
  assert.equal(getDocumentsByPatient('PT-000001').length > 0, true)

  assert.throws(() =>
    createDocument({
      patientId: 'PT-000001',
      fileName: 'bad.exe',
      fileType: 'application/x-msdownload',
      category: 'other',
      uploadedBy: 'Front desk',
      content: 'data:text/plain;base64,AAAA',
    })
  )
})

test('patient file access is restricted to authorized roles', () => {
  assert.equal(canAccessPatientFiles('staff'), true)
  assert.equal(canAccessPatientFiles('admin'), true)
  assert.equal(canAccessPatientFiles(undefined), false)
})

test('before and after images can be linked to a treatment', () => {
  const before = createDentalImage({
    patientId: 'PT-000001',
    treatmentId: 'treatment-1',
    kind: 'before',
    fileName: 'before.png',
    fileType: 'image/png',
    content: 'data:image/png;base64,BEFORE',
    uploadedBy: 'Dr. Santos',
  })

  const after = createDentalImage({
    patientId: 'PT-000001',
    treatmentId: 'treatment-1',
    kind: 'after',
    fileName: 'after.png',
    fileType: 'image/png',
    content: 'data:image/png;base64,AFTER',
    uploadedBy: 'Dr. Santos',
  })

  assert.equal(before.kind, 'before')
  assert.equal(after.kind, 'after')
  assert.equal(before.treatmentId, 'treatment-1')
})

test('prescriptions contain printable medication instructions', () => {
  const prescription = createPrescription({
    patientId: 'PT-000001',
    medication: 'Amoxicillin',
    dosage: '500mg',
    frequency: 'Twice daily',
    duration: '7 days',
    instructions: 'Take after meals and finish the full course.',
    prescribedBy: 'Dr. Santos',
  })

  const printable = getPrescriptionPrintableText(prescription)

  assert.ok(printable.includes('Amoxicillin'))
  assert.ok(printable.includes('500mg'))
  assert.ok(printable.includes('Take after meals and finish the full course.'))
})
