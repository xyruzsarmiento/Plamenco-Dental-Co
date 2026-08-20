import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, DatabaseZap, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import {
  confirmPatientImport,
  analyzeImportSheet,
  createSuggestedPatientMapping,
  generatePatientImportReport,
  getDestinationFieldGuide,
  getStoredPatientImportBatches,
  parsePatientWorkbook,
  patientImportFieldOptions,
  rollbackPatientImportBatch,
  runPatientImportDryRun,
  validatePatientImportRows,
  type ImportType,
  type PatientImportMapping,
  type ParsedPatientWorkbook,
  type ValidatedImportRow,
} from '../features/patients/patientImportStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { usePermissions } from '../features/auth/permissions'

const importTypeOptions: Array<{ value: ImportType; label: string; description: string }> = [
  { value: 'patients', label: 'Patients', description: 'Active migration path for historical patient records.' },
  { value: 'appointments', label: 'Appointments', description: 'Prepared for future historical appointment files.' },
  { value: 'treatments', label: 'Treatments', description: 'Prepared for sensitive clinical history migration.' },
  { value: 'payments', label: 'Payments', description: 'Prepared for verified financial history migration.' },
  { value: 'inventory', label: 'Inventory', description: 'Prepared for branch-specific stock migration.' },
]

type PreviewFilter = 'all' | 'ready' | 'warning' | 'duplicate' | 'possible_match' | 'error' | 'skipped'

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function patientName(row: ValidatedImportRow) {
  return row.values.fullName || [row.values.firstName, row.values.middleName, row.values.lastName].filter(Boolean).join(' ') || 'Unnamed patient'
}

function rowTone(status: ValidatedImportRow['status']): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (status === 'ready' || status === 'imported' || status === 'mapped_to_existing') return 'success'
  if (status === 'error' || status === 'failed') return 'danger'
  if (status === 'duplicate' || status === 'possible_match' || status === 'warning') return 'warning'
  return 'neutral'
}

function escapeCsvValue(value: unknown) {
  const text = String(value ?? '')
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${protectedText.replaceAll('"', '""')}"`
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = rows.length ? Object.keys(rows[0]) : ['message']
  const body = [
    headers.map(escapeCsvValue).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
  ].join('\n')
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function DataImportPage() {
  const permissions = usePermissions()
  const [importType, setImportType] = useState<ImportType>('patients')
  const [workbook, setWorkbook] = useState<ParsedPatientWorkbook | null>(null)
  const [selectedSheetName, setSelectedSheetName] = useState('')
  const [mapping, setMapping] = useState<PatientImportMapping>({})
  const [rows, setRows] = useState<ValidatedImportRow[]>([])
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [rollbackReason, setRollbackReason] = useState('')
  const [batches, setBatches] = useState(() => getStoredPatientImportBatches())
  const [isParsing, setIsParsing] = useState(false)

  const selectedSheet = useMemo(
    () => workbook?.sheets.find((sheet) => sheet.name === selectedSheetName) ?? workbook?.sheets[0],
    [selectedSheetName, workbook],
  )

  const dryRun = useMemo(() => runPatientImportDryRun(rows), [rows])
  const sheetProfile = useMemo(() => selectedSheet ? analyzeImportSheet(selectedSheet, mapping) : null, [mapping, selectedSheet])
  const destinationGuide = useMemo(() => getDestinationFieldGuide(), [])
  const summary = useMemo(() => ({
    total: rows.length,
    ready: rows.filter((row) => row.status === 'ready').length,
    warning: rows.filter((row) => row.status === 'warning').length,
    duplicate: rows.filter((row) => row.status === 'duplicate').length,
    possible: rows.filter((row) => row.status === 'possible_match').length,
    error: rows.filter((row) => row.status === 'error').length,
    create: rows.filter((row) => row.decision === 'create_new').length,
    skipped: rows.filter((row) => row.decision === 'skip').length,
  }), [rows])

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesFilter = previewFilter === 'all' || (previewFilter === 'skipped' ? row.decision === 'skip' : row.status === previewFilter)
      const searchable = [patientName(row), row.values.phone, row.values.email, ...Object.values(row.source)].join(' ').toLowerCase()
      return matchesFilter && (!normalized || searchable.includes(normalized))
    })
  }, [previewFilter, query, rows])

  const existingPatientOptions = (row: ValidatedImportRow) => [
    { value: '', label: 'Select patient' },
    ...row.duplicates.map((duplicate) => ({ value: duplicate.patientId, label: `${duplicate.patientId} - ${duplicate.name}` })),
  ]

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setResult(null)
    setRows([])
    setIsParsing(true)
    try {
      const parsed = await parsePatientWorkbook(file)
      if (!parsed.sheets.length) {
        setError('No readable sheets were found in this file.')
        return
      }
      setWorkbook(parsed)
      setSelectedSheetName(parsed.sheets[0].name)
      setMapping(createSuggestedPatientMapping(parsed.sheets[0].headers))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to read this workbook.')
    } finally {
      setIsParsing(false)
    }
  }

  function selectSheet(sheetName: string) {
    const sheet = workbook?.sheets.find((candidate) => candidate.name === sheetName)
    if (!sheet) return
    setSelectedSheetName(sheet.name)
    setMapping(createSuggestedPatientMapping(sheet.headers))
    setRows([])
    setResult(null)
  }

  function validateRows() {
    if (!selectedSheet || importType !== 'patients') return
    setRows(validatePatientImportRows(selectedSheet, mapping))
    setResult(null)
  }

  function updateRow(rowNumber: number, updates: Partial<ValidatedImportRow>) {
    setRows((current) => current.map((row) => row.rowNumber === rowNumber ? { ...row, ...updates } : row))
  }

  function confirmImport() {
    if (!workbook || !selectedSheet || rows.length === 0 || !dryRun.canImport) return
    const ok = window.confirm(`You are about to import ${dryRun.createRows} new patients, match ${dryRun.matchedRows} rows to existing patients, skip ${dryRun.skippedRows} rows, and leave ${dryRun.unresolvedRows} unresolved rows. Continue?`)
    if (!ok) return
    const batch = confirmPatientImport(workbook.fileName, selectedSheet.name, rows, {
      mapping,
      sheetProfile: sheetProfile ?? undefined,
      fileSizeBytes: workbook.fileSizeBytes,
    })
    setBatches(getStoredPatientImportBatches())
    setResult(`Import batch ${batch.id} completed: ${batch.importedRows} imported, ${batch.skippedRows} skipped.`)
  }

  function downloadErrorReport() {
    const report = generatePatientImportReport(rows)
    const reportRows = report.rows
      .filter((row) => row.status === 'error' || row.status === 'duplicate' || row.status === 'possible_match' || row.decision === 'review_later')
      .map((row) => ({
        sourceRow: row.sourceRow,
        patient: row.patient,
        phone: row.phone,
        email: row.email,
        status: row.status,
        decision: row.decision,
        matchConfidence: row.matchConfidence,
        issues: row.issues,
      }))
    downloadCsv('plamenco-import-error-report.csv', reportRows.length ? reportRows : [{ message: 'No import errors or unresolved rows.' }])
  }

  function downloadResultReport() {
    downloadCsv('plamenco-import-result-report.csv', generatePatientImportReport(rows).rows)
  }

  function rollback(batchId: string) {
    if (!rollbackReason.trim()) {
      setError('Enter a rollback reason before rolling back an import batch.')
      return
    }
    const ok = window.confirm('Rollback removes patient records created by this import batch from local storage. Continue?')
    if (!ok) return
    try {
      const removed = rollbackPatientImportBatch(batchId, rollbackReason.trim())
      setBatches(getStoredPatientImportBatches())
      setResult(`Rolled back ${removed} imported patient records.`)
      setRollbackReason('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to roll back this batch.')
    }
  }

  const canImport = permissions.can('patients.import')

  return (
    <section className="page-stack">
      <div className="section-header premium-section-header">
        <div>
          <Badge tone="warning">Production migration</Badge>
          <h2>Data Import</h2>
          <p>Inspect, map, validate, dry-run, and import historical clinic records without creating patient portal accounts.</p>
        </div>
      </div>

      {!canImport && <div className="inline-alert"><AlertTriangle size={16} /><span>You need patient import permission to run migrations.</span></div>}

      <div className="analytics-grid">
        <section className="panel">
          <div className="chart-header"><div><span className="chart-kicker">1 Upload</span><h3>File and import type</h3></div><Upload size={18} /></div>
          <Select
            label="Import type"
            value={importType}
            onChange={(event) => {
              setImportType(event.target.value as ImportType)
              setRows([])
              setResult(null)
            }}
            options={importTypeOptions.map((option) => ({ value: option.value, label: option.label }))}
          />
          <p className="muted">{importTypeOptions.find((option) => option.value === importType)?.description}</p>
          <label className="import-upload-zone">
            <FileSpreadsheet size={22} />
            <strong>{workbook?.fileName ?? 'Upload workbook'}</strong>
            <span>{isParsing ? 'Reading workbook...' : 'Accepted now: .xlsx and .csv up to 10 MB'}</span>
            <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!canImport || importType !== 'patients'} onChange={(event) => void handleFile(event.target.files?.[0])} />
          </label>
          {workbook && <p className="muted">{formatFileSize(workbook.fileSizeBytes)} - {workbook.sheets.length} detected sheet{workbook.sheets.length === 1 ? '' : 's'}</p>}
        </section>

        <section className="panel">
          <div className="chart-header"><div><span className="chart-kicker">2 Inspect</span><h3>Sheet selection</h3></div><DatabaseZap size={18} /></div>
          {workbook ? (
            <Select
              label="Sheet"
              value={selectedSheet?.name ?? ''}
              onChange={(event) => selectSheet(event.target.value)}
              options={workbook.sheets.map((sheet) => ({ value: sheet.name, label: `${sheet.name} (${sheet.rows.length} rows, ${sheet.headers.length} columns)` }))}
            />
          ) : (
            <p className="muted">Upload a workbook to inspect sheets and columns.</p>
          )}
          {selectedSheet && <p className="muted">Detected columns: {selectedSheet.headers.join(', ')}</p>}
        </section>
      </div>

      <section className="panel">
        <div className="chart-header"><div><span className="chart-kicker">Destination</span><h3>Actual patient field guide</h3></div><DatabaseZap size={18} /></div>
        <div className="workspace-list">
          {destinationGuide.map((entry) => (
            <div key={entry.field} className="workspace-row">
              <div><strong>{entry.field}</strong><span>{entry.destination}</span><small>{entry.rule}</small></div>
            </div>
          ))}
        </div>
      </section>

      {selectedSheet && (
        <section className="panel">
          <div className="chart-header"><div><span className="chart-kicker">3 Map</span><h3>Column mapping</h3></div><FileSpreadsheet size={18} /></div>
          <div className="import-mapping-grid">
            {selectedSheet.headers.map((header) => (
              <div key={header} className="import-mapping-row">
                <span>{header}</span>
                <Select label="" value={mapping[header] ?? 'ignore'} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value as PatientImportMapping[string] })} options={patientImportFieldOptions} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}><Button onClick={validateRows} disabled={!canImport}>Validate and dry run</Button></div>
          {sheetProfile && (
            <div className="import-review-summary" style={{ marginTop: 12 }}>
              <div><span>Rows</span><strong>{sheetProfile.rowCount}</strong></div>
              <div><span>Columns</span><strong>{sheetProfile.columnCount}</strong></div>
              <div><span>Mapped</span><strong>{sheetProfile.mappedColumns}</strong></div>
              <div><span>Ignored</span><strong>{sheetProfile.ignoredColumns}</strong></div>
              <div><span>Empty rows</span><strong>{sheetProfile.emptyRows}</strong></div>
            </div>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">4 Validate</span><h3>Preview and row decisions</h3></div><CheckCircle2 size={18} /></div>
          <div className="import-review-summary">
            <div><span>Total</span><strong>{summary.total}</strong></div>
            <div><span>Ready</span><strong>{summary.ready}</strong></div>
            <div><span>Warnings</span><strong>{summary.warning}</strong></div>
            <div><span>Duplicates</span><strong>{summary.duplicate}</strong></div>
            <div><span>Possible</span><strong>{summary.possible}</strong></div>
            <div><span>Invalid</span><strong>{summary.error}</strong></div>
          </div>
          <div className="import-review-summary">
            <div><span>Create new</span><strong>{dryRun.createRows}</strong></div>
            <div><span>Use existing</span><strong>{dryRun.matchedRows}</strong></div>
            <div><span>Skipped</span><strong>{dryRun.skippedRows}</strong></div>
            <div><span>Unresolved</span><strong>{dryRun.unresolvedRows}</strong></div>
            <div><span>Dry run</span><strong>{dryRun.canImport ? 'Ready' : 'Blocked'}</strong></div>
          </div>
          <div className="reports-filter-grid">
            <label className="report-control"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, email, legacy value" /></label>
            <Select label="Status" value={previewFilter} onChange={(event) => setPreviewFilter(event.target.value as PreviewFilter)} options={[
              { value: 'all', label: 'All rows' },
              { value: 'ready', label: 'Ready' },
              { value: 'warning', label: 'Warnings' },
              { value: 'duplicate', label: 'Duplicates' },
              { value: 'possible_match', label: 'Possible matches' },
              { value: 'error', label: 'Invalid' },
              { value: 'skipped', label: 'Skipped' },
            ]} />
          </div>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Row</th><th>Patient</th><th>Status</th><th>Decision</th><th>Issues</th><th>Quick edit</th></tr></thead>
              <tbody>
                {filteredRows.slice(0, 100).map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td><strong>{patientName(row)}</strong><span>{row.values.phone || 'No phone'} - {row.values.email || 'No email'}</span></td>
                    <td><Badge tone={rowTone(row.status)}>{row.status.replaceAll('_', ' ')}</Badge><span>{row.matchConfidence.replaceAll('_', ' ')}</span></td>
                    <td>
                      <Select label="" value={row.decision} onChange={(event) => updateRow(row.rowNumber, { decision: event.target.value as ValidatedImportRow['decision'] })} options={[
                        { value: 'review_later', label: 'Review later' },
                        { value: 'create_new', label: 'Create new' },
                        { value: 'use_existing', label: 'Use existing' },
                        { value: 'skip', label: 'Skip row' },
                      ]} />
                      {row.decision === 'use_existing' && (
                        <Select
                          label=""
                          value={row.selectedExistingPatientId ?? ''}
                          onChange={(event) => updateRow(row.rowNumber, { selectedExistingPatientId: event.target.value })}
                          options={existingPatientOptions(row)}
                        />
                      )}
                    </td>
                    <td>{row.messages.concat(row.duplicates.map((duplicate) => `Possible duplicate: ${duplicate.patientId} ${duplicate.name}`)).join(' | ') || 'No blocking issues'}</td>
                    <td>
                      <input value={row.values.phone} onChange={(event) => updateRow(row.rowNumber, { values: { ...row.values, phone: event.target.value } })} aria-label={`Edit row ${row.rowNumber} phone`} />
                      <input value={row.values.dateOfBirth} onChange={(event) => updateRow(row.rowNumber, { values: { ...row.values, dateOfBirth: event.target.value } })} aria-label={`Edit row ${row.rowNumber} date of birth`} placeholder="YYYY-MM-DD" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={dryRun.canImport ? 'inline-success' : 'inline-alert'} role="status">
            {dryRun.canImport ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      <span>{dryRun.canImport ? `${dryRun.createRows} new rows and ${dryRun.matchedRows} matched rows ready for import reconciliation.` : `${dryRun.unresolvedRows} unresolved rows must be skipped or resolved before import.`}</span>
          </div>
          <div className="modal-actions">
            <Button variant="secondary" onClick={downloadErrorReport}>Error report CSV</Button>
            <Button variant="secondary" onClick={downloadResultReport}>Result report CSV</Button>
            <Button onClick={confirmImport} disabled={!dryRun.canImport}>Confirm import batch</Button>
          </div>
        </section>
      )}

      <section className="panel table-panel">
        <div className="chart-header"><div><span className="chart-kicker">8 Results</span><h3>Import batches and rollback</h3></div><RotateCcw size={18} /></div>
        <label className="report-control"><span>Rollback reason</span><input value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} placeholder="Required before rollback" /></label>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Batch</th><th>Status</th><th>Rows</th><th>File</th><th>Action</th></tr></thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td><strong>{batch.id}</strong><span>{batch.createdAt}</span></td>
                  <td><Badge tone={batch.status === 'completed' ? 'success' : batch.status === 'rolled_back' ? 'warning' : 'neutral'}>{batch.status.replaceAll('_', ' ')}</Badge></td>
                  <td>{batch.importedRows} imported / {batch.matchedRows ?? 0} matched / {batch.skippedRows} skipped</td>
                  <td>{batch.filename}<span>{batch.sheetName}</span></td>
                  <td><Button size="sm" variant="secondary" onClick={() => rollback(batch.id)} disabled={batch.status === 'rolled_back'}>Rollback</Button></td>
                </tr>
              ))}
              {batches.length === 0 && <tr><td colSpan={5}>No import batches have been completed yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {error && <div className="inline-alert" role="alert"><AlertTriangle size={16} /><span>{error}</span></div>}
      {result && <div className="inline-success" role="status"><CheckCircle2 size={16} /><span>{result} Current patient count: {getStoredPatients().length}</span></div>}
    </section>
  )
}
