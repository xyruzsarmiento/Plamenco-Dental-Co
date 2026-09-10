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

function pdfCurrency(cents: number) {
  return `PHP ${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function receiptPaymentMethod(payment: Payment) {
  const gatewayProvider = payment.gatewayProvider?.trim().toLowerCase()
  if (gatewayProvider === 'paymongo' || String(payment.paymentMethod).toLowerCase() === 'qrph') {
    return 'QR Ph'
  }
  return getPaymentMethodLabel(payment.paymentMethod)
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
      :root { color-scheme: light; }
      body { margin: 0; padding: 28px 16px; background: #eef3f9; color: #172033; font-family: Inter, Arial, sans-serif; }
      main { position: relative; width: min(800px, 100%); min-height: 1040px; margin: 0 auto; overflow: hidden; border: 1px solid #d8e2ee; border-radius: 16px; background: #fff; box-shadow: 0 24px 70px rgba(15,23,42,.12); }
      main::before { content: ""; position: absolute; top: 0; right: 0; width: 230px; height: 7px; background: #2563eb; }
      h1, h2, h3, p, dl, dd { margin: 0; }
      .receipt-header { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 28px; padding: 38px 40px 30px; background: linear-gradient(90deg,#fff 0%,#fff 62%,#eef5ff 100%); }
      .brand { display: flex; gap: 14px; align-items: flex-start; }
      .brand-mark { width: 46px; height: 46px; display: grid; place-items: center; flex: 0 0 auto; border: 1px solid #c7dafa; border-radius: 11px; color: #1d4ed8; background: #fff; font-size: 22px; font-weight: 900; }
      .brand h1 { color: #0f172a; font-size: 22px; line-height: 1.1; }
      .brand h2 { margin-top: 4px; color: #2563eb; font-size: 12px; text-transform: uppercase; }
      .branch { margin-top: 10px; color: #52627a; font-size: 12px; line-height: 1.55; }
      .number { min-width: 190px; text-align: right; }
      .number span, dt, .eyebrow, th { color: #718096; font-size: 10px; font-weight: 850; text-transform: uppercase; }
      .number strong { display: block; margin: 5px 0 4px; color: #0f172a; font-size: 21px; overflow-wrap: anywhere; }
      .number p { color: #64748b; font-size: 11px; }
      .receipt-body { padding: 0 40px 36px; }
      .amount-band { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 22px; align-items: center; padding: 21px 22px; border: 1px solid #cfe0f7; border-radius: 12px; background: #f7faff; }
      .amount-band strong { display: block; margin-top: 5px; color: #0f172a; font-size: 30px; }
      .amount-band aside { padding-left: 22px; border-left: 1px solid #d4e2f3; text-align: right; }
      .amount-band aside strong { font-size: 17px; color: #1d4ed8; }
      .identity { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); margin-top: 26px; border-top: 1px solid #dfe7f1; border-bottom: 1px solid #dfe7f1; }
      .identity section { padding: 18px 0; }
      .identity section + section { padding-left: 24px; border-left: 1px solid #dfe7f1; }
      .identity h3 { margin: 5px 0 2px; color: #172033; font-size: 15px; }
      .identity p { color: #64748b; font-size: 11px; overflow-wrap: anywhere; }
      .details { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); margin-top: 24px; border: 1px solid #dfe7f1; border-radius: 10px; overflow: hidden; }
      .details dl { min-width: 0; padding: 14px; border-right: 1px solid #e5ebf2; border-bottom: 1px solid #e5ebf2; }
      .details dl:nth-child(3n) { border-right: 0; }
      .details dl:nth-last-child(-n+3) { border-bottom: 0; }
      dd { margin-top: 5px; color: #172033; font-size: 12px; font-weight: 800; line-height: 1.4; overflow-wrap: anywhere; }
      .services { margin-top: 28px; }
      .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 10px; }
      .section-heading h3 { margin-top: 4px; font-size: 16px; }
      .section-heading p { color: #64748b; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; border: 1px solid #dfe7f1; }
      th { padding: 10px 12px; background: #f7f9fc; text-align: left; }
      td { padding: 13px 12px; border-top: 1px solid #e5ebf2; color: #334155; font-size: 12px; vertical-align: top; }
      td:last-child, th:last-child { width: 145px; text-align: right; }
      .totals { width: min(350px,100%); margin: 18px 0 0 auto; }
      .totals div { display: flex; justify-content: space-between; gap: 18px; padding: 9px 2px; color: #52627a; font-size: 12px; }
      .totals div:last-child { margin-top: 4px; padding: 13px 14px; border: 1px solid #cfe0f7; border-radius: 9px; color: #0f172a; background: #f7faff; font-weight: 850; }
      .receipt-footer { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 24px; align-items: end; margin-top: 38px; padding-top: 18px; border-top: 1px solid #dfe7f1; color: #64748b; font-size: 10px; line-height: 1.6; }
      .receipt-footer strong { color: #1d4ed8; }
      .verified { text-align: right; white-space: nowrap; }
      @media (max-width:620px) {
        body { padding: 0; }
        main { min-height: 100dvh; border: 0; border-radius: 0; box-shadow: none; }
        .receipt-header { grid-template-columns: 1fr; padding: 28px 22px 24px; }
        .number { text-align: left; }
        .receipt-body { padding: 0 22px 28px; }
        .amount-band { grid-template-columns: 1fr; }
        .amount-band aside { padding: 14px 0 0; border-top: 1px solid #d4e2f3; border-left: 0; text-align: left; }
        .identity { grid-template-columns: 1fr; }
        .identity section + section { padding: 0 0 18px; border-left: 0; }
        .details { grid-template-columns: 1fr 1fr; }
        .details dl:nth-child(3n) { border-right: 1px solid #e5ebf2; }
        .details dl:nth-child(2n) { border-right: 0; }
        .details dl:nth-last-child(-n+3) { border-bottom: 1px solid #e5ebf2; }
        .details dl:nth-last-child(-n+2) { border-bottom: 0; }
        .receipt-footer { grid-template-columns: 1fr; }
        .verified { text-align: left; }
      }
      @media print {
        @page { size: A4; margin: 12mm; }
        body { padding: 0; background: #fff; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        main { width: 100%; min-height: auto; border: 1px solid #d8e2ee; border-radius: 0; box-shadow: none; }
        .receipt-header { padding: 28px 30px 24px; }
        .receipt-body { padding: 0 30px 28px; }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="receipt-header">
        <div class="brand"><span class="brand-mark">P</span><div><h1>Plamenco Dental Co.</h1><h2>Official clinic receipt</h2><div class="branch">${branchLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}</div></div></div>
        <div class="number">
          <span>Receipt number</span>
          <strong>${escapeHtml(receipt.receiptNumber)}</strong>
          <p>${escapeHtml(dateTime(receipt.issuedAt))}</p>
        </div>
      </header>
      <div class="receipt-body">
      <section class="amount-band"><div><span class="eyebrow">Amount received</span><strong>${escapeHtml(formatCurrency(receipt.amountCents))}</strong></div><aside><span class="eyebrow">Payment status</span><strong>Paid and posted</strong></aside></section>
      <div class="identity"><section><span class="eyebrow">Received from</span><h3>${escapeHtml(patient.name)}</h3><p>${escapeHtml(patient.patientId)}</p></section><section><span class="eyebrow">Issued by</span><h3>${escapeHtml(branch?.name || 'Plamenco Dental Co.')}</h3><p>${escapeHtml(branch?.address || [branch?.city, branch?.province].filter(Boolean).join(', ') || 'Clinic branch')}</p></section></div>
      <section class="details">
        <dl><dt>Invoice</dt><dd>${escapeHtml(invoice?.invoiceNumber ?? payment.invoiceId)}</dd></dl>
        <dl><dt>Payment reference</dt><dd>${escapeHtml(payment.paymentNumber)}</dd></dl>
        <dl><dt>Payment method</dt><dd>${escapeHtml(receiptPaymentMethod(payment))}</dd></dl>
        <dl><dt>Payment date</dt><dd>${escapeHtml(dateTime(payment.verifiedAt ?? payment.date))}</dd></dl>
        <dl><dt>Processor</dt><dd>${escapeHtml(receipt.issuedBy || payment.verifiedBy || payment.recordedBy || 'Clinic staff')}</dd></dl>
        <dl><dt>External reference</dt><dd>${escapeHtml(payment.referenceNumber || payment.gatewayTransactionId || 'Not applicable')}</dd></dl>
      </section>
      <section class="services">
        <div class="section-heading"><div><span class="eyebrow">Billing breakdown</span><h3>Services and amounts</h3></div><p>${invoice?.items.length || 1} item${invoice?.items.length === 1 ? '' : 's'}</p></div>
        <table>
          <thead><tr><th>Description</th><th>Amount</th></tr></thead>
          <tbody>${invoice?.items.length ? invoice.items.map((item) => `<tr><td>${escapeHtml(item.description)}${item.quantity > 1 ? ` x ${item.quantity}` : ''}</td><td>${escapeHtml(formatCurrency(item.amountCents ?? Math.max(item.quantity * item.unitPriceCents - (item.discountCents ?? 0), 0)))}</td></tr>`).join('') : `<tr><td>${escapeHtml(serviceDescription(invoice))}</td><td>${escapeHtml(formatCurrency(payment.amountCents))}</td></tr>`}</tbody>
        </table>
      </section>
      <section class="totals"><div><span>Remaining balance</span><strong>${escapeHtml(formatCurrency(receipt.remainingBalanceCents))}</strong></div><div><span>Total received</span><strong>${escapeHtml(formatCurrency(receipt.amountCents))}</strong></div></section>
      <footer class="receipt-footer"><div><strong>Verified clinic record</strong><p>This receipt was generated from persisted clinic payment records. No government tax identifier is shown unless configured by the clinic.</p></div><div class="verified"><span class="eyebrow">Document reference</span><p>${escapeHtml(receipt.receiptNumber)} / ${escapeHtml(payment.paymentNumber)}</p></div></footer>
      </div>
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

export async function downloadOfficialReceiptPdf(input: ReceiptDocumentInput) {
  const { receipt, payment, invoice, patient, branch } = input
  if (!receipt || payment.status !== 'completed') throw new Error('Official receipts are available only for completed persisted payments.')

  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  const width = pdf.internal.pageSize.getWidth()
  const height = pdf.internal.pageSize.getHeight()
  const left = 44
  const right = width - 44
  const contentWidth = right - left
  const blue = [37, 99, 235] as const
  const ink = [15, 23, 42] as const
  const body = [71, 85, 105] as const
  const line = [218, 226, 238] as const

  const setText = (color: readonly [number, number, number], size: number, weight: 'normal' | 'bold' = 'normal') => {
    pdf.setTextColor(...color)
    pdf.setFont('helvetica', weight)
    pdf.setFontSize(size)
  }
  const label = (text: string, x: number, y: number) => {
    setText([100, 116, 139], 8, 'bold')
    pdf.text(text.toUpperCase(), x, y)
  }
  const detail = (heading: string, value: string, x: number, y: number, maxWidth: number) => {
    label(heading, x, y)
    setText(ink, 9.5, 'bold')
    pdf.text(pdf.splitTextToSize(value || 'Not recorded', maxWidth), x, y + 15)
  }
  const drawPageHeader = (continued = false) => {
    pdf.setFillColor(...blue)
    pdf.rect(width - 190, 0, 190, 6, 'F')
    pdf.setFillColor(248, 251, 255)
    pdf.roundedRect(left, 34, contentWidth, 82, 8, 8, 'F')
    pdf.setFillColor(255, 255, 255)
    pdf.setDrawColor(198, 216, 246)
    pdf.roundedRect(left + 16, 51, 40, 40, 8, 8, 'FD')
    setText(blue, 18, 'bold')
    pdf.text('P', left + 29, 78)
    setText(ink, 17, 'bold')
    pdf.text('Plamenco Dental Co.', left + 68, 65)
    setText(blue, 8.5, 'bold')
    pdf.text(continued ? 'OFFICIAL RECEIPT - CONTINUED' : 'OFFICIAL CLINIC RECEIPT', left + 68, 81)
    setText(body, 8.5)
    pdf.text(branch?.name || 'Clinic branch', left + 68, 96)
    label('Receipt number', right - 130, 60)
    setText(ink, 14, 'bold')
    pdf.text(receipt.receiptNumber, right, 79, { align: 'right' })
    setText(body, 8.5)
    pdf.text(dateTime(receipt.issuedAt), right, 96, { align: 'right' })
  }
  const drawTableHeader = (y: number) => {
    pdf.setFillColor(247, 249, 252)
    pdf.setDrawColor(...line)
    pdf.rect(left, y, contentWidth, 24, 'FD')
    label('Description', left + 10, y + 16)
    pdf.text('AMOUNT', right - 10, y + 16, { align: 'right' })
    return y + 24
  }

  drawPageHeader()
  pdf.setDrawColor(207, 224, 247)
  pdf.setFillColor(247, 250, 255)
  pdf.roundedRect(left, 132, contentWidth, 75, 8, 8, 'FD')
  label('Amount received', left + 17, 153)
  setText(ink, 25, 'bold')
  pdf.text(pdfCurrency(receipt.amountCents), left + 17, 181)
  label('Payment status', right - 140, 153)
  setText(blue, 11, 'bold')
  pdf.text('PAID AND POSTED', right - 17, 178, { align: 'right' })

  pdf.setDrawColor(...line)
  pdf.line(left, 228, right, 228)
  detail('Received from', patient.name, left, 248, 220)
  detail('Patient ID', patient.patientId, left, 281, 220)
  detail('Issued by', branch?.name || 'Plamenco Dental Co.', 320, 248, 220)
  detail('Clinic address', branch?.address || [branch?.city, branch?.province].filter(Boolean).join(', ') || 'Clinic branch', 320, 281, 220)

  pdf.setDrawColor(...line)
  pdf.roundedRect(left, 316, contentWidth, 96, 7, 7, 'S')
  const columnWidth = contentWidth / 3
  pdf.line(left + columnWidth, 316, left + columnWidth, 412)
  pdf.line(left + columnWidth * 2, 316, left + columnWidth * 2, 412)
  detail('Invoice', invoice?.invoiceNumber ?? payment.invoiceId, left + 12, 338, columnWidth - 24)
  detail('Payment reference', payment.paymentNumber, left + columnWidth + 12, 338, columnWidth - 24)
  detail('Payment method', receiptPaymentMethod(payment), left + columnWidth * 2 + 12, 338, columnWidth - 24)
  detail('Payment date', dateTime(payment.verifiedAt ?? payment.date), left + 12, 381, columnWidth - 24)
  detail('Processor', receipt.issuedBy || payment.verifiedBy || payment.recordedBy || 'Clinic staff', left + columnWidth + 12, 381, columnWidth - 24)
  detail('External reference', payment.referenceNumber || payment.gatewayTransactionId || 'Not applicable', left + columnWidth * 2 + 12, 381, columnWidth - 24)

  label('Billing breakdown', left, 446)
  setText(ink, 13, 'bold')
  pdf.text('Services and amounts', left, 464)
  let y = drawTableHeader(477)
  const items = invoice?.items.length ? invoice.items : [{ id: 'service', description: serviceDescription(invoice), quantity: 1, unitPriceCents: payment.amountCents, amountCents: payment.amountCents }]
  for (const item of items) {
    const description = `${item.description}${item.quantity > 1 ? ` x ${item.quantity}` : ''}`
    const descriptionLines = pdf.splitTextToSize(description, contentWidth - 155) as string[]
    const rowHeight = Math.max(32, descriptionLines.length * 12 + 14)
    if (y + rowHeight > height - 125) {
      pdf.addPage()
      drawPageHeader(true)
      y = drawTableHeader(138)
    }
    pdf.setDrawColor(...line)
    pdf.rect(left, y, contentWidth, rowHeight, 'S')
    setText(body, 9.5)
    pdf.text(descriptionLines, left + 10, y + 19)
    const itemAmount = item.amountCents ?? Math.max(item.quantity * item.unitPriceCents - ('discountCents' in item ? (item.discountCents ?? 0) : 0), 0)
    setText(ink, 9.5, 'bold')
    pdf.text(pdfCurrency(itemAmount), right - 10, y + 19, { align: 'right' })
    y += rowHeight
  }

  if (y + 116 > height - 55) {
    pdf.addPage()
    drawPageHeader(true)
    y = 142
  }
  const totalsX = right - 260
  label('Remaining balance', totalsX, y + 27)
  setText(ink, 10, 'bold')
  pdf.text(pdfCurrency(receipt.remainingBalanceCents), right, y + 27, { align: 'right' })
  pdf.setFillColor(247, 250, 255)
  pdf.setDrawColor(207, 224, 247)
  pdf.roundedRect(totalsX - 12, y + 42, 272, 43, 7, 7, 'FD')
  setText(ink, 10, 'bold')
  pdf.text('TOTAL RECEIVED', totalsX, y + 68)
  setText(blue, 14, 'bold')
  pdf.text(pdfCurrency(receipt.amountCents), right - 10, y + 69, { align: 'right' })

  const pageCount = pdf.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page)
    pdf.setDrawColor(...line)
    pdf.line(left, height - 48, right, height - 48)
    setText(body, 7.5)
    pdf.text('Verified clinic record generated from persisted payment data.', left, height - 31)
    pdf.text(`${receipt.receiptNumber} / ${payment.paymentNumber} / Page ${page} of ${pageCount}`, right, height - 31, { align: 'right' })
  }

  pdf.setProperties({
    title: `Official Receipt ${receipt.receiptNumber}`,
    subject: `Payment ${payment.paymentNumber}`,
    author: 'Plamenco Dental Co.',
    creator: 'Plamenco Dental Co. Patient Portal',
  })
  pdf.save(`Official-Receipt-${receipt.receiptNumber}.pdf`)
}
