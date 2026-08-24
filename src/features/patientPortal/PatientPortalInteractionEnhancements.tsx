import { useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { getInvoicesByPatient, getPaymentsByPatient, getReceiptsByPatient } from '../billing/billingStore'

function closeEnhancementModal() {
  document.querySelector('.pv4-detail-backdrop')?.remove()
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function money(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function prettyDate(value?: string) {
  if (!value) return '—'
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function paymentMethodLabel(payment: ReturnType<typeof getPaymentsByPatient>[number]) {
  if (payment.gatewayProvider?.toLowerCase().includes('paymongo')) return 'QR Ph'
  return payment.paymentMethod.replaceAll('_', ' ')
}

function createDetailModal(title: string, subtitle: string, bodyHtml: string, eyebrow = 'CARE DETAILS') {
  closeEnhancementModal()
  const backdrop = document.createElement('div')
  backdrop.className = 'pv4-detail-backdrop'
  backdrop.innerHTML = `
    <section class="pv4-detail-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header>
        <div><span>${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div>
        <button type="button" class="pv4-detail-close" aria-label="Close details"><svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
      </header>
      <div class="pv4-detail-body">${bodyHtml}</div>
      <footer><button type="button" class="pv4-detail-done">Done</button></footer>
    </section>`
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeEnhancementModal()
  })
  backdrop.querySelector('.pv4-detail-close')?.addEventListener('click', closeEnhancementModal)
  backdrop.querySelector('.pv4-detail-done')?.addEventListener('click', closeEnhancementModal)
  document.body.appendChild(backdrop)
}

function injectBillingDetails(patientId: string) {
  const summary = document.querySelector<HTMLElement>('.pv3-billing-summary')
  if (!summary || summary.parentElement?.querySelector(':scope > .pv4-billing-metrics')) return
  const invoices = getInvoicesByPatient(patientId)
  const payments = getPaymentsByPatient(patientId)
  const receipts = getReceiptsByPatient(patientId)
  const completed = payments.filter((payment) => payment.status === 'completed')
  const totalPaid = completed.reduce((sum, payment) => sum + payment.amountCents, 0)
  const lastPayment = completed[0]
  const metrics = document.createElement('section')
  metrics.className = 'pv4-billing-metrics'
  metrics.innerHTML = `
    <article><span>TOTAL BILLED</span><strong>${escapeHtml(money(invoices.reduce((sum, invoice) => sum + invoice.totalCents, 0)))}</strong><small>${invoices.length} invoice${invoices.length === 1 ? '' : 's'} issued</small></article>
    <article><span>TOTAL PAID</span><strong>${escapeHtml(money(totalPaid))}</strong><small>Verified completed payments</small></article>
    <article><span>RECEIPTS</span><strong>${receipts.length}</strong><small>Official receipt${receipts.length === 1 ? '' : 's'} available</small></article>
    <article><span>LAST PAYMENT</span><strong>${lastPayment ? escapeHtml(money(lastPayment.amountCents)) : '—'}</strong><small>${lastPayment ? escapeHtml(prettyDate(lastPayment.date)) : 'No completed payment yet'}</small></article>`
  summary.insertAdjacentElement('afterend', metrics)
}

function decoratePaymentRows(patientId: string) {
  const payments = getPaymentsByPatient(patientId)
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.pv3-payment-history > div'))
  rows.forEach((row, index) => {
    const payment = payments[index]
    if (!payment) return
    row.dataset.paymentId = payment.id
    row.tabIndex = 0
    row.setAttribute('role', 'button')
    row.setAttribute('aria-label', `View payment ${payment.paymentNumber}`)
    const copy = row.querySelector<HTMLElement>('section p')
    if (copy) copy.textContent = `${prettyDate(payment.date)} · ${paymentMethodLabel(payment)}`
    if (!row.querySelector('.pv4-row-arrow')) {
      const arrow = document.createElement('span')
      arrow.className = 'pv4-row-arrow'
      arrow.textContent = '›'
      row.appendChild(arrow)
    }
  })
}

function openPaymentReceipt(patientId: string, paymentId: string) {
  const payment = getPaymentsByPatient(patientId).find((entry) => entry.id === paymentId)
  if (!payment) return
  const invoice = getInvoicesByPatient(patientId).find((entry) => entry.id === payment.invoiceId)
  const receipt = getReceiptsByPatient(patientId).find((entry) => entry.paymentId === payment.id)
  const method = paymentMethodLabel(payment)
  createDetailModal(
    receipt ? `Official Receipt ${receipt.receiptNumber}` : `Payment ${payment.paymentNumber}`,
    receipt ? 'Clinic-issued payment receipt' : 'Payment transaction details',
    `<div class="pv4-receipt-hero"><span>${receipt ? 'AMOUNT RECEIVED' : 'PAYMENT AMOUNT'}</span><strong>${escapeHtml(money(payment.amountCents))}</strong><small>${escapeHtml(payment.status.replaceAll('_', ' '))}</small></div>
     <div class="pv4-receipt-grid">
       <div><span>Payment reference</span><strong>${escapeHtml(payment.paymentNumber)}</strong></div>
       <div><span>Invoice</span><strong>${escapeHtml(invoice?.invoiceNumber ?? '—')}</strong></div>
       <div><span>Payment date</span><strong>${escapeHtml(prettyDate(payment.date))}</strong></div>
       <div><span>Method</span><strong>${escapeHtml(method)}</strong></div>
       <div><span>External reference</span><strong>${escapeHtml(payment.referenceNumber || payment.gatewayTransactionId || '—')}</strong></div>
       <div><span>Remaining balance</span><strong>${escapeHtml(money(receipt?.remainingBalanceCents ?? invoice?.balanceCents ?? 0))}</strong></div>
     </div>
     ${receipt ? `<section class="pv4-receipt-note"><span>Receipt issued</span><p>${escapeHtml(prettyDate(receipt.issuedAt))} · ${escapeHtml(receipt.issuedBy || 'Plamenco Dental Co.')}</p></section>` : '<aside>This transaction does not have an official receipt yet. A receipt is generated only after the payment is verified and posted.</aside>'}`,
    receipt ? 'OFFICIAL RECEIPT' : 'PAYMENT DETAILS',
  )
}

export function PatientPortalInteractionEnhancements() {
  const { user } = useAuth()

  useEffect(() => {
    const patientId = user?.patientId ?? ''
    let frame = 0
    const enhance = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (patientId) {
          injectBillingDetails(patientId)
          decoratePaymentRows(patientId)
        }
      })
    }
    enhance()
    const observer = new MutationObserver(enhance)
    observer.observe(document.body, { childList: true, subtree: true })

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      const paymentRow = target.closest<HTMLElement>('.pv3-payment-history > div[data-payment-id]')
      if (paymentRow && patientId) {
        openPaymentReceipt(patientId, paymentRow.dataset.paymentId ?? '')
        return
      }

      const treatment = target.closest<HTMLElement>('.pv3-treatment-list article')
      if (treatment) {
        const title = treatment.querySelector('h4')?.textContent?.trim() || 'Treatment item'
        const status = treatment.querySelector('.badge')?.textContent?.trim() || 'Care item'
        const description = treatment.querySelector('p')?.textContent?.trim() || 'No additional description was shared.'
        const footer = treatment.querySelector('footer')?.innerHTML || ''
        const tooth = Array.from(treatment.querySelectorAll('small')).map((node) => node.textContent?.trim()).find((value) => value?.toLowerCase().includes('tooth')) || 'Not specified'
        createDetailModal(
          title,
          status,
          `<div class="pv4-detail-kpis"><div><span>Status</span><strong>${escapeHtml(status)}</strong></div><div><span>Tooth</span><strong>${escapeHtml(tooth)}</strong></div></div><section><span>Treatment summary</span><p>${escapeHtml(description)}</p></section><section class="pv4-schedule-fee"><span>Schedule & fee</span><div class="pv4-detail-footer-copy">${footer}</div></section><aside>Only patient-visible treatment information is shown here. Clinical notes remain private to your care team.</aside>`,
        )
        return
      }

      const plan = target.closest<HTMLElement>('.pv3-plan-summary, .pv3-treatment-hero > section')
      if (plan) {
        const title = plan.querySelector('strong, h3')?.textContent?.trim() || 'Current care plan'
        const percentage = plan.textContent?.match(/\d+%/)?.[0] || '0%'
        const description = plan.querySelector('p')?.textContent?.trim() || 'Your current treatment progress.'
        createDetailModal(
          title,
          `${percentage} complete`,
          `<div class="pv4-progress-detail"><div class="pv4-progress-ring" style="--pv4-progress:${percentage}"><strong>${percentage}</strong><span>complete</span></div><div><span>Care-plan progress</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div></div><aside>Progress updates as treatment items are completed by your clinic.</aside>`,
        )
      }
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeEnhancementModal()
      if (event.key === 'Enter') {
        const active = document.activeElement as HTMLElement | null
        if (active?.matches('.pv3-payment-history > div[data-payment-id]') && patientId) {
          openPaymentReceipt(patientId, active.dataset.paymentId ?? '')
        }
      }
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
      closeEnhancementModal()
      document.querySelectorAll('.pv4-billing-metrics').forEach((node) => node.remove())
    }
  }, [user?.id, user?.patientId])

  return null
}
