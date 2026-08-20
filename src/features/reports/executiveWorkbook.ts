import type { EnterpriseReportSnapshot } from './reportStore'

type Sheet = {
  name: string
  rows: Array<Array<string | number>>
}

const encoder = new TextEncoder()

function escapeXml(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
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

function worksheetXml(sheet: Sheet) {
  const rows = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`
      return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`
    }).join('')
    return `<row r="${rowIndex + 1}">${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rows}</sheetData></worksheet>`
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pushUint16(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff)
}

function pushUint32(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff)
}

function makeZip(files: Array<{ path: string; content: string }>) {
  const output: number[] = []
  const central: number[] = []
  let offset = 0

  for (const file of files) {
    const name = encoder.encode(file.path)
    const data = encoder.encode(file.content)
    const crc = crc32(data)

    pushUint32(output, 0x04034b50)
    pushUint16(output, 20)
    pushUint16(output, 0)
    pushUint16(output, 0)
    pushUint16(output, 0)
    pushUint16(output, 0)
    pushUint32(output, crc)
    pushUint32(output, data.length)
    pushUint32(output, data.length)
    pushUint16(output, name.length)
    pushUint16(output, 0)
    output.push(...name, ...data)

    pushUint32(central, 0x02014b50)
    pushUint16(central, 20)
    pushUint16(central, 20)
    pushUint16(central, 0)
    pushUint16(central, 0)
    pushUint16(central, 0)
    pushUint16(central, 0)
    pushUint32(central, crc)
    pushUint32(central, data.length)
    pushUint32(central, data.length)
    pushUint16(central, name.length)
    pushUint16(central, 0)
    pushUint16(central, 0)
    pushUint16(central, 0)
    pushUint16(central, 0)
    pushUint32(central, 0)
    pushUint32(central, offset)
    central.push(...name)

    offset = output.length
  }

  const centralOffset = output.length
  output.push(...central)
  pushUint32(output, 0x06054b50)
  pushUint16(output, 0)
  pushUint16(output, 0)
  pushUint16(output, files.length)
  pushUint16(output, files.length)
  pushUint32(output, central.length)
  pushUint32(output, centralOffset)
  pushUint16(output, 0)

  return new Uint8Array(output)
}

function sheetsForSnapshot(snapshot: EnterpriseReportSnapshot): Sheet[] {
  return [
    {
      name: 'Executive Summary',
      rows: [
        ['Metric', 'Value', 'Definition'],
        ['Revenue', snapshot.executive.billedRevenueCents / 100, 'Invoice totals, not collections'],
        ['Collections', snapshot.executive.collectedCashCents / 100, 'Payments received'],
        ['Expenses', snapshot.executive.operatingExpensesCents / 100, 'Recorded operating expenses'],
        ['Operating Result', snapshot.executive.netOperatingResultCents / 100, 'Collections less recorded expenses'],
        ['Receivables', snapshot.executive.outstandingReceivablesCents / 100, 'Open invoice balances'],
        ['Completed Appointments', snapshot.executive.completedVisits, 'Completed visits'],
        ['No-Show Rate', snapshot.executive.noShowRate, 'No-shows divided by eligible scheduled appointments'],
      ],
    },
    {
      name: 'Branch Performance',
      rows: [['Branch', 'Revenue', 'Collections', 'Expenses', 'Operating Result', 'Appointments', 'No Shows'], ...snapshot.branches.map((branch) => [branch.branchName, branch.billedRevenueCents / 100, branch.collectionsCents / 100, branch.expensesCents / 100, branch.netOperatingResultCents / 100, branch.appointments, branch.noShows])],
    },
    {
      name: 'Providers',
      rows: [['Provider', 'Branches', 'Patients Seen', 'Completed Visits', 'Treatments', 'Revenue', 'Average Value', 'No Shows'], ...snapshot.providers.map((provider) => [provider.providerName, provider.branchNames, provider.patientsSeen, provider.completedVisits, provider.treatments, provider.billedRevenueCents / 100, provider.averageTreatmentValueCents / 100, provider.noShows])],
    },
    {
      name: 'Services',
      rows: [['Service', 'Completed', 'Planned', 'Revenue', 'Average Value', 'Revenue Share'], ...snapshot.treatments.map((service) => [service.serviceName, service.performedCount, service.plannedCount, service.billedRevenueCents / 100, service.averageServiceValueCents / 100, service.revenueShare])],
    },
    {
      name: 'Revenue',
      rows: [['Invoice', 'Patient', 'Branch', 'Date', 'Status', 'Balance'], ...snapshot.revenue.accountsReceivable.map((invoice) => [invoice.invoiceNumber, invoice.patientName, invoice.branchName, invoice.invoiceDate, invoice.status, invoice.balanceCents / 100])],
    },
    {
      name: 'Expenses',
      rows: [['Expense', 'Payee', 'Branch', 'Category', 'Date', 'Status', 'Total'], ...snapshot.expenses.details.map((expense) => [expense.expenseNumber, expense.payeeName, expense.branchName, expense.categoryName, expense.expenseDate, expense.status, expense.totalCents / 100])],
    },
    {
      name: 'Inventory',
      rows: [['Item', 'Branch', 'Category', 'On Hand', 'Reorder Level', 'Status', 'Value'], ...snapshot.inventory.stockRows.map((stock) => [stock.itemName, stock.branchName, stock.categoryName, stock.quantityOnHand, stock.reorderLevel, stock.status, stock.valuationCents / 100])],
    },
  ]
}

export function buildExecutiveWorkbook(snapshot: EnterpriseReportSnapshot) {
  const sheets = sheetsForSnapshot(snapshot)
  const files = [
    {
      path: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    },
    {
      path: '_rels/.rels',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      path: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`,
    },
    ...sheets.map((sheet, index) => ({ path: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(sheet) })),
  ]

  return makeZip(files)
}
