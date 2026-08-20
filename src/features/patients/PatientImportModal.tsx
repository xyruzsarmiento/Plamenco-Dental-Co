import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import {
  confirmPatientImport,
  analyzeImportSheet,
  createSuggestedPatientMapping,
  parsePatientWorkbook,
  patientImportFieldOptions,
  runPatientImportDryRun,
  validatePatientImportRows,
  type ParsedPatientWorkbook,
  type PatientImportMapping,
  type ValidatedImportRow,
} from './patientImportStore'

type PatientImportModalProps = {
  onClose: () => void
  onImported: () => void
}

function countRows(rows: ValidatedImportRow[]) {
  return {
    ready: rows.filter((row) => row.status === 'ready').length,
    warning: rows.filter((row) => row.status === 'warning').length,
    duplicate: rows.filter((row) => row.status === 'duplicate').length,
    possible: rows.filter((row) => row.status === 'possible_match').length,
    error: rows.filter((row) => row.status === 'error').length,
    selected: rows.filter((row) => row.decision === 'create_new' && (row.status === 'ready' || row.status === 'warning')).length,
  }
}

export function PatientImportModal({ onClose, onImported }: PatientImportModalProps) {
  const [workbook, setWorkbook] = useState<ParsedPatientWorkbook | null>(null)
  const [selectedSheetName, setSelectedSheetName] = useState('')
  const [mapping, setMapping] = useState<PatientImportMapping>({})
  const [rows, setRows] = useState<ValidatedImportRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const selectedSheet = useMemo(
    () => workbook?.sheets.find((sheet) => sheet.name === selectedSheetName) ?? workbook?.sheets[0],
    [selectedSheetName, workbook],
  )
  const summary = useMemo(() => countRows(rows), [rows])
  const dryRun = useMemo(() => runPatientImportDryRun(rows), [rows])
  const sheetProfile = useMemo(() => selectedSheet ? analyzeImportSheet(selectedSheet, mapping) : null, [mapping, selectedSheet])

  async function handleFileChange(file: File | undefined) {
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

  function handleSheetChange(sheetName: string) {
    const sheet = workbook?.sheets.find((candidate) => candidate.name === sheetName)
    if (!sheet) return
    setSelectedSheetName(sheet.name)
    setMapping(createSuggestedPatientMapping(sheet.headers))
    setRows([])
  }

  function handleValidate() {
    if (!selectedSheet) return
    setRows(validatePatientImportRows(selectedSheet, mapping))
    setResult(null)
  }

  function handleDecisionChange(rowNumber: number, decision: ValidatedImportRow['decision']) {
    setRows((current) => current.map((row) => (row.rowNumber === rowNumber ? { ...row, decision } : row)))
  }

  function handleConfirm() {
    if (!workbook || !selectedSheet || rows.length === 0) return
    const batch = confirmPatientImport(workbook.fileName, selectedSheet.name, rows, {
      mapping,
      sheetProfile: sheetProfile ?? undefined,
      fileSizeBytes: workbook.fileSizeBytes,
    })
    setResult(`Import batch ${batch.id} completed: ${batch.importedRows} imported, ${batch.skippedRows} skipped.`)
    onImported()
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal patient-import-modal" role="dialog" aria-modal="true" aria-labelledby="patient-import-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Historical migration</p>
            <h2 id="patient-import-title">Import patients</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close import workflow" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="import-step-grid">
          <label className="import-upload-zone">
            <Upload size={22} />
            <strong>{workbook?.fileName ?? 'Upload Excel or CSV file'}</strong>
            <span>{isParsing ? 'Reading workbook...' : 'Choose .xlsx or .csv. No records import until confirmation.'}</span>
            <input
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void handleFileChange(event.target.files?.[0])}
            />
          </label>

          {workbook && (
            <Select
              label="Sheet"
              value={selectedSheet?.name ?? ''}
              onChange={(event) => handleSheetChange(event.target.value)}
              options={workbook.sheets.map((sheet) => ({ label: `${sheet.name} (${sheet.rows.length} rows)`, value: sheet.name }))}
            />
          )}
        </div>

        {selectedSheet && (
          <>
            <div className="import-section">
              <div className="section-title-row">
                <FileSpreadsheet size={18} />
                <h3>Column mapping</h3>
              </div>
              <div className="import-mapping-grid">
                {selectedSheet.headers.map((header) => (
                  <div key={header} className="import-mapping-row">
                    <span>{header}</span>
                    <Select
                      label=""
                      value={mapping[header] ?? 'ignore'}
                      onChange={(event) => setMapping({ ...mapping, [header]: event.target.value as PatientImportMapping[string] })}
                      options={patientImportFieldOptions}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="import-section">
              <div className="section-title-row">
                <CheckCircle2 size={18} />
                <h3>Preview and validation</h3>
              </div>
              <div className="import-preview-table">
                <table>
                  <thead>
                    <tr>
                      {selectedSheet.headers.slice(0, 6).map((header) => <th key={header}>{header}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSheet.rows.slice(0, 5).map((row, index) => (
                      <tr key={index}>
                        {selectedSheet.headers.slice(0, 6).map((header) => <td key={header}>{row[header] || '-'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {rows.length > 0 && (
          <div className="import-section">
            <div className="import-review-summary">
              <div><span>Total rows</span><strong>{rows.length}</strong></div>
              <div><span>Ready</span><strong>{summary.ready}</strong></div>
              <div><span>Warnings</span><strong>{summary.warning}</strong></div>
              <div><span>Duplicates</span><strong>{summary.duplicate}</strong></div>
              <div><span>Possible</span><strong>{summary.possible}</strong></div>
              <div><span>Errors</span><strong>{summary.error}</strong></div>
            </div>

            <div className="import-row-list">
              {rows.slice(0, 25).map((row) => (
                <div key={row.rowNumber} className={`import-row import-row-${row.status}`}>
                  <div>
                    <strong>Row {row.rowNumber}</strong>
                    <span>{row.values.fullName || [row.values.firstName, row.values.lastName].filter(Boolean).join(' ') || 'Unnamed patient'}</span>
                    <small>
                      {row.messages.concat(row.duplicates.map((duplicate) => `Possible duplicate: ${duplicate.patientId} ${duplicate.name}`)).join(' | ') || 'Ready to import'}
                    </small>
                  </div>
                  <Select
                    label=""
                    value={row.decision}
                    onChange={(event) => handleDecisionChange(row.rowNumber, event.target.value as ValidatedImportRow['decision'])}
                    options={[
                      { label: 'Review later', value: 'review_later' },
                      { label: 'Skip', value: 'skip' },
                      { label: 'Import as new', value: 'create_new' },
                    ]}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="inline-alert" role="alert"><AlertTriangle size={16} /><span>{error}</span></div>}
        {result && <div className="inline-success" role="status"><CheckCircle2 size={16} /><span>{result}</span></div>}

        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose}>Close</Button>
          <Button variant="secondary" type="button" onClick={handleValidate} disabled={!selectedSheet}>Validate rows</Button>
          <Button type="button" onClick={handleConfirm} disabled={rows.length === 0 || summary.selected === 0 || !dryRun.canImport}>Confirm import</Button>
        </div>
      </section>
    </div>
  )
}
