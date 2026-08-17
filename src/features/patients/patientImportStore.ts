import readXlsxFile from 'read-excel-file/browser'
import { insertRemoteTableRow } from '../../lib/supabaseSync'
import { getCurrentSessionUserName } from '../security/security'
import { recordAuditEntry } from '../security/auditLogStore'
import { createPatient, findPotentialPatientDuplicates, getPatientDisplayName, getStoredPatients } from './patientStore'
import type { PatientFormValues } from './patientTypes'

export type PatientImportField =
  | 'ignore'
  | 'patientNumber'
  | 'fullName'
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'dateOfBirth'
  | 'sex'
  | 'phone'
  | 'email'
  | 'address'
  | 'city'
  | 'province'
  | 'emergencyContact'
  | 'emergencyContactRelationship'
  | 'emergencyContactPhone'
  | 'preferredBranch'
  | 'lastVisit'
  | 'dentist'
  | 'procedure'
  | 'balance'
  | 'notes'

export type ParsedImportSheet = {
  name: string
  headers: string[]
  rows: Array<Record<string, string>>
}

export type ParsedPatientWorkbook = {
  fileName: string
  sheets: ParsedImportSheet[]
}

export type PatientImportMapping = Record<string, PatientImportField>

export type ImportRowStatus = 'ready' | 'warning' | 'duplicate' | 'error'
export type ImportRowDecision = 'import' | 'skip'

export type ValidatedImportRow = {
  rowNumber: number
  source: Record<string, string>
  values: PatientFormValues
  status: ImportRowStatus
  decision: ImportRowDecision
  messages: string[]
  duplicates: Array<{ patientId: string; name: string; signals: string[] }>
  preservedHistoricalData: Record<string, string>
}

export type PatientImportBatch = {
  id: string
  filename: string
  sheetName: string
  uploadedBy: string
  createdAt: string
  status: 'staged' | 'completed'
  totalRows: number
  importedRows: number
  skippedRows: number
  errorRows: number
}

const IMPORT_BATCH_STORAGE_KEY = 'plamenco.patientImportBatches'
const IMPORT_ROW_STORAGE_KEY = 'plamenco.patientImportRows'

const importFieldLabels: Record<PatientImportField, string> = {
  ignore: 'Ignore column',
  patientNumber: 'Patient number',
  fullName: 'Full name',
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  dateOfBirth: 'Date of birth',
  sex: 'Sex',
  phone: 'Mobile number',
  email: 'Email',
  address: 'Address',
  city: 'City/Municipality',
  province: 'Province',
  emergencyContact: 'Emergency contact',
  emergencyContactRelationship: 'Emergency relationship',
  emergencyContactPhone: 'Emergency phone',
  preferredBranch: 'Preferred branch',
  lastVisit: 'Historical last visit',
  dentist: 'Historical dentist',
  procedure: 'Historical procedure',
  balance: 'Historical balance',
  notes: 'Historical notes',
}

export const patientImportFieldOptions = Object.entries(importFieldLabels).map(([value, label]) => ({ value, label }))

function safeParseList<T>(value: string | null): T[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readAsText(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export async function parsePatientWorkbook(file: File): Promise<ParsedPatientWorkbook> {
  if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
    const matrix = parseCsvMatrix(await readAsText(file))
    return { fileName: file.name, sheets: [matrixToSheet(file.name.replace(/\.csv$/i, '') || 'CSV Import', matrix)] }
  }

  const workbook = await readXlsxFile(file)
  const sheets = workbook.map((sheet) => matrixToSheet(sheet.sheet, sheet.data)).filter((sheet) => sheet.headers.length > 0)
  return { fileName: file.name, sheets }
}

function matrixToSheet(name: string, matrix: unknown[][]): ParsedImportSheet {
  const headers = (matrix[0] ?? []).map((header, index) => normalizeCell(header) || `Column ${index + 1}`)
  const rows = matrix.slice(1).map((row) => {
    const source: Record<string, string> = {}
    headers.forEach((header, index) => {
      source[header] = normalizeCell(row[index])
    })
    return source
  })

  return { name, headers, rows }
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let row: string[] = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(current)
      current = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1
      row.push(current)
      rows.push(row)
      row = []
      current = ''
    } else {
      current += char
    }
  }

  if (current || row.length) {
    row.push(current)
    rows.push(row)
  }

  return rows.filter((candidate) => candidate.some((cell) => cell.trim()))
}

export function createSuggestedPatientMapping(headers: string[]): PatientImportMapping {
  const mapping: PatientImportMapping = {}
  headers.forEach((header) => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (normalized.includes('patient') && (normalized.includes('id') || normalized.includes('number') || normalized.includes('no'))) mapping[header] = 'patientNumber'
    else if (normalized === 'name' || normalized.includes('patientname') || normalized.includes('fullname')) mapping[header] = 'fullName'
    else if (normalized.includes('firstname') || normalized.includes('givenname')) mapping[header] = 'firstName'
    else if (normalized.includes('middlename')) mapping[header] = 'middleName'
    else if (normalized.includes('lastname') || normalized.includes('surname')) mapping[header] = 'lastName'
    else if (normalized.includes('birth') || normalized.includes('birthday') || normalized.includes('dob')) mapping[header] = 'dateOfBirth'
    else if (normalized.includes('sex') || normalized.includes('gender')) mapping[header] = 'sex'
    else if (normalized.includes('phone') || normalized.includes('mobile') || normalized.includes('contact')) mapping[header] = 'phone'
    else if (normalized.includes('email')) mapping[header] = 'email'
    else if (normalized.includes('address')) mapping[header] = 'address'
    else if (normalized.includes('city') || normalized.includes('municipality')) mapping[header] = 'city'
    else if (normalized.includes('province')) mapping[header] = 'province'
    else if (normalized.includes('emergency') && normalized.includes('relationship')) mapping[header] = 'emergencyContactRelationship'
    else if (normalized.includes('emergency') && normalized.includes('phone')) mapping[header] = 'emergencyContactPhone'
    else if (normalized.includes('emergency')) mapping[header] = 'emergencyContact'
    else if (normalized.includes('branch')) mapping[header] = 'preferredBranch'
    else if (normalized.includes('lastvisit') || normalized.includes('visit')) mapping[header] = 'lastVisit'
    else if (normalized.includes('dentist') || normalized.includes('doctor')) mapping[header] = 'dentist'
    else if (normalized.includes('procedure') || normalized.includes('treatment')) mapping[header] = 'procedure'
    else if (normalized.includes('balance') || normalized.includes('amount')) mapping[header] = 'balance'
    else if (normalized.includes('note') || normalized.includes('remarks')) mapping[header] = 'notes'
    else mapping[header] = 'ignore'
  })
  return mapping
}

function parseDate(value: string) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function normalizeSex(value: string): PatientFormValues['sex'] {
  const normalized = value.toLowerCase()
  if (normalized.startsWith('f')) return 'female'
  if (normalized.startsWith('m')) return 'male'
  if (normalized.includes('other')) return 'other'
  return 'prefer_not_to_say'
}

function getMappedValue(source: Record<string, string>, mapping: PatientImportMapping, field: PatientImportField) {
  const column = Object.keys(mapping).find((header) => mapping[header] === field)
  return column ? source[column] ?? '' : ''
}

export function validatePatientImportRows(sheet: ParsedImportSheet, mapping: PatientImportMapping): ValidatedImportRow[] {
  const existing = getStoredPatients()
  const existingNumbers = new Set(existing.map((patient) => patient.patientId.toLowerCase()))

  return sheet.rows.map((source, index) => {
    const rowNumber = index + 2
    const messages: string[] = []
    const fullName = getMappedValue(source, mapping, 'fullName')
    const firstName = getMappedValue(source, mapping, 'firstName')
    const middleName = getMappedValue(source, mapping, 'middleName')
    const lastName = getMappedValue(source, mapping, 'lastName')
    const dateOfBirth = parseDate(getMappedValue(source, mapping, 'dateOfBirth'))
    const email = getMappedValue(source, mapping, 'email').toLowerCase()
    const phone = getMappedValue(source, mapping, 'phone')
    const patientNumber = getMappedValue(source, mapping, 'patientNumber')

    if (!fullName && (!firstName || !lastName)) messages.push('Missing patient name')
    if (getMappedValue(source, mapping, 'dateOfBirth') && !dateOfBirth) messages.push('Invalid date of birth')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) messages.push('Invalid email')
    if (patientNumber && existingNumbers.has(patientNumber.toLowerCase())) messages.push('Duplicate patient number')

    const values: PatientFormValues = {
      authUserId: undefined,
      fullName,
      firstName,
      middleName,
      lastName,
      dateOfBirth,
      sex: normalizeSex(getMappedValue(source, mapping, 'sex')),
      phone,
      email,
      address: getMappedValue(source, mapping, 'address'),
      city: getMappedValue(source, mapping, 'city'),
      province: getMappedValue(source, mapping, 'province'),
      emergencyContact: getMappedValue(source, mapping, 'emergencyContact'),
      emergencyContactPhone: getMappedValue(source, mapping, 'emergencyContactPhone'),
      emergencyContactRelationship: getMappedValue(source, mapping, 'emergencyContactRelationship'),
      preferredBranchId: '',
      origin: 'historical_import',
      registrationDate: new Date().toISOString().slice(0, 10),
      status: 'active',
      allergies: '',
      medicalConditions: '',
      currentMedications: '',
      previousSurgeries: '',
      medicalNotes: '',
      administrativeNotes: getMappedValue(source, mapping, 'notes'),
      originalImportedName: fullName,
      profileImage: '',
    }

    const duplicates = findPotentialPatientDuplicates({ ...values, patientId: patientNumber }, existing)
    const duplicateSummaries = duplicates.map((duplicate) => ({
      patientId: duplicate.patient.patientId,
      name: getPatientDisplayName(duplicate.patient),
      signals: duplicate.signals,
    }))

    const preservedHistoricalData = Object.fromEntries(
      Object.entries(mapping)
        .filter(([, field]) => ['lastVisit', 'dentist', 'procedure', 'balance', 'notes', 'ignore'].includes(field))
        .map(([header]) => [header, source[header] ?? '']),
    )

    let status: ImportRowStatus = 'ready'
    if (messages.some((message) => message.includes('Missing') || message.includes('Invalid') || message.includes('Duplicate patient number'))) status = 'error'
    else if (duplicateSummaries.length > 0) status = 'duplicate'
    else if (!email || !phone || !dateOfBirth) status = 'warning'

    return {
      rowNumber,
      source,
      values,
      status,
      decision: status === 'error' || status === 'duplicate' ? 'skip' : 'import',
      messages,
      duplicates: duplicateSummaries,
      preservedHistoricalData,
    }
  })
}

export function getStoredPatientImportBatches(): PatientImportBatch[] {
  return safeParseList<PatientImportBatch>(window.localStorage.getItem(IMPORT_BATCH_STORAGE_KEY))
}

function saveStoredPatientImportBatches(batches: PatientImportBatch[]) {
  window.localStorage.setItem(IMPORT_BATCH_STORAGE_KEY, JSON.stringify(batches))
}

export function confirmPatientImport(filename: string, sheetName: string, rows: ValidatedImportRow[]) {
  const now = new Date().toISOString()
  const batch: PatientImportBatch = {
    id: `patient-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    filename,
    sheetName,
    uploadedBy: getCurrentSessionUserName(),
    createdAt: now,
    status: 'completed',
    totalRows: rows.length,
    importedRows: 0,
    skippedRows: 0,
    errorRows: rows.filter((row) => row.status === 'error').length,
  }

  const importRows = rows.map((row) => {
    if (row.decision === 'import' && row.status !== 'error') {
      createPatient({
        ...row.values,
        importBatchId: batch.id,
        importSourceRow: row.rowNumber,
      })
      batch.importedRows += 1
    } else {
      batch.skippedRows += 1
    }

    return {
      id: `${batch.id}-row-${row.rowNumber}`,
      batchId: batch.id,
      sourceRowNumber: row.rowNumber,
      status: row.status,
      decision: row.decision,
      messages: row.messages,
      duplicatePatients: row.duplicates,
      sourceData: row.source,
      preservedHistoricalData: row.preservedHistoricalData,
      createdAt: now,
    }
  })

  saveStoredPatientImportBatches([batch, ...getStoredPatientImportBatches()])
  const existingRows = safeParseList<Record<string, unknown>>(window.localStorage.getItem(IMPORT_ROW_STORAGE_KEY))
  window.localStorage.setItem(IMPORT_ROW_STORAGE_KEY, JSON.stringify([...importRows, ...existingRows]))

  void insertRemoteTableRow('patient_import_batches', {
    id: batch.id,
    filename: batch.filename,
    sheet_name: batch.sheetName,
    uploaded_by: batch.uploadedBy,
    status: batch.status,
    total_rows: batch.totalRows,
    imported_rows: batch.importedRows,
    skipped_rows: batch.skippedRows,
    error_rows: batch.errorRows,
  })

  for (const row of importRows) {
    void insertRemoteTableRow('patient_import_rows', {
      id: row.id,
      batch_id: row.batchId,
      source_row_number: row.sourceRowNumber,
      status: row.status,
      decision: row.decision,
      messages: row.messages,
      duplicate_patients: row.duplicatePatients,
      source_data: row.sourceData,
      preserved_historical_data: row.preservedHistoricalData,
    })
  }

  recordAuditEntry({
    user: batch.uploadedBy,
    action: 'patient_import_completed',
    entity: 'patient_import_batch',
    entityId: batch.id,
    metadata: {
      filename: batch.filename,
      importedRows: batch.importedRows,
      skippedRows: batch.skippedRows,
      errorRows: batch.errorRows,
    },
  })

  return batch
}
