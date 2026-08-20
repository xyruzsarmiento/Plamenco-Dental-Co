import { useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DatabaseZap,
  FileSpreadsheet,
  History,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import {
  analyzeImportSheet,
  confirmPatientImport,
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
import { usePermissions } from '../features/auth/permissions'

const importTypeOptions: Array<{ value: ImportType; label: string; description: string; available: boolean }> = [
  { value: 'patients', label: 'Patients', description: 'Historical patient records with duplicate review and portal-safe account handling.', available: true },
  { value: 'appointments', label: 'Appointments', description: 'Historical appointment migration path is not enabled yet.', available: false },
  { value: 'treatments', label: 'Treatments', description: 'Clinical treatment migration path is not enabled yet.', available: false },
  { value: 'payments', label: 'Payments', description: 'Financial history migration path is not enabled yet.', available: false },
  { value: 'inventory', label: 'Inventory', description: 'Inventory migration path is not enabled yet.', available: false },
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

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function escapeCsvValue(value: unknown) {
  const text = String(value ?? '')
  const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${protectedText.replaceAll('"', '""')}"`
}

function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = rows.length ? Object.keys(rows[0]) : ['message']
  const body = [headers.map(escapeCsvValue).join(','), ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(','))].join('\n')
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function DataImportPageV21() {
  const permissions = usePermissions()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [importType, setImportType] = useState<ImportType>('patients')
  const [workbook, setWorkbook] = useState<ParsedPatientWorkbook | null>(null)
  const [selectedSheetName, setSelectedSheetName] = useState('')
  const [mapping, setMapping] = useState<PatientImportMapping>({})
  const [rows, setRows] = useState<ValidatedImportRow[]>([])
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all')
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [batches, setBatches] = useState(() => getStoredPatientImportBatches())
  const [isParsing, setIsParsing] = useState(false)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [rollbackBatchId, setRollbackBatchId] = useState<string | null>(null)
  const [rollbackReason, setRollbackReason] = useState('')

  const canImport = permissions.can('patients.import')
  const selectedSheet = useMemo(() => workbook?.sheets.find((sheet) => sheet.name === selectedSheetName) ?? workbook?.sheets[0], [selectedSheetName, workbook])
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

  const currentStep = rows.length ? 4 : selectedSheet ? 3 : workbook ? 2 : 1

  async function handleFile(file?: File) {
    if (!file) return
    setError(null)
    setResult(null)
    setRows([])
    setIsParsing(true)
    try {
      const parsed = await parsePatientWorkbook(file)
      if (!parsed.sheets.length) throw new Error('No readable sheets were found in this file.')
      setWorkbook(parsed)
      setSelectedSheetName(parsed.sheets[0].name)
      setMapping(createSuggestedPatientMapping(parsed.sheets[0].headers))
    } catch (cause) {
      setWorkbook(null)
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
    setError(null)
  }

  function updateRow(rowNumber: number, updates: Partial<ValidatedImportRow>) {
    setRows((current) => current.map((row) => row.rowNumber === rowNumber ? { ...row, ...updates } : row))
  }

  function performImport() {
    if (!workbook || !selectedSheet || rows.length === 0 || !dryRun.canImport) return
    try {
      const batch = confirmPatientImport(workbook.fileName, selectedSheet.name, rows, { mapping, sheetProfile: sheetProfile ?? undefined, fileSizeBytes: workbook.fileSizeBytes })
      setBatches(getStoredPatientImportBatches())
      setResult(`Import batch ${batch.id} completed: ${batch.importedRows} imported, ${batch.skippedRows} skipped.`)
      setShowImportConfirm(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The import could not be completed.')
      setShowImportConfirm(false)
    }
  }

  function performRollback() {
    if (!rollbackBatchId || !rollbackReason.trim()) return
    try {
      const removed = rollbackPatientImportBatch(rollbackBatchId, rollbackReason.trim())
      setBatches(getStoredPatientImportBatches())
      setResult(`Rolled back ${removed} imported patient records.`)
      setRollbackBatchId(null)
      setRollbackReason('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to roll back this batch.')
    }
  }

  function downloadErrorReport() {
    const reportRows = generatePatientImportReport(rows).rows.filter((row) => row.status === 'error' || row.status === 'duplicate' || row.status === 'possible_match' || row.decision === 'review_later')
    downloadCsv('plamenco-import-error-report.csv', reportRows.length ? reportRows : [{ message: 'No import errors or unresolved rows.' }])
  }

  function downloadResultReport() {
    downloadCsv('plamenco-import-result-report.csv', generatePatientImportReport(rows).rows)
  }

  return (
    <section className="data-import-v21">
      <header className="data-import-v21-hero">
        <div>
          <span className="data-import-v21-kicker">Controlled migration workspace</span>
          <h2>Data Import</h2>
          <p>Upload, map, validate and review historical clinic records before committing them to the patient registry.</p>
        </div>
        <div className="data-import-v21-safety"><ShieldCheck size={18}/><div><strong>Portal-safe migration</strong><span>Legacy imports do not create patient login accounts.</span></div></div>
      </header>

      {!canImport && <div className="data-import-v21-alert error"><AlertTriangle size={17}/><span>You need patient import permission to run migrations.</span></div>}
      {error && <div className="data-import-v21-alert error"><AlertTriangle size={17}/><span>{error}</span></div>}
      {result && <div className="data-import-v21-alert success"><CheckCircle2 size={17}/><span>{result}</span></div>}

      <nav className="data-import-v21-stepper" aria-label="Import progress">
        {[['1','Upload'],['2','Inspect'],['3','Map'],['4','Validate'],['5','Commit']].map(([number,label],index) => <div key={number} className={currentStep >= index + 1 ? 'active' : ''}><b>{number}</b><span>{label}</span>{index < 4 && <i/>}</div>)}
      </nav>

      <div className="data-import-v21-grid">
        <section className="data-import-v21-card upload-card">
          <header><div><span>Step 1</span><h3>Choose migration source</h3></div><Upload size={18}/></header>
          <label className="data-import-v21-label">Import type<select value={importType} onChange={(event) => { setImportType(event.target.value as ImportType); setRows([]); setResult(null) }}>{importTypeOptions.map((option) => <option key={option.value} value={option.value} disabled={!option.available}>{option.label}{!option.available ? ' — coming later' : ''}</option>)}</select></label>
          <p className="data-import-v21-muted">{importTypeOptions.find((option) => option.value === importType)?.description}</p>
          <button type="button" className="data-import-v21-dropzone" disabled={!canImport || importType !== 'patients' || isParsing} onClick={() => inputRef.current?.click()}>
            <span className="data-import-v21-file-icon"><FileSpreadsheet size={24}/></span>
            <strong>{workbook?.fileName ?? (isParsing ? 'Reading workbook…' : 'Upload workbook')}</strong>
            <span>.xlsx or .csv · maximum 10 MB</span>
            {workbook && <small>{formatFileSize(workbook.fileSizeBytes)} · {workbook.sheets.length} sheet{workbook.sheets.length === 1 ? '' : 's'}</small>}
          </button>
          <input ref={inputRef} className="data-import-v21-hidden-input" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void handleFile(event.target.files?.[0])}/>
        </section>

        <section className="data-import-v21-card inspect-card">
          <header><div><span>Step 2</span><h3>Inspect workbook</h3></div><DatabaseZap size={18}/></header>
          {!workbook ? <div className="data-import-v21-empty"><DatabaseZap size={26}/><strong>Waiting for a workbook</strong><span>Upload a supported file to inspect its sheets and columns.</span></div> : <>
            <label className="data-import-v21-label">Sheet<select value={selectedSheet?.name ?? ''} onChange={(event) => selectSheet(event.target.value)}>{workbook.sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}</select></label>
            {sheetProfile && <div className="data-import-v21-mini-stats"><div><span>Rows</span><strong>{sheetProfile.rowCount}</strong></div><div><span>Columns</span><strong>{sheetProfile.columnCount}</strong></div><div><span>Mapped</span><strong>{sheetProfile.mappedColumns}</strong></div><div><span>Ignored</span><strong>{sheetProfile.ignoredColumns}</strong></div></div>}
            <div className="data-import-v21-column-list">{selectedSheet?.headers.slice(0,8).map((header) => <span key={header}>{header}</span>)}{(selectedSheet?.headers.length ?? 0) > 8 && <span>+{(selectedSheet?.headers.length ?? 0)-8} more</span>}</div>
          </>}
        </section>
      </div>

      {selectedSheet && <section className="data-import-v21-card mapping-card">
        <header><div><span>Step 3</span><h3>Map source columns</h3><p>Review the suggested mapping before validating rows.</p></div><FileSpreadsheet size={18}/></header>
        <div className="data-import-v21-mapping-grid">{selectedSheet.headers.map((header) => <div key={header} className="data-import-v21-map-row"><div><strong>{header}</strong><small>{sheetProfile?.columns.find((column) => column.header === header)?.sampleValues.join(' · ') || 'No sample value'}</small></div><ArrowRight size={15}/><select value={mapping[header] ?? 'ignore'} onChange={(event) => setMapping({ ...mapping, [header]: event.target.value as PatientImportMapping[string] })}>{patientImportFieldOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>)}</div>
        <footer><span>{sheetProfile?.mappedColumns ?? 0} mapped · {sheetProfile?.ignoredColumns ?? 0} ignored</span><Button onClick={validateRows} disabled={!canImport}>Validate & dry run</Button></footer>
      </section>}

      {rows.length > 0 && <>
        <section className="data-import-v21-summary">
          <article><span>Total rows</span><strong>{summary.total}</strong><small>Validated source rows</small></article>
          <article><span>Ready</span><strong>{summary.ready}</strong><small>Can create safely</small></article>
          <article><span>Warnings</span><strong>{summary.warning + summary.possible}</strong><small>Needs human review</small></article>
          <article><span>Duplicates</span><strong>{summary.duplicate}</strong><small>Potential existing patient</small></article>
          <article><span>Invalid</span><strong>{summary.error}</strong><small>Cannot import as-is</small></article>
          <article><span>Skipped</span><strong>{summary.skipped}</strong><small>Excluded by decision</small></article>
        </section>

        <section className="data-import-v21-card review-card">
          <header><div><span>Step 4</span><h3>Review row decisions</h3><p>Resolve duplicates and warnings before committing the migration.</p></div><CheckCircle2 size={18}/></header>
          <div className="data-import-v21-review-tools"><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, phone or email"/></label><div>{(['all','ready','warning','duplicate','possible_match','error','skipped'] as PreviewFilter[]).map((filter) => <button type="button" className={previewFilter === filter ? 'active' : ''} key={filter} onClick={() => setPreviewFilter(filter)}>{labelize(filter)}</button>)}</div></div>
          <div className="data-import-v21-row-list">{filteredRows.length === 0 ? <div className="data-import-v21-empty"><Search size={24}/><strong>No rows match this view</strong><span>Adjust the status filter or search query.</span></div> : filteredRows.map((row) => <article key={row.rowNumber} className={`data-import-v21-row status-${row.status}`}>
            <div className="data-import-v21-row-head"><div><span>Row {row.rowNumber}</span><h4>{patientName(row)}</h4><p>{row.values.phone || 'No phone'} · {row.values.email || 'No email'}</p></div><Badge tone={row.status === 'ready' ? 'success' : row.status === 'error' ? 'danger' : row.status === 'duplicate' || row.status === 'possible_match' || row.status === 'warning' ? 'warning' : 'neutral'}>{labelize(row.status)}</Badge></div>
            {row.messages.length > 0 && <ul>{row.messages.slice(0,4).map((message) => <li key={message}>{message}</li>)}</ul>}
            <div className="data-import-v21-row-actions"><label>Decision<select value={row.decision} onChange={(event) => updateRow(row.rowNumber, { decision: event.target.value as ValidatedImportRow['decision'] })}><option value="create_new">Create new patient</option><option value="use_existing">Use existing patient</option><option value="skip">Skip row</option><option value="review_later">Review later</option></select></label>{row.decision === 'use_existing' && <label>Existing patient<select value={row.selectedExistingPatientId ?? ''} onChange={(event) => updateRow(row.rowNumber, { selectedExistingPatientId: event.target.value })}><option value="">Select patient</option>{row.duplicates.map((duplicate) => <option key={duplicate.patientId} value={duplicate.patientId}>{duplicate.patientId} — {duplicate.name}</option>)}</select></label>}</div>
          </article>)}</div>
          <footer className="data-import-v21-review-footer"><div><Button variant="secondary" onClick={downloadErrorReport}>Download review report</Button><Button variant="secondary" onClick={downloadResultReport}>Download full report</Button></div><div className="data-import-v21-dryrun"><span>Create <b>{dryRun.createRows}</b></span><span>Match <b>{dryRun.matchedRows}</b></span><span>Skip <b>{dryRun.skippedRows}</b></span><span>Unresolved <b>{dryRun.unresolvedRows}</b></span></div><Button disabled={!dryRun.canImport || !canImport} onClick={() => setShowImportConfirm(true)}>Review & commit</Button></footer>
        </section>
      </>}

      <section className="data-import-v21-card guide-card"><header><div><span>Destination controls</span><h3>Patient field guide</h3><p>These rules describe how historical data is handled by the existing import engine.</p></div><ShieldCheck size={18}/></header><div>{destinationGuide.map((entry) => <article key={entry.field}><strong>{entry.field}</strong><span>{entry.destination}</span><p>{entry.rule}</p></article>)}</div></section>

      <section className="data-import-v21-card history-card"><header><div><span>Migration history</span><h3>Import batches</h3><p>Completed and rolled-back batches remain visible for operational traceability.</p></div><History size={18}/></header>{batches.length === 0 ? <div className="data-import-v21-empty"><History size={26}/><strong>No import batches yet</strong><span>Committed migrations will appear here.</span></div> : <div className="data-import-v21-batches">{batches.map((batch) => <article key={batch.id}><div><span>{batch.filename}</span><h4>{batch.sheetName}</h4><small>{batch.createdAt ? new Date(batch.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Date unavailable'}</small></div><div className="data-import-v21-batch-stats"><span>Total <b>{batch.totalRows}</b></span><span>Imported <b>{batch.importedRows}</b></span><span>Matched <b>{batch.matchedRows}</b></span><span>Skipped <b>{batch.skippedRows}</b></span></div><Badge tone={batch.status === 'completed' ? 'success' : batch.status === 'rolled_back' ? 'neutral' : batch.status === 'failed' ? 'danger' : 'warning'}>{labelize(batch.status)}</Badge>{batch.status !== 'rolled_back' && batch.importedRows > 0 && <Button variant="secondary" onClick={() => { setRollbackBatchId(batch.id); setRollbackReason('') }}><RotateCcw size={14}/>Rollback</Button>}</article>)}</div>}</section>

      {showImportConfirm && <div className="data-import-v21-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowImportConfirm(false) }}><div className="data-import-v21-modal" role="dialog" aria-modal="true" aria-labelledby="import-confirm-title"><header><div><span>Final migration check</span><h3 id="import-confirm-title">Commit patient import?</h3></div><button type="button" onClick={() => setShowImportConfirm(false)} aria-label="Close"><X size={18}/></button></header><div className="data-import-v21-confirm-grid"><div><span>Create new</span><strong>{dryRun.createRows}</strong></div><div><span>Match existing</span><strong>{dryRun.matchedRows}</strong></div><div><span>Skip</span><strong>{dryRun.skippedRows}</strong></div><div><span>Unresolved</span><strong>{dryRun.unresolvedRows}</strong></div></div><div className="data-import-v21-confirm-note"><ShieldCheck size={18}/><p>This commits the reviewed migration using the existing import engine. It does not create patient portal accounts.</p></div><footer><Button variant="secondary" onClick={() => setShowImportConfirm(false)}>Cancel</Button><Button onClick={performImport} disabled={!dryRun.canImport}>Commit import</Button></footer></div></div>}

      {rollbackBatchId && <div className="data-import-v21-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRollbackBatchId(null) }}><div className="data-import-v21-modal compact" role="dialog" aria-modal="true" aria-labelledby="rollback-title"><header><div><span>Controlled rollback</span><h3 id="rollback-title">Rollback imported patients?</h3></div><button type="button" onClick={() => setRollbackBatchId(null)} aria-label="Close"><X size={18}/></button></header><p className="data-import-v21-muted">Rollback removes patient records created by this import batch while preserving the batch history.</p><label className="data-import-v21-label">Reason<textarea value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} placeholder="Document why this batch is being rolled back"/></label><footer><Button variant="secondary" onClick={() => setRollbackBatchId(null)}>Cancel</Button><Button onClick={performRollback} disabled={!rollbackReason.trim()}>Confirm rollback</Button></footer></div></div>}
    </section>
  )
}
