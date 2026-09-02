type ReportPayload = {
  start_date: string
  end_date: string
  financial: { billed_revenue_cents: number; collections_cents: number; receivables_cents: number; operating_expenses_cents: number; expense_payments_cents: number; refunds_cents: number; net_operating_result_cents: number; net_cash_movement_cents: number }
  operations: { appointments: number; completed_visits: number; cancellations: number; no_shows: number; no_show_rate: number; patients_seen: number; new_patients: number }
  inventory: { active_items: number; low_stock: number; out_of_stock: number; expiring_soon: number; valuation_cents: number; consumed_quantity: number }
  provider_performance?: Array<{ provider_id: string; provider_name: string; appointments: number; completed_visits: number; patients_seen: number; treatments: number; no_shows: number; no_show_rate: number; billed_treatments_cents: number }>
  service_demand: Array<{ service_id: string; service_name: string; demand: number; completed: number }>
  top_treatments: Array<{ name: string; performed: number; billed_cents: number }>
  trend: Array<{ date: string; collections_cents: number; expenses_cents: number }>
}

type ReportExportInput = {
  report: ReportPayload
  scopeName: string
  generatedBy?: string
}

type CellValue = string | number
type Cell = { value: CellValue; style?: number }
type Row = Array<Cell | CellValue>
type Sheet = { name: string; rows: Row[]; widths?: number[] }

const encoder = new TextEncoder()

function money(cents = 0) {
  return Number(cents || 0) / 100
}

export function reportExportFilename(input: ReportExportInput, extension: 'xlsx' | 'html') {
  const scope = input.scopeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'clinic'
  return `plamenco-report-${scope}-${input.report.start_date}-to-${input.report.end_date}.${extension}`
}

function escapeXml(value: CellValue) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function escapeHtml(value: CellValue) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function columnName(index: number) {
  let value = index + 1
  let name = ''
  while (value > 0) {
    const mod = (value - 1) % 26
    name = String.fromCharCode(65 + mod) + name
    value = Math.floor((value - mod) / 26)
  }
  return name
}

function normalizeCell(cell: Cell | CellValue): Cell {
  return typeof cell === 'object' && cell !== null && 'value' in cell ? cell : { value: cell }
}

function worksheetXml(sheet: Sheet) {
  const cols = sheet.widths?.length ? `<cols>${sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>` : ''
  const rows = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((raw, columnIndex) => {
      const cell = normalizeCell(raw)
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`
      const style = cell.style === undefined ? '' : ` s="${cell.style}"`
      if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return `<c r="${ref}"${style}><v>${cell.value}</v></c>`
      return `<c r="${ref}"${style} t="inlineStr"><is><t>${escapeXml(cell.value)}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;PHP&quot; #,##0.00;[Red]-&quot;PHP&quot; #,##0.00"/></numFmts>
  <fonts count="5"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FF1D4ED8"/><name val="Aptos"/></font><font><sz val="10"/><color rgb="FF64748B"/><name val="Aptos"/></font></fonts>
  <fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDCE5F1"/></left><right style="thin"><color rgb="FFDCE5F1"/></right><top style="thin"><color rgb="FFDCE5F1"/></top><bottom style="thin"><color rgb="FFDCE5F1"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function push16(target: number[], value: number) {
  target.push(value & 255, (value >>> 8) & 255)
}

function push32(target: number[], value: number) {
  target.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255)
}

function makeZip(files: Array<{ path: string; content: string }>) {
  const output: number[] = []
  const central: number[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.path)
    const data = encoder.encode(file.content)
    const crc = crc32(data)
    push32(output, 0x04034b50); push16(output, 20); push16(output, 0); push16(output, 0); push16(output, 0); push16(output, 0); push32(output, crc); push32(output, data.length); push32(output, data.length); push16(output, name.length); push16(output, 0); output.push(...name, ...data)
    push32(central, 0x02014b50); push16(central, 20); push16(central, 20); push16(central, 0); push16(central, 0); push16(central, 0); push16(central, 0); push32(central, crc); push32(central, data.length); push32(central, data.length); push16(central, name.length); push16(central, 0); push16(central, 0); push16(central, 0); push16(central, 0); push32(central, 0); push32(central, offset); central.push(...name)
    offset = output.length
  }
  const centralOffset = output.length
  output.push(...central)
  push32(output, 0x06054b50); push16(output, 0); push16(output, 0); push16(output, files.length); push16(output, files.length); push32(output, central.length); push32(output, centralOffset); push16(output, 0)
  return new Uint8Array(output)
}

function sheets(input: ReportExportInput): Sheet[] {
  const { report, scopeName, generatedBy } = input
  const summary: Sheet = {
    name: 'Summary',
    widths: [28, 18, 48],
    rows: [
      [{ value: 'Plamenco Dental Co. Report', style: 1 }, { value: '', style: 1 }, { value: '', style: 1 }],
      [{ value: `Scope: ${scopeName}`, style: 6 }, { value: `Period: ${report.start_date} to ${report.end_date}`, style: 6 }, { value: generatedBy ? `Generated by: ${generatedBy}` : 'Generated from Supabase reports', style: 6 }],
      [],
      [{ value: 'Metric', style: 2 }, { value: 'Value', style: 2 }, { value: 'Definition', style: 2 }],
      ['Billed revenue', { value: money(report.financial.billed_revenue_cents), style: 4 }, 'Non-void invoice totals'],
      ['Collections', { value: money(report.financial.collections_cents), style: 4 }, 'Completed payments only'],
      ['Receivables', { value: money(report.financial.receivables_cents), style: 4 }, 'Outstanding invoice balances'],
      ['Operating expenses', { value: money(report.financial.operating_expenses_cents), style: 4 }, 'Recorded operating expenses'],
      ['Net operating result', { value: money(report.financial.net_operating_result_cents), style: 4 }, 'Billed revenue less operating expenses'],
      ['Appointments', report.operations.appointments, 'Scheduled appointments in range'],
      ['Completed visits', report.operations.completed_visits, 'Completed appointment visits'],
      ['No-show rate', `${(report.operations.no_show_rate * 100).toFixed(1)}%`, 'No-shows divided by scheduled appointments'],
      ['Patients seen', report.operations.patients_seen, 'Unique patients seen'],
    ],
  }
  return [
    summary,
    { name: 'Trend', widths: [16, 18, 18], rows: [[{ value: 'Date', style: 2 }, { value: 'Collections', style: 2 }, { value: 'Expenses', style: 2 }], ...report.trend.map((row) => [row.date, { value: money(row.collections_cents), style: 4 }, { value: money(row.expenses_cents), style: 4 }])] },
    { name: 'Provider Performance', widths: [28, 16, 16, 16, 16, 16, 18], rows: [[{ value: 'Provider', style: 2 }, { value: 'Appointments', style: 2 }, { value: 'Completed', style: 2 }, { value: 'Patients', style: 2 }, { value: 'Treatments', style: 2 }, { value: 'No-shows', style: 2 }, { value: 'Billed', style: 2 }], ...(report.provider_performance ?? []).map((row) => [row.provider_name, row.appointments, row.completed_visits, row.patients_seen, row.treatments, row.no_shows, { value: money(row.billed_treatments_cents), style: 4 }])] },
    { name: 'Service Demand', widths: [34, 16, 16], rows: [[{ value: 'Service', style: 2 }, { value: 'Requests', style: 2 }, { value: 'Completed', style: 2 }], ...report.service_demand.map((row) => [row.service_name, row.demand, row.completed])] },
    { name: 'Treatments', widths: [34, 16, 18], rows: [[{ value: 'Treatment', style: 2 }, { value: 'Performed', style: 2 }, { value: 'Billed value', style: 2 }], ...report.top_treatments.map((row) => [row.name, row.performed, { value: money(row.billed_cents), style: 4 }])] },
    { name: 'Inventory', widths: [26, 18, 18], rows: [[{ value: 'Metric', style: 2 }, { value: 'Value', style: 2 }, { value: 'Notes', style: 2 }], ['Active items', report.inventory.active_items, 'Current branch stock'], ['Low stock', report.inventory.low_stock, 'Needs reorder'], ['Out of stock', report.inventory.out_of_stock, 'Unavailable'], ['Expiring soon', report.inventory.expiring_soon, 'Batch warning'], ['Inventory valuation', { value: money(report.inventory.valuation_cents), style: 4 }, 'Current stock value'], ['Consumed quantity', report.inventory.consumed_quantity, 'Recorded usage']] },
  ]
}

export function buildLiveReportWorkbookV129(input: ReportExportInput) {
  const workbookSheets = sheets(input)
  const files = [
    { path: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${workbookSheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { path: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { path: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
    { path: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookSheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${workbookSheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { path: 'xl/styles.xml', content: stylesXml() },
    ...workbookSheets.map((sheet, index) => ({ path: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(sheet) })),
  ]
  return makeZip(files)
}

export function buildLiveReportPdfHtmlV129(input: ReportExportInput) {
  const { report, scopeName, generatedBy } = input
  const kpis = [
    ['Billed revenue', report.financial.billed_revenue_cents],
    ['Collections', report.financial.collections_cents],
    ['Receivables', report.financial.receivables_cents],
    ['Operating expenses', report.financial.operating_expenses_cents],
    ['Net operating result', report.financial.net_operating_result_cents],
  ]
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Plamenco Report</title><style>
    @page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;font-family:Inter,Aptos,Arial,sans-serif;color:#0f172a;background:#fff}.hero{padding:22px;border-radius:22px;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff}.eyebrow{font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;opacity:.82}.hero h1{margin:8px 0 6px;font-size:30px;line-height:1}.hero p{margin:0;color:#dbeafe}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.meta div,.card{border:1px solid #dbeafe;border-radius:14px;background:#f8fbff;padding:12px}.meta span,.card span,th{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#2563eb}.meta strong,.card strong{display:block;margin-top:4px}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.card strong{font-size:20px}.section{margin-top:18px}.section h2{margin:0 0 8px;font-size:17px}table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #dbeafe;border-radius:14px;overflow:hidden}th,td{padding:10px;border-bottom:1px solid #e8eef7;text-align:left}th{background:#eff6ff}tr:last-child td{border-bottom:0}.amount{text-align:right;font-weight:800}.muted{color:#64748b}.footer{margin-top:18px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b}@media print{button{display:none}.section{break-inside:avoid}}
  </style></head><body><div class="hero"><span class="eyebrow">Authoritative management reporting</span><h1>Reports & Analytics</h1><p>Persisted Supabase transactions for ${escapeHtml(scopeName)}.</p><div class="meta"><div><span>Period</span><strong>${escapeHtml(report.start_date)} to ${escapeHtml(report.end_date)}</strong></div><div><span>Scope</span><strong>${escapeHtml(scopeName)}</strong></div><div><span>Generated by</span><strong>${escapeHtml(generatedBy || 'Clinic user')}</strong></div></div></div><div class="kpis">${kpis.map(([label, value]) => `<div class="card"><span>${escapeHtml(label)}</span><strong>${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value) / 100)}</strong></div>`).join('')}</div><div class="section"><h2>Operations</h2><table><tbody><tr><td>Appointments</td><td class="amount">${report.operations.appointments}</td></tr><tr><td>Completed visits</td><td class="amount">${report.operations.completed_visits}</td></tr><tr><td>Patients seen</td><td class="amount">${report.operations.patients_seen}</td></tr><tr><td>No-show rate</td><td class="amount">${(report.operations.no_show_rate * 100).toFixed(1)}%</td></tr></tbody></table></div><div class="section"><h2>Financial Trend</h2><table><thead><tr><th>Date</th><th class="amount">Collections</th><th class="amount">Expenses</th></tr></thead><tbody>${report.trend.map((row) => `<tr><td>${escapeHtml(row.date)}</td><td class="amount">${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(row.collections_cents / 100)}</td><td class="amount">${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(row.expenses_cents / 100)}</td></tr>`).join('')}</tbody></table></div><div class="section"><h2>Service Demand</h2><table><thead><tr><th>Service</th><th class="amount">Requests</th><th class="amount">Completed</th></tr></thead><tbody>${report.service_demand.slice(0, 12).map((row) => `<tr><td>${escapeHtml(row.service_name)}</td><td class="amount">${row.demand}</td><td class="amount">${row.completed}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No service demand in this period.</td></tr>'}</tbody></table></div><div class="footer">Generated from live Supabase report records. Historical records remain queryable after the report period ends.</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body></html>`
}
