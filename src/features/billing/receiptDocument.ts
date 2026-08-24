import type { Branch } from '../branches/branchTypes'
import type { Invoice, Payment, Receipt } from './billingStore'
import { formatCurrency, getPaymentMethodLabel } from './billingStore'

type ReceiptPatient = {
  name: string
  patientId: string
}

type ReceiptDocumentInput = {
  receipt?: Receipt
  payment: Payment
  invoice?: Invoice
  patient: ReceiptPatient
  branch?: Branch
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function dateTime(value?: string) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function serviceDescription(invoice?: Invoice) {
  const items = invoice?.items ?? []
  if (!items.length) return 'Dental services'
  return items.map((item) => `${item.description}${item.quantity > 1 ? ` x ${item.quantity}` : ''}`).join(', ')
}

export function canPrintOfficialReceipt(input: ReceiptDocumentInput) {
  return Boolean(input.receipt && input.payment.status === 'completed')
}

export function buildOfficialReceiptHtml(input: ReceiptDocumentInput) {
  const { receipt, payment, invoice, patient, branch } = input
  if (!receipt || payment.status !== 'completed') {
    throw new Error('Official receipts are available only for completed persisted payments.')
  }

  const branchLines = [
    branch?.name || 'Plamenco Dental Co.',
    branch?.address,
    [branch?.city, branch?.province].filter(Boolean).join(', '),
    branch?.phone ? `Phone: ${branch.phone}` : '',
    branch?.email ? `Email: ${branch.email}` : '',
  ].filter(Boolean)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(receipt.receiptNumber)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f1f5f9; color: #0f172a; font-family: Arial, sans-serif; }
      main { width: min(820px, calc(100% - 32px)); margin: 24px auto; padding: 38px; background: #fff; border: 1px solid #dbe3ef; }
      header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 22px; }
      h1, h2, h3, p { margin: 0; }
      h1 { font-size: 26px; }
      h2 { margin-top: 6px; font-size: 18px; color: #2563eb; text-transform: uppercase; }
      .branch { color: #475569; line-height: 1.55; margin-top: 10px; }
      .number { text-align: right; }
      .number strong { display: block; font-size: 20px; }
      .number span, dt { color: #64748b; font-size: 11px; font-weight: 800; text-transform: uppercase; }
      section { margin-top: 24px; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .cell { border: 1px solid #e2e8f0; padding: 14px; min-height: 74px; }
      dd { margin: 5px 0 0; font-weight: 800; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th { color: #64748b; font-size: 11px; text-align: left; text-transform: uppercase; }
      th, td { padding: 12px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
      td:last-child, th:last-child { text-align: right; }
      .amount { margin-top: 28px; display: flex; justify-content: space-between; align-items: end; gap: 20px; padding: 20px; background: #eff6ff; border: 1px solid #bfdbfe; }
      .amount strong { font-size: 30px; color: #1d4ed8; }
      footer { margin-top: 42px; color: #64748b; font-size: 12px; line-height: 1.6; }
      @media print {
        body { background: #fff; }
        main { width: 100%; margin: 0; border: 0; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Plamenco Dental Co.</h1>
          <h2>Official Clinic Receipt</h2>
          <div class="branch">${branchLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div>
        </div>
        <div class="number">
          <span>Receipt number</span>
          <strong>${escapeHtml(receipt.receiptNumber)}</strong>
          <p>${escapeHtml(dateTime(receipt.issuedAt))}</p>
        </div>
      </header>
      <section class="grid">
        <dl class="cell"><dt>Patient</dt><dd>${escapeHtml(patient.name)}</dd></dl>
        <dl class="cell"><dt>Patient ID</dt><dd>${escapeHtml(patient.patientId)}</dd></dl>
        <dl class="cell"><dt>Invoice</dt><dd>${escapeHtml(invoice?.invoiceNumber ?? payment.invoiceId)}</dd></dl>
        <dl class="cell"><dt>Payment reference</dt><dd>${escapeHtml(payment.paymentNumber)}</dd></dl>
        <dl class="cell"><dt>Payment method</dt><dd>${escapeHtml(getPaymentMethodLabel(payment.paymentMethod))}</dd></dl>
        <dl class="cell"><dt>Processor</dt><dd>${escapeHtml(receipt.issuedBy || payment.verifiedBy || payment.recordedBy || 'Clinic staff')}</dd></dl>
      </section>
      <section>
        <h3>Services / Description</h3>
        <table>
          <thead><tr><th>Description</th><th>Amount</th></tr></thead>
          <tbody><tr><td>${escapeHtml(serviceDescription(invoice))}</td><td>${escapeHtml(formatCurrency(payment.amountCents))}</td></tr></tbody>
        </table>
      </section>
      <section class="amount">
        <div><span>Amount paid</span><strong>${escapeHtml(formatCurrency(receipt.amountCents))}</strong></div>
        <div><span>Remaining balance</span><strong>${escapeHtml(formatCurrency(receipt.remainingBalanceCents))}</strong></div>
      </section>
      <footer>
        <p>This receipt is generated from persisted clinic payment records. No government tax identifier is shown unless configured by the clinic.</p>
        ${payment.referenceNumber ? `<p>External reference: ${escapeHtml(payment.referenceNumber)}</p>` : ''}
      </footer>
    </main>
  </body>
</html>`
}

export function openOfficialReceiptWindow(input: ReceiptDocumentInput) {
  const receiptWindow = window.open('', '_blank', 'width=860,height=980')
  if (!receiptWindow) return
  receiptWindow.document.write(buildOfficialReceiptHtml(input))
  receiptWindow.document.close()
  receiptWindow.focus()
  receiptWindow.print()
}

export function downloadOfficialReceiptHtml(input: ReceiptDocumentInput) {
  const { receipt } = input
  if (!receipt) throw new Error('Official receipts are available only for completed persisted payments.')
  const blob = new Blob([buildOfficialReceiptHtml(input)], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Receipt-${receipt.receiptNumber}.html`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
