import readXlsxFile from 'read-excel-file/browser'
import { supabase } from '../../lib/supabase'
import { insertRemoteTableRow } from '../../lib/supabaseSync'
import { getStoredAppointments } from '../appointments/appointmentStore'
import { getInvoicesByPatient } from '../billing/billingStore'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredProviders } from '../dentists/dentistStore'
import { getStoredServices } from '../services/serviceStore'
import { getCurrentSessionUserName } from '../security/security'
import { recordAuditEntry } from '../security/auditLogStore'
import { getTreatmentsByPatient } from '../treatments/treatmentStore'
import { createPatient, findPotentialPatientDuplicates, getPatientDisplayName, getStoredPatients } from './patientStore'
import { createPatientPersisted } from './patientPersistence'
import type { PatientFormValues } from './patientTypes'

export type ImportType = 'patients' | 'appointments' | 'treatments' | 'payments' | 'inventory'

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

export type ImportSheetProfile = {
  sheetName: string
  rowCount: number
  columnCount: number
  mappedColumns: number
  ignoredColumns: number
  emptyRows: number
  columns: Array<{ header: string; mappedField: PatientImportField; nonEmptyRows: number; sampleValues: string[] }>
}

export type ParsedPatientWorkbook = {
  fileName: string
  fileSizeBytes: number
  sheets: ParsedImportSheet[]
}

export type PatientImportMapping = Record<string, PatientImportField>

export type ImportRowStatus = 'ready' | 'warning' | 'duplicate' | 'possible_match' | 'mapped_to_existing' | 'imported' | 'failed' | 'skipped' | 'error'
export type ImportRowDecision = 'create_new' | 'use_existing' | 'skip' | 'review_later'
export type ImportMatchConfidence = 'exact_match' | 'likely_match' | 'possible_match' | 'no_match'

export type ValidatedImportRow = {
  rowNumber: number
  source: Record<string, string>
  values: PatientFormValues
  status: ImportRowStatus
  decision: ImportRowDecision
  matchConfidence: ImportMatchConfidence
  legacyPatientNumber?: string
  selectedExistingPatientId?: string
  messages: string[]
  duplicates: Array<{ patientId: string; name: string; signals: string[] }>
  workbookDuplicateRows: number[]
  normalizedValues: Record<string, string>
  preservedHistoricalData: Record<string, string>
}

export type PatientImportBatch = {
  id: string
  importType: ImportType
  filename: string
  sheetName: string
  uploadedBy: string
  createdAt: string
  status: 'uploaded' | 'mapped' | 'validated' | 'ready' | 'importing' | 'completed' | 'partially_completed' | 'failed' | 'rolled_back'
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  importedRows: number
  matchedRows: number
  skippedRows: number
  failedRows: number
  rollbackAt?: string
  rollbackBy?: string
  rollbackReason?: string
  mapping?: PatientImportMapping
  dryRunSummary?: ReturnType<typeof runPatientImportDryRun>
  sheetProfile?: ImportSheetProfile
  fileSizeBytes?: number
}

export type PatientImportStoredRow = {
  id: string
  batchId: string
  sourceRowNumber: number
  status: ImportRowStatus
  decision: ImportRowDecision
  matchConfidence: ImportMatchConfidence
  messages: string[]
  duplicatePatients: Array<{ patientId: string; name: string; signals: string[] }>
  workbookDuplicateRows: number[]
  selectedExistingPatientId: string
  importedPatientId: string
  importedPatientNumber: string
  sourceData: Record<string, string>
  normalizedValues: Record<string, string>
  preservedHistoricalData: Record<string, string>
  failedReason: string
  importedAt?: string
  createdAt: string
}

export type PatientImportCommitResult = {
  batch: PatientImportBatch
  rows: PatientImportStoredRow[]
  stagingErrors: string[]
}

const IMPORT_BATCH_STORAGE_KEY = 'plamenco.patientImportBatches'
const IMPORT_ROW_STORAGE_KEY = 'plamenco.patientImportRows'
const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024

function makeImportId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

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
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

export async function parsePatientWorkbook(file: File): Promise<ParsedPatientWorkbook> {
  const lowerName = file.name.toLowerCase()
  const isCsv = lowerName.endsWith('.csv') || file.type === 'text/csv'
  const isXlsx = lowerName.endsWith('.xlsx') || file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const isXls = lowerName.endsWith('.xls') || file.type === 'application/vnd.ms-excel'

  if (!isCsv && !isXlsx && !isXls) {
    throw new Error('Unsupported file type. Upload a .xlsx or .csv file.')
  }

  if (isXls && !isXlsx) {
    throw new Error('.xls files are not supported by the current spreadsheet reader. Save the workbook as .xlsx or export CSV.')
  }

  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
    throw new Error('This file is larger than 10 MB. Split the workbook into smaller migration batches before uploading.')
  }

  if (isCsv) {
    const matrix = parseCsvMatrix(await readAsText(file))
    const sheet = matrixToSheet(file.name.replace(/\.csv$/i, '') || 'CSV Import', matrix)
    return { fileName: file.name, fileSizeBytes: file.size, sheets: sheet.headers.length ? [sheet] : [] }
  }

  const workbook = await readXlsxFile(file)
  const sheets = workbook.map((sheet) => matrixToSheet(sheet.sheet, sheet.data)).filter((sheet) => sheet.headers.length > 0)
  return { fileName: file.name, fileSizeBytes: file.size, sheets }
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
    else if (normalized.includes('emergency') && normalized.includes('relationship')) mapping[header] = 'emergencyContactRelationship'
    else if (normalized.includes('emergency') && (normalized.includes('phone') || normalized.includes('mobile') || normalized.includes('contact'))) mapping[header] = 'emergencyContactPhone'
    else if (normalized.includes('emergency')) mapping[header] = 'emergencyContact'
    else if (normalized.includes('phone') || normalized.includes('mobile') || normalized.includes('contact')) mapping[header] = 'phone'
    else if (normalized.includes('email')) mapping[header] = 'email'
    else if (normalized.includes('address')) mapping[header] = 'address'
    else if (normalized.includes('city') || normalized.includes('municipality')) mapping[header] = 'city'
    else if (normalized.includes('province')) mapping[header] = 'province'
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

export function analyzeImportSheet(sheet: ParsedImportSheet, mapping: PatientImportMapping): ImportSheetProfile {
  const emptyRows = sheet.rows.filter((row) => sheet.headers.every((header) => !(row[header] ?? '').trim())).length
  const columns = sheet.headers.map((header) => {
    const values = sheet.rows.map((row) => row[header] ?? '').filter((value) => value.trim())
    return {
      header,
      mappedField: mapping[header] ?? 'ignore',
      nonEmptyRows: values.length,
      sampleValues: values.slice(0, 3),
    }
  })
  return {
    sheetName: sheet.name,
    rowCount: sheet.rows.length,
    columnCount: sheet.headers.length,
    mappedColumns: columns.filter((column) => column.mappedField !== 'ignore').length,
    ignoredColumns: columns.filter((column) => column.mappedField === 'ignore').length,
    emptyRows,
    columns,
  }
}

export function getDestinationFieldGuide() {
  return [
    { field: 'authUserId', destination: 'patients.auth_user_id', rule: 'Always blank for legacy imports. Portal accounts are linked later by a verified workflow.' },
    { field: 'patientNumber', destination: 'patients.patient_id', rule: 'Preserved only when supplied and not already used by an existing patient.' },
    { field: 'fullName / first / middle / last', destination: 'patients.full_name and name columns', rule: 'Full name is preserved and split fields are kept when mapped.' },
    { field: 'dateOfBirth', destination: 'patients.date_of_birth', rule: 'Excel serial dates normalize to YYYY-MM-DD; ambiguous slash dates require review.' },
    { field: 'phone', destination: 'patients.phone', rule: 'Philippine mobile numbers normalize to +639 format when possible.' },
    { field: 'preferredBranch', destination: 'patients.preferred_branch_id', rule: 'Requires explicit Pulilan/Plaridel branch mapping; no silent default.' },
    { field: 'legacy clinical/payment columns', destination: 'patient_import_rows.preserved_historical_data', rule: 'Preserved as staging metadata until appointment/treatment/payment migrations are explicitly reviewed.' },
  ]
}

function parseDate(value: string) {
  if (!value) return ''
  const isoDate = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (isoDate) {
    const year = Number(isoDate[1])
    const month = Number(isoDate[2])
    const day = Number(isoDate[3])
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return ''
    return parsed.toISOString().slice(0, 10)
  }
  if (/^\d+(\.\d+)?$/.test(value)) {
    const serial = Number(value)
    if (serial > 1 && serial < 100000) {
      const parsed = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)))
      return parsed.toISOString().slice(0, 10)
    }
  }
  const slashDate = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (slashDate) {
    const first = Number(slashDate[1])
    const second = Number(slashDate[2])
    const year = Number(slashDate[3].length === 2 ? `19${slashDate[3]}` : slashDate[3])
    if (first <= 12 && second <= 12) return ''
    const month = first > 12 ? second : first
    const day = first > 12 ? first : second
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return ''
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function isAmbiguousSlashDate(value: string) {
  const match = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  return Boolean(match && Number(match[1]) <= 12 && Number(match[2]) <= 12)
}

function normalizeImportedPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`
  if (/^639\d{9}$/.test(digits)) return `+${digits}`
  return value.trim()
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/^(dr|dra|doctor)\.?\s+/i, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

function mapBranchId(value: string) {
  const normalized = normalizeLookup(value)
  if (!normalized) return ''
  const branch = getStoredBranches().find((entry) => [entry.id, entry.code, entry.name, entry.city].some((candidate) => normalizeLookup(candidate ?? '') === normalized))
  return branch?.id ?? ''
}

function hasProviderMatch(value: string) {
  const normalized = normalizeLookup(value)
  if (!normalized) return true
  return getStoredProviders().some((provider) => normalizeLookup(provider.displayName).includes(normalized) || normalized.includes(normalizeLookup(provider.displayName)))
}

function hasServiceMatch(value: string) {
  const normalized = normalizeLookup(value)
  if (!normalized) return true
  return getStoredServices().some((service) => normalizeLookup(service.name) === normalized)
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

function splitImportedName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? '',
    middleName: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
    lastName: parts.length > 1 ? parts[parts.length - 1] : '',
  }
}

export function validatePatientImportRows(sheet: ParsedImportSheet, mapping: PatientImportMapping): ValidatedImportRow[] {
  const existing = getStoredPatients()
  const existingNumbers = new Set(existing.map((patient) => patient.patientId.toLowerCase()))
  const workbookKeys = new Map<string, number[]>()
  const workbookPatientNumbers = new Map<string, number[]>()

  sheet.rows.forEach((source, index) => {
    const fullName = getMappedValue(source, mapping, 'fullName')
    const firstName = getMappedValue(source, mapping, 'firstName')
    const lastName = getMappedValue(source, mapping, 'lastName')
    const phone = normalizeImportedPhone(getMappedValue(source, mapping, 'phone'))
    const email = getMappedValue(source, mapping, 'email').trim().toLowerCase()
    const patientNumber = getMappedValue(source, mapping, 'patientNumber').trim()
    const dateOfBirth = parseDate(getMappedValue(source, mapping, 'dateOfBirth'))
    const key = [email, phone, fullName || `${firstName} ${lastName}`.trim(), dateOfBirth].filter(Boolean).join('|').toLowerCase()
    if (!key) return
    workbookKeys.set(key, [...(workbookKeys.get(key) ?? []), index + 2])
    if (patientNumber) {
      const numberKey = patientNumber.toLowerCase()
      workbookPatientNumbers.set(numberKey, [...(workbookPatientNumbers.get(numberKey) ?? []), index + 2])
    }
  })

  return sheet.rows.map((source, index) => {
    const rowNumber = index + 2
    const messages: string[] = []
    const fullName = getMappedValue(source, mapping, 'fullName')
    const firstName = getMappedValue(source, mapping, 'firstName')
    const middleName = getMappedValue(source, mapping, 'middleName')
    const lastName = getMappedValue(source, mapping, 'lastName')
    const rawDateOfBirth = getMappedValue(source, mapping, 'dateOfBirth')
    const dateOfBirth = parseDate(rawDateOfBirth)
    const email = getMappedValue(source, mapping, 'email').trim().toLowerCase()
    const phone = normalizeImportedPhone(getMappedValue(source, mapping, 'phone'))
    const patientNumber = getMappedValue(source, mapping, 'patientNumber').trim()
    const preferredBranch = getMappedValue(source, mapping, 'preferredBranch')
    const historicalDentist = getMappedValue(source, mapping, 'dentist')
    const historicalProcedure = getMappedValue(source, mapping, 'procedure')
    const workbookKey = [email, phone, fullName || `${firstName} ${lastName}`.trim(), dateOfBirth].filter(Boolean).join('|').toLowerCase()
    const workbookDuplicateRows = workbookKey ? (workbookKeys.get(workbookKey) ?? []).filter((candidate) => candidate !== rowNumber) : []
    const duplicatePatientNumberRows = patientNumber ? (workbookPatientNumbers.get(patientNumber.toLowerCase()) ?? []).filter((candidate) => candidate !== rowNumber) : []
    const splitName = splitImportedName(fullName)
    const importedFirstName = firstName.trim() || splitName.firstName
    const importedMiddleName = middleName.trim() || splitName.middleName
    const importedLastName = lastName.trim() || splitName.lastName

    if (!fullName && (!firstName || !lastName)) messages.push('Missing patient name')
    if (fullName && (!importedFirstName || !importedLastName)) messages.push('Full name must include at least first and last name')
    if (rawDateOfBirth && isAmbiguousSlashDate(rawDateOfBirth)) messages.push('Ambiguous birth date. Confirm whether the source date is MM/DD/YYYY or DD/MM/YYYY before import.')
    if (getMappedValue(source, mapping, 'dateOfBirth') && !dateOfBirth) messages.push('Invalid date of birth')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) messages.push('Invalid email')
    if (patientNumber && existingNumbers.has(patientNumber.toLowerCase())) messages.push('Duplicate patient number')
    if (duplicatePatientNumberRows.length > 0) messages.push(`Duplicate patient number inside workbook: row ${duplicatePatientNumberRows.join(', ')}`)
    if (phone && !/^(\+639\d{9}|09\d{9}|9\d{9})$/.test(phone)) messages.push('Invalid or ambiguous Philippine mobile number')
    if (preferredBranch && !mapBranchId(preferredBranch)) messages.push('Unknown branch. Map this source value before importing.')
    if (historicalDentist && !hasProviderMatch(historicalDentist)) messages.push('Unknown historical dentist. Confirm provider mapping or preserve as historical text.')
    if (historicalProcedure && !hasServiceMatch(historicalProcedure)) messages.push('Unknown historical service. Preserve as historical treatment text unless mapped manually.')
    if (workbookDuplicateRows.length > 0) messages.push(`Possible duplicate inside workbook: row ${workbookDuplicateRows.join(', ')}`)

    const values: PatientFormValues = {
      authUserId: undefined,
      fullName: fullName.trim() || [importedFirstName, importedMiddleName, importedLastName].filter(Boolean).join(' '),
      firstName: importedFirstName,
      middleName: importedMiddleName,
      lastName: importedLastName,
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
      preferredBranchId: mapBranchId(preferredBranch),
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

    const exactSignals = new Set(['patient_number', 'email'])
    const hasExactMatch = duplicateSummaries.some((duplicate) => duplicate.signals.some((signal) => exactSignals.has(signal)))
    const hasLikelyMatch = duplicateSummaries.some((duplicate) => duplicate.signals.some((signal) => signal === 'phone' || signal === 'name_dob' || signal === 'full_name_dob'))
    const matchConfidence: ImportMatchConfidence = hasExactMatch ? 'exact_match' : hasLikelyMatch ? 'likely_match' : duplicateSummaries.length > 0 || workbookDuplicateRows.length > 0 ? 'possible_match' : 'no_match'

    let status: ImportRowStatus = 'ready'
    if (messages.some((message) => message.includes('Missing') || message.includes('Invalid') || message.includes('Ambiguous') || message.includes('Duplicate patient number') || message.includes('Full name must'))) status = 'error'
    else if (matchConfidence === 'exact_match' || matchConfidence === 'likely_match') status = 'duplicate'
    else if (matchConfidence === 'possible_match') status = 'possible_match'
    else if (!email || !phone || !dateOfBirth) status = 'warning'

    return {
      rowNumber,
      source,
      values,
      status,
      decision: status === 'ready' || status === 'warning' ? 'create_new' : 'review_later',
      matchConfidence,
      legacyPatientNumber: patientNumber.trim(),
      messages,
      duplicates: duplicateSummaries,
      workbookDuplicateRows,
      normalizedValues: {
        patientNumber: patientNumber.trim(),
        fullName: values.fullName ?? '',
        firstName: values.firstName,
        lastName: values.lastName,
        dateOfBirth: values.dateOfBirth,
        phone: values.phone,
        email: values.email,
        preferredBranchId: values.preferredBranchId ?? '',
      },
      preservedHistoricalData,
    }
  })
}

export function getStoredPatientImportBatches(): PatientImportBatch[] {
  return safeParseList<PatientImportBatch>(window.localStorage.getItem(IMPORT_BATCH_STORAGE_KEY))
}

export function getStoredPatientImportRows() {
  return safeParseList<Record<string, unknown>>(window.localStorage.getItem(IMPORT_ROW_STORAGE_KEY))
}

function saveStoredPatientImportBatches(batches: PatientImportBatch[]) {
  window.localStorage.setItem(IMPORT_BATCH_STORAGE_KEY, JSON.stringify(batches))
}

function buildPatientImportBatch(
  filename: string,
  sheetName: string,
  rows: ValidatedImportRow[],
  status: PatientImportBatch['status'],
  options: { mapping?: PatientImportMapping; sheetProfile?: ImportSheetProfile; fileSizeBytes?: number } = {},
): PatientImportBatch {
  return {
    id: makeImportId(),
    importType: 'patients',
    filename,
    sheetName,
    uploadedBy: getCurrentSessionUserName(),
    createdAt: new Date().toISOString(),
    status,
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'ready' || row.status === 'warning').length,
    invalidRows: rows.filter((row) => row.status === 'error').length,
    duplicateRows: rows.filter((row) => row.status === 'duplicate' || row.status === 'possible_match').length,
    importedRows: 0,
    matchedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    mapping: options.mapping,
    dryRunSummary: runPatientImportDryRun(rows),
    sheetProfile: options.sheetProfile,
    fileSizeBytes: options.fileSizeBytes,
  }
}

function batchRemoteRow(batch: PatientImportBatch, completedAt?: string | null) {
  return {
    id: batch.id,
    filename: batch.filename,
    sheet_name: batch.sheetName,
    uploaded_by: batch.uploadedBy,
    status: batch.status,
    import_type: batch.importType,
    total_rows: batch.totalRows,
    valid_rows: batch.validRows,
    invalid_rows: batch.invalidRows,
    duplicate_rows: batch.duplicateRows,
    imported_rows: batch.importedRows,
    matched_rows: batch.matchedRows,
    skipped_rows: batch.skippedRows,
    failed_rows: batch.failedRows,
    mapping: batch.mapping ?? {},
    dry_run_summary: batch.dryRunSummary ?? {},
    file_size_bytes: batch.fileSizeBytes ?? null,
    sheet_profile: batch.sheetProfile ?? {},
    completed_at: completedAt ?? null,
  }
}

function importRowRemoteRow(row: PatientImportStoredRow, sourceRows: ValidatedImportRow[]) {
  return {
    id: row.id,
    batch_id: row.batchId,
    source_row_number: row.sourceRowNumber,
    status: row.status,
    decision: row.decision,
    match_confidence: row.matchConfidence,
    messages: row.messages,
    duplicate_patients: row.duplicatePatients,
    workbook_duplicate_rows: row.workbookDuplicateRows,
    selected_existing_patient_id: row.selectedExistingPatientId,
    patient_id: row.importedPatientId || null,
    legacy_patient_number: sourceRows.find((candidate) => candidate.rowNumber === row.sourceRowNumber)?.legacyPatientNumber ?? '',
    imported_patient_number: row.importedPatientNumber,
    outcome: row.status === 'imported' ? 'created_patient' : row.status === 'mapped_to_existing' ? 'mapped_existing' : row.status === 'failed' ? 'failed' : row.status === 'skipped' ? 'skipped' : '',
    source_data: row.sourceData,
    normalized_values: row.normalizedValues,
    preserved_historical_data: row.preservedHistoricalData,
    failed_reason: row.failedReason,
    imported_at: row.importedAt ?? null,
  }
}

function remoteBatchToLocal(row: Record<string, any>): PatientImportBatch {
  return {
    id: row.id,
    importType: row.import_type ?? 'patients',
    filename: row.filename ?? '',
    sheetName: row.sheet_name ?? '',
    uploadedBy: row.uploaded_by ?? '',
    createdAt: row.created_at ?? new Date().toISOString(),
    status: row.status ?? 'completed',
    totalRows: row.total_rows ?? 0,
    validRows: row.valid_rows ?? 0,
    invalidRows: row.invalid_rows ?? row.error_rows ?? 0,
    duplicateRows: row.duplicate_rows ?? 0,
    importedRows: row.imported_rows ?? 0,
    matchedRows: row.matched_rows ?? 0,
    skippedRows: row.skipped_rows ?? 0,
    failedRows: row.failed_rows ?? 0,
    rollbackAt: row.rollback_at ?? undefined,
    rollbackBy: row.rollback_by ?? undefined,
    rollbackReason: row.rollback_reason ?? undefined,
    mapping: row.mapping ?? {},
    dryRunSummary: row.dry_run_summary ?? undefined,
    sheetProfile: row.sheet_profile ?? undefined,
    fileSizeBytes: row.file_size_bytes ?? undefined,
  }
}

export async function loadPatientImportBatchesFromSupabase(options: { strict?: boolean } = {}) {
  if (!supabase) {
    if (options.strict) throw new Error('Clinic database is not configured. Unable to load import history.')
    return getStoredPatientImportBatches()
  }

  const { data, error } = await supabase
    .from('patient_import_batches')
    .select('*')
    .eq('import_type', 'patients')
    .order('created_at', { ascending: false })

  if (error) {
    if (options.strict) throw new Error('Unable to load patient import history from the clinic database.')
    return getStoredPatientImportBatches()
  }

  const batches = (data ?? []).map((row) => remoteBatchToLocal(row as Record<string, any>))
  saveStoredPatientImportBatches(batches)
  return batches
}

function saveCompletedImportLocally(batch: PatientImportBatch, importRows: PatientImportStoredRow[]) {
  saveStoredPatientImportBatches([batch, ...getStoredPatientImportBatches().filter((entry) => entry.id !== batch.id)])
  const existingRows = safeParseList<Record<string, unknown>>(window.localStorage.getItem(IMPORT_ROW_STORAGE_KEY))
  window.localStorage.setItem(IMPORT_ROW_STORAGE_KEY, JSON.stringify([...importRows, ...existingRows]))
}

export async function confirmPatientImportPersisted(
  filename: string,
  sheetName: string,
  rows: ValidatedImportRow[],
  options: { mapping?: PatientImportMapping; sheetProfile?: ImportSheetProfile; fileSizeBytes?: number } = {},
): Promise<PatientImportCommitResult> {
  if (!supabase) throw new Error('Clinic database is not configured. Patient imports must be committed to PostgreSQL.')

  const dryRunSummary = runPatientImportDryRun(rows)
  if (!dryRunSummary.canImport) throw new Error('Resolve, skip, or review unresolved rows before confirming this import.')

  const batch = buildPatientImportBatch(filename, sheetName, rows, 'importing', options)
  const { error: batchError } = await supabase.from('patient_import_batches').insert(batchRemoteRow(batch, null))
  if (batchError) throw new Error('Unable to stage the import batch in PostgreSQL. No patient rows were imported.')

  const importRows: PatientImportStoredRow[] = []
  const now = new Date().toISOString()

  for (const row of rows) {
    let outcomeStatus: ImportRowStatus = row.status
    let importedPatientId = ''
    let importedPatientNumber = ''
    let failedReason = ''

    if (row.decision === 'create_new' && (row.status === 'ready' || row.status === 'warning')) {
      try {
        const patient = await createPatientPersisted({
          ...row.values,
          patientId: row.legacyPatientNumber,
          importBatchId: batch.id,
          importSourceRow: row.rowNumber,
        })
        importedPatientId = patient.id
        importedPatientNumber = patient.patientId
        outcomeStatus = 'imported'
        batch.importedRows += 1
      } catch (cause) {
        outcomeStatus = 'failed'
        failedReason = cause instanceof Error ? cause.message : 'Patient row could not be inserted.'
        batch.failedRows += 1
      }
    } else if (row.decision === 'use_existing' && row.selectedExistingPatientId) {
      outcomeStatus = 'mapped_to_existing'
      batch.matchedRows += 1
    } else {
      outcomeStatus = 'skipped'
      failedReason = row.decision === 'review_later' ? 'Row left for review.' : ''
      batch.skippedRows += 1
    }

    importRows.push({
      id: makeImportId(),
      batchId: batch.id,
      sourceRowNumber: row.rowNumber,
      status: outcomeStatus,
      decision: row.decision,
      matchConfidence: row.matchConfidence,
      messages: failedReason ? [...row.messages, failedReason] : row.messages,
      duplicatePatients: row.duplicates,
      workbookDuplicateRows: row.workbookDuplicateRows,
      selectedExistingPatientId: row.selectedExistingPatientId ?? '',
      importedPatientId,
      importedPatientNumber,
      sourceData: row.source,
      normalizedValues: row.normalizedValues,
      preservedHistoricalData: row.preservedHistoricalData,
      failedReason,
      importedAt: outcomeStatus === 'imported' || outcomeStatus === 'mapped_to_existing' ? now : undefined,
      createdAt: now,
    })
  }

  batch.status = batch.failedRows > 0
    ? (batch.importedRows + batch.matchedRows > 0 ? 'partially_completed' : 'failed')
    : 'completed'

  const stagingErrors: string[] = []
  for (let index = 0; index < importRows.length; index += 100) {
    const chunk = importRows.slice(index, index + 100).map((row) => importRowRemoteRow(row, rows))
    const { error } = await supabase.from('patient_import_rows').insert(chunk)
    if (error) stagingErrors.push(`Rows ${index + 1}-${index + chunk.length}: ${error.message}`)
  }

  const completedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('patient_import_batches')
    .update(batchRemoteRow(batch, completedAt))
    .eq('id', batch.id)

  if (updateError) stagingErrors.push(`Batch summary update: ${updateError.message}`)

  saveCompletedImportLocally(batch, importRows)

  recordAuditEntry({
    user: batch.uploadedBy,
    action: 'patient_import_completed',
    entity: 'patient_import_batch',
    entityId: batch.id,
    metadata: {
      filename: batch.filename,
      importedRows: batch.importedRows,
      matchedRows: batch.matchedRows,
      skippedRows: batch.skippedRows,
      failedRows: batch.failedRows,
      invalidRows: batch.invalidRows,
      duplicateRows: batch.duplicateRows,
      stagingErrors: stagingErrors.join(' | '),
    },
  })

  return { batch, rows: importRows, stagingErrors }
}

export function confirmPatientImport(filename: string, sheetName: string, rows: ValidatedImportRow[], options: { mapping?: PatientImportMapping; sheetProfile?: ImportSheetProfile; fileSizeBytes?: number } = {}) {
  const dryRunSummary = runPatientImportDryRun(rows)
  if (!dryRunSummary.canImport) throw new Error('Resolve, skip, or review unresolved rows before confirming this import.')

  const now = new Date().toISOString()
  const batch: PatientImportBatch = {
    id: makeImportId(),
    importType: 'patients',
    filename,
    sheetName,
    uploadedBy: getCurrentSessionUserName(),
    createdAt: now,
    status: 'completed',
    totalRows: rows.length,
    validRows: rows.filter((row) => row.status === 'ready' || row.status === 'warning').length,
    invalidRows: rows.filter((row) => row.status === 'error').length,
    duplicateRows: rows.filter((row) => row.status === 'duplicate' || row.status === 'possible_match').length,
    importedRows: 0,
    matchedRows: 0,
    skippedRows: 0,
    failedRows: 0,
    mapping: options.mapping,
    dryRunSummary,
    sheetProfile: options.sheetProfile,
    fileSizeBytes: options.fileSizeBytes,
  }

  const importRows = rows.map((row) => {
    let outcomeStatus: ImportRowStatus = row.status
    let importedPatientId = ''
    let importedPatientNumber = ''
    let failedReason = ''
    if (row.decision === 'create_new' && (row.status === 'ready' || row.status === 'warning')) {
      const patient = createPatient({
        ...row.values,
        patientId: row.legacyPatientNumber,
        importBatchId: batch.id,
        importSourceRow: row.rowNumber,
      })
      importedPatientId = patient.id
      importedPatientNumber = patient.patientId
      outcomeStatus = 'imported'
      batch.importedRows += 1
    } else if (row.decision === 'use_existing' && row.selectedExistingPatientId) {
      outcomeStatus = 'mapped_to_existing'
      batch.matchedRows += 1
    } else {
      outcomeStatus = 'skipped'
      failedReason = row.decision === 'review_later' ? 'Row left for review.' : ''
      batch.skippedRows += 1
    }

    return {
      id: makeImportId(),
      batchId: batch.id,
      sourceRowNumber: row.rowNumber,
      status: outcomeStatus,
      decision: row.decision,
      matchConfidence: row.matchConfidence,
      messages: row.messages,
      duplicatePatients: row.duplicates,
      workbookDuplicateRows: row.workbookDuplicateRows,
      selectedExistingPatientId: row.selectedExistingPatientId ?? '',
      importedPatientId,
      importedPatientNumber,
      sourceData: row.source,
      normalizedValues: row.normalizedValues,
      preservedHistoricalData: row.preservedHistoricalData,
      failedReason,
      importedAt: outcomeStatus === 'imported' || outcomeStatus === 'mapped_to_existing' ? now : undefined,
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
    import_type: batch.importType,
    total_rows: batch.totalRows,
    valid_rows: batch.validRows,
    invalid_rows: batch.invalidRows,
    duplicate_rows: batch.duplicateRows,
    imported_rows: batch.importedRows,
    matched_rows: batch.matchedRows,
    skipped_rows: batch.skippedRows,
    failed_rows: batch.failedRows,
    mapping: batch.mapping ?? {},
    dry_run_summary: batch.dryRunSummary ?? {},
    file_size_bytes: batch.fileSizeBytes ?? null,
    sheet_profile: batch.sheetProfile ?? {},
    completed_at: now,
  })

  for (const row of importRows) {
    void insertRemoteTableRow('patient_import_rows', {
      id: row.id,
      batch_id: row.batchId,
      source_row_number: row.sourceRowNumber,
      status: row.status,
      decision: row.decision,
      match_confidence: row.matchConfidence,
      messages: row.messages,
      duplicate_patients: row.duplicatePatients,
      workbook_duplicate_rows: row.workbookDuplicateRows,
      selected_existing_patient_id: row.selectedExistingPatientId,
      patient_id: row.importedPatientId,
      legacy_patient_number: rows.find((candidate) => candidate.rowNumber === row.sourceRowNumber)?.legacyPatientNumber ?? '',
      imported_patient_number: row.importedPatientNumber,
      outcome: row.status === 'imported' ? 'created_patient' : row.status === 'mapped_to_existing' ? 'mapped_existing' : row.status === 'skipped' ? 'skipped' : '',
      source_data: row.sourceData,
      normalized_values: row.normalizedValues,
      preserved_historical_data: row.preservedHistoricalData,
      failed_reason: row.failedReason,
      imported_at: row.importedAt ?? null,
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
      matchedRows: batch.matchedRows,
      skippedRows: batch.skippedRows,
      invalidRows: batch.invalidRows,
      duplicateRows: batch.duplicateRows,
    },
  })

  return batch
}

export function runPatientImportDryRun(rows: ValidatedImportRow[]) {
  const createRows = rows.filter((row) => row.decision === 'create_new')
  const matchedRows = rows.filter((row) => row.decision === 'use_existing' && row.selectedExistingPatientId)
  const unresolvedRows = rows.filter((row) =>
    row.decision === 'review_later'
    || (row.decision === 'create_new' && row.status !== 'ready' && row.status !== 'warning')
    || (row.decision === 'use_existing' && !row.selectedExistingPatientId)
  )
  const skippedRows = rows.filter((row) => row.decision === 'skip')
  return {
    canImport: createRows.length + matchedRows.length > 0 && unresolvedRows.length === 0,
    createRows: createRows.length,
    matchedRows: matchedRows.length,
    skippedRows: skippedRows.length,
    unresolvedRows: unresolvedRows.length,
    warnings: rows.filter((row) => row.status === 'warning').length,
    errors: rows.flatMap((row) => row.status === 'error' ? row.messages.map((message) => `Row ${row.rowNumber}: ${message}`) : []),
  }
}

export function generatePatientImportReport(rows: ValidatedImportRow[]) {
  const dryRun = runPatientImportDryRun(rows)
  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    counts: {
      total: rows.length,
      ready: rows.filter((row) => row.status === 'ready').length,
      warning: rows.filter((row) => row.status === 'warning').length,
      duplicate: rows.filter((row) => row.status === 'duplicate').length,
      possibleMatch: rows.filter((row) => row.status === 'possible_match').length,
      error: rows.filter((row) => row.status === 'error').length,
      createNew: rows.filter((row) => row.decision === 'create_new').length,
      useExisting: rows.filter((row) => row.decision === 'use_existing').length,
      skip: rows.filter((row) => row.decision === 'skip').length,
      reviewLater: rows.filter((row) => row.decision === 'review_later').length,
    },
    rows: rows.map((row) => ({
      sourceRow: row.rowNumber,
      patient: row.values.fullName || [row.values.firstName, row.values.middleName, row.values.lastName].filter(Boolean).join(' '),
      legacyPatientNumber: row.legacyPatientNumber ?? '',
      phone: row.values.phone,
      email: row.values.email,
      status: row.status,
      decision: row.decision,
      matchConfidence: row.matchConfidence,
      selectedExistingPatientId: row.selectedExistingPatientId ?? '',
      workbookDuplicateRows: row.workbookDuplicateRows.join(', '),
      issues: row.messages.concat(row.duplicates.map((duplicate) => `Possible duplicate: ${duplicate.patientId} ${duplicate.name}`)).join(' | '),
      preservedHistoricalData: JSON.stringify(row.preservedHistoricalData),
    })),
  }
}

export function rollbackPatientImportBatch(batchId: string, reason: string, actor = getCurrentSessionUserName()) {
  const patients = getStoredPatients()
  const importedPatients = patients.filter((patient) => patient.importBatchId === batchId)
  if (importedPatients.length === 0) throw new Error('No imported patient records were found for this batch.')

  const blocked = importedPatients.filter((patient) =>
    getStoredAppointments().some((appointment) => appointment.patientId === patient.patientId || appointment.patientId === patient.id)
    || getTreatmentsByPatient(patient.patientId).length > 0
    || getInvoicesByPatient(patient.patientId).length > 0
  )
  if (blocked.length > 0) {
    throw new Error(`Cannot automatically rollback this batch because ${blocked.length} imported patient record(s) now have appointments, treatments, or billing activity.`)
  }

  const nextPatients = patients.filter((patient) => patient.importBatchId !== batchId)
  window.localStorage.setItem('plamenco.patients', JSON.stringify(nextPatients))

  const batches = getStoredPatientImportBatches()
  saveStoredPatientImportBatches(batches.map((batch) => batch.id === batchId ? {
    ...batch,
    status: 'rolled_back',
    rollbackAt: new Date().toISOString(),
    rollbackBy: actor,
    rollbackReason: reason,
  } : batch))

  recordAuditEntry({
    user: actor,
    action: 'patient_import_rolled_back',
    entity: 'patient_import_batch',
    entityId: batchId,
    metadata: { rollback: true, removedRows: importedPatients.length, reason },
  })

  return importedPatients.length
}
