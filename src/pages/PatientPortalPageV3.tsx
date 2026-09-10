import {
  Activity,
  ArrowRight,
  Banknote,
  CalendarCheck2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  CreditCard,
  Download,
  FileText,
  FileUser,
  HeartPulse,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Pill,
  Printer,
  QrCode,
  ReceiptText,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DashboardGreeting } from '../components/dashboard/DashboardGreeting'
import { StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination, PortalSkeleton } from '../components/ui/DesignSystem'
import { AccountSecurityPanel } from '../features/auth/AccountSecurityPanel'
import { useAuth } from '../features/auth/AuthContext'
import { getAppointmentsByPatient } from '../features/appointments/appointmentStore'
import { createPatientPortalAppointmentPersisted } from '../features/appointments/appointmentPersistence'
import { getAppointmentAvailability } from '../features/appointments/availabilityEngine'
import {
  getInvoicesByPatient,
  getOutstandingBalanceByPatient,
  getPaymentsByPatient,
  getPaymentMethodLabel,
  getReceiptsByPatient,
} from '../features/billing/billingStore'
import { canPrintOfficialReceipt, downloadOfficialReceiptPdf, openOfficialReceiptWindow } from '../features/billing/receiptDocument'
import { getStoredBranches } from '../features/branches/branchStore'
import { CommunicationPreferencesPanel } from '../features/communications/CommunicationPreferencesPanel'
import { getDentalRecordsByPatientId } from '../features/dentalRecords/dentalRecordStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import {
  downloadPatientDocumentFile,
  getDocumentsByPatient,
  type DocumentCategory,
  type PatientDocument,
} from '../features/documents/documentStore'
import { DocumentCard } from '../features/documents/DocumentCard'
import { getCurrentPatientForAuthenticatedUser } from '../features/patients/patientStore'
import { PatientAvatar } from '../features/patients/PatientAvatar'
import { TopbarNotificationBell } from '../features/notifications/TopbarNotificationBell'
import { updateMyPatientProfilePersisted } from '../features/patients/patientPersistence'
import type { Patient } from '../features/patients/patientTypes'
import { checkPatientQrPayment, createPatientQrPayment, type PatientQrPaymentSession } from '../features/patientPortal/patientPaymentPersistence'
import { refreshPatientBookingAvailability } from '../features/patientPortal/bookingFoundationHydration'
import { hydratePatientPortalFromDatabase } from '../features/patientPortal/patientPortalHydration'
import { getPrescriptionsByPatient } from '../features/prescriptions/prescriptionStore'
import { getRecallDueBucket, getStoredPatientRecalls, linkRecallToAppointment, listPatientRecalls, type RecallQueueItem } from '../features/recalls/recallStore'
import { getStoredServices } from '../features/services/serviceStore'
import { getTreatmentPlansByPatient, getTreatmentsByPatient } from '../features/treatments/treatmentStore'

const navItems = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'booking', label: 'Book a Visit', icon: CalendarDays },
  { key: 'appointments', label: 'Appointments', icon: CalendarCheck2 },
  { key: 'dental-records', label: 'Dental Records', icon: FileText },
  { key: 'recalls', label: 'Recalls & Follow-ups', icon: HeartPulse },
  { key: 'treatment-plans', label: 'Treatment Plans', icon: ClipboardList },
  { key: 'treatments', label: 'Treatments', icon: HeartPulse },
  { key: 'prescriptions', label: 'Prescriptions', icon: Pill },
  { key: 'payments', label: 'Payments', icon: WalletCards },
  { key: 'documents', label: 'Documents', icon: FileUser },
  { key: 'profile', label: 'Profile', icon: UserRound },
] as const

type TabKey = (typeof navItems)[number]['key']
type Appointment = ReturnType<typeof getAppointmentsByPatient>[number]
type DentalRecord = ReturnType<typeof getDentalRecordsByPatientId>[number]
type PatientPrescription = ReturnType<typeof getPrescriptionsByPatient>[number]
type PatientPayment = ReturnType<typeof getPaymentsByPatient>[number]
type PatientInvoice = ReturnType<typeof getInvoicesByPatient>[number]
type PatientReceipt = ReturnType<typeof getReceiptsByPatient>[number]
type PatientBranch = ReturnType<typeof getStoredBranches>[number]

function patientPaymentMethodLabel(payment: PatientPayment) {
  const gatewayProvider = payment.gatewayProvider?.trim().toLowerCase()
  if (gatewayProvider === 'paymongo' || String(payment.paymentMethod).toLowerCase() === 'qrph') {
    return 'QR Ph'
  }
  return getPaymentMethodLabel(payment.paymentMethod)
}
type DocumentFilter = 'all' | DocumentCategory
type DocumentSort = 'newest' | 'oldest' | 'name'

const navItemByKey = new Map(navItems.map((item) => [item.key, item]))
const TREATMENT_PAGE_SIZE = 5
const APPOINTMENT_PAGE_SIZE = 6
const RECORD_PAGE_SIZE = 5
const PLAN_PAGE_SIZE = 5
const RECALL_PAGE_SIZE = 5
const DOCUMENT_PAGE_SIZE = 6
const PRESCRIPTION_PAGE_SIZE = 6
const patientNavigationGroups: Array<{ title: string; keys: TabKey[] }> = [
  { title: 'Overview', keys: ['dashboard'] },
  { title: 'Care', keys: ['booking', 'appointments', 'dental-records', 'recalls', 'treatment-plans', 'treatments', 'prescriptions'] },
  { title: 'Financial & Files', keys: ['payments', 'documents'] },
  { title: 'Account', keys: ['profile'] },
]

function money(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function serviceMoney(pesos: number) {
  if (!Number.isFinite(pesos) || pesos <= 0) return 'Price to be confirmed'
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(pesos)
}

function clinicDate(value?: string) {
  if (!value) return 'Not set'
  const source = value.includes('T') ? value : `${value}T00:00:00+08:00`
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function clinicDateTime(value?: string) {
  if (!value) return 'Not recorded'
  const source = value.includes('T') ? value : `${value}T00:00:00+08:00`
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
}

function timeLabel(value?: string) {
  if (!value) return '—'
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours)) return value
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

function appointmentNeedsClinicUpdate(appointment: Appointment) {
  return appointment.date < manilaToday()
    && !['completed', 'cancelled', 'no_show', 'rejected', 'rescheduled'].includes(appointment.status)
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', hour: '2-digit', hour12: false,
  }).format(new Date()))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function statusLabel(value?: string) {
  if (!value) return 'Not set'
  const labels: Record<string, string> = {
    pending: 'Awaiting confirmation', confirmed: 'Confirmed', rejected: 'Not approved', cancelled: 'Cancelled',
    rescheduled: 'Rescheduled', no_show: 'Missed', checked_in: 'Checked in', waiting: 'Waiting', in_progress: 'In progress',
    completed: 'Completed', draft: 'Preparing', finalized: 'Available', amended: 'Updated', unpaid: 'Payment due',
    partially_paid: 'Partially paid', paid: 'Paid', void: 'Cancelled', voided: 'Cancelled', processing: 'Processing', failed: 'Failed',
    active: 'Active', planned: 'Planned', presented: 'Presented', accepted: 'Accepted', declined: 'Declined', not_billed: 'Not billed',
    open: 'Open', contacted: 'Contacted', waiting_patient: 'Waiting for you', booked: 'Booked', needs_rescheduling: 'Needs rescheduling', dismissed: 'Dismissed',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function PatientStatusBadge({ status, variant = 'standard' }: { status?: string; variant?: 'standard' | 'compact' }) {
  return <StatusBadge status={status} label={statusLabel(status)} variant={variant} />
}

export function PatientPaymentDetailsModal({
  payment,
  receipt,
  invoice,
  branch,
  patientName,
  patientId,
  official,
  onClose,
  onDownload,
  onPrint,
}: {
  payment: PatientPayment
  receipt?: PatientReceipt
  invoice?: PatientInvoice
  branch?: PatientBranch
  patientName: string
  patientId: string
  official: boolean
  onClose: () => void
  onDownload: () => void
  onPrint: () => void
}) {
  const items = invoice?.items ?? []
  const externalReference = payment.referenceNumber || payment.gatewayTransactionId || 'No external reference'
  const title = receipt?.receiptNumber ?? payment.paymentNumber
  const amount = receipt?.amountCents ?? payment.amountCents
  const remainingBalance = receipt?.remainingBalanceCents ?? invoice?.balanceCents ?? 0
  const processor = receipt?.issuedBy || payment.verifiedBy || payment.recordedBy || 'Clinic staff'
  const titleId = `patient-payment-${payment.id}-title`

  return <div className="pv3-modal-backdrop pay222-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`pay222-modal is-${payment.status} ${official ? 'is-official' : 'is-payment'}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="pay222-header">
        <span className="pay222-header-icon" aria-hidden="true"><ReceiptText size={22}/></span>
        <div className="pay222-heading">
          <span>{official ? 'Official receipt' : 'Payment details'}</span>
          <h2 id={titleId}>{title}</h2>
          <p>Plamenco Dental Co. <i aria-hidden="true"/> {branch?.name ?? 'Clinic branch'}</p>
        </div>
        <button type="button" className="pay222-close" aria-label="Close payment details" onClick={onClose}><X size={19}/></button>
      </header>

      <div className="pay222-scroll" role="region" aria-label={`${official ? 'Official receipt' : 'Payment'} information`} tabIndex={0}>
        <section className="pay222-summary" aria-label="Payment summary">
          <div className="pay222-amount">
            <small>{official ? 'Amount received' : 'Payment amount'}</small>
            <strong>{money(amount)}</strong>
            <PatientStatusBadge status={payment.status}/>
          </div>
          <dl className="pay222-summary-facts">
            <div><dt>Payment date</dt><dd>{clinicDateTime(receipt?.issuedAt ?? payment.verifiedAt ?? payment.date)}</dd></div>
            <div><dt>Method</dt><dd>{patientPaymentMethodLabel(payment)}</dd></div>
            <div><dt>Invoice</dt><dd>{invoice?.invoiceNumber ?? payment.invoiceId}</dd></div>
          </dl>
        </section>

        <div className="pay222-reference">
          <div><span>External reference</span><strong>{externalReference}</strong></div>
          <span className="pay222-reference-state">{official ? 'Posted to clinic ledger' : statusLabel(payment.status)}</span>
        </div>

        <div className="pay222-information">
          <section className="pay222-info-group">
            <header><UserRound size={17}/><div><span>Account</span><h3>Patient and clinic</h3></div></header>
            <dl>
              <div><dt>Patient</dt><dd>{patientName}</dd></div>
              <div><dt>Patient ID</dt><dd>{patientId}</dd></div>
              <div><dt>Clinic</dt><dd>Plamenco Dental Co.</dd></div>
              <div><dt>Branch</dt><dd>{branch?.name ?? 'Clinic branch'}</dd></div>
            </dl>
          </section>

          <section className="pay222-info-group">
            <header><WalletCards size={17}/><div><span>Ledger</span><h3>Transaction record</h3></div></header>
            <dl>
              <div><dt>Payment number</dt><dd>{payment.paymentNumber}</dd></div>
              <div><dt>Receipt number</dt><dd>{receipt?.receiptNumber ?? 'Not issued'}</dd></div>
              <div><dt>Processed by</dt><dd>{processor}</dd></div>
              <div><dt>Remaining balance</dt><dd>{money(remainingBalance)}</dd></div>
            </dl>
          </section>
        </div>

        <section className="pay222-services">
          <header><div><span>Billing breakdown</span><h3>Services and amounts</h3></div><strong>{items.length || 1} item{items.length === 1 ? '' : 's'}</strong></header>
          <div className="pay222-table-wrap" role="region" aria-label="Services and amounts" tabIndex={0}>
            <table>
              <thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead>
              <tbody>{items.length ? items.map((item) => <tr key={item.id}><td>{item.description}</td><td>{item.quantity}</td><td>{money(item.amountCents ?? Math.max(item.quantity * item.unitPriceCents - (item.discountCents ?? 0), 0))}</td></tr>) : <tr><td>Dental services</td><td>1</td><td>{money(payment.amountCents)}</td></tr>}</tbody>
              <tfoot><tr><td colSpan={2}>{official ? 'Amount received' : 'Payment amount'}</td><td>{money(amount)}</td></tr></tfoot>
            </table>
          </div>
        </section>

        <div className={`pay222-notice ${official ? 'is-secure' : 'is-pending'}`}><ShieldCheck size={17}/><span>{official ? 'This receipt was generated from the clinic ledger and is available only through your authenticated patient account.' : 'An official receipt is issued only after the payment is completed and posted to the clinic ledger.'}</span></div>
      </div>

      <footer className="pay222-actions">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {official && <Button variant="secondary" icon={<Download size={15}/>} onClick={onDownload}>Download PDF</Button>}
        {official && <Button icon={<Printer size={15}/>} onClick={onPrint}>Print receipt</Button>}
      </footer>
    </section>
  </div>
}

function appointmentDentistLabel(appointment: { providerId?: string; status?: string }, providerMap: Map<string, { displayName?: string }>) {
  if (appointment.status === 'pending') return 'To be assigned'
  return appointment.providerId ? providerMap.get(appointment.providerId)?.displayName ?? 'Care team' : 'To be assigned'
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function EmptyState({ icon: Icon, title, copy, action }: {
  icon: typeof FileText
  title: string
  copy: string
  action?: React.ReactNode
}) {
  return <div className="pv3-empty"><span><Icon size={22} /></span><h3>{title}</h3><p>{copy}</p>{action}</div>
}

function PageHead({ eyebrow, title, copy, action }: {
  eyebrow: string
  title: string
  copy: string
  action?: React.ReactNode
}) {
  const pageIcons: Record<string, React.ReactNode> = {
    'GUIDED BOOKING': <CalendarDays size={14} />,
    'APPOINTMENT REQUEST': <CalendarDays size={14} />,
    'YOUR VISITS': <CalendarCheck2 size={14} />,
    'CLINICAL HISTORY': <FileText size={14} />,
    'CLINICAL SUMMARIES': <FileText size={14} />,
    'RECOMMENDED CARE': <HeartPulse size={14} />,
    'CARE ITEMS': <ClipboardList size={14} />,
    'CARE PLAN': <HeartPulse size={14} />,
    MEDICATION: <Pill size={14} />,
    'FINANCIAL CENTER': <WalletCards size={14} />,
  }
  return <div className="pv3-page-head"><div><span>{pageIcons[eyebrow]}{eyebrow}</span><h2>{title}</h2><p>{copy}</p></div>{action}</div>
}

function CareWorkspaceHero({ icon: Icon, eyebrow, title, copy, facts, action, className = '' }: {
  icon: typeof FileText
  eyebrow: string
  title: string
  copy: string
  facts: Array<{ label: string; value: React.ReactNode; note?: string; tone?: 'default' | 'success' | 'warning' | 'danger' }>
  action?: React.ReactNode
  className?: string
}) {
  return <header className={`care218-hero ${className}`.trim()}>
    <div className="care218-hero-heading">
      <span className="care218-hero-icon" aria-hidden="true"><Icon size={22}/></span>
      <div><span className="care218-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{copy}</p></div>
    </div>
    {action&&<div className="care218-hero-action">{action}</div>}
    <dl className="care218-hero-facts">
      {facts.map((fact)=><div key={fact.label} className={fact.tone&&fact.tone!=='default'?`is-${fact.tone}`:undefined}><dt>{fact.label}</dt><dd>{fact.value}</dd>{fact.note&&<small>{fact.note}</small>}</div>)}
    </dl>
  </header>
}

function prescriptionItems(rx: PatientPrescription) {
  return rx.items?.length ? rx.items : [{
    id: `primary-${rx.id}`,
    medication: rx.medication,
    strength: '',
    dosage: rx.dosage,
    frequency: rx.frequency,
    duration: rx.duration,
    instructions: rx.instructions,
  }]
}

function prescriptionName(rx: PatientPrescription) {
  return rx.medication || prescriptionItems(rx).map((item) => item.medication).filter(Boolean).join(', ') || 'Prescription'
}

function prescriptionPrimaryItem(rx: PatientPrescription) {
  return prescriptionItems(rx)[0]
}

function prescriptionInstructionLine(rx: PatientPrescription) {
  const item = prescriptionPrimaryItem(rx)
  return [item?.dosage, item?.frequency].filter(Boolean).join(' ') || 'Follow your dentist instructions'
}

function careModalDateParts(value?: string) {
  if (!value) return { month: 'DATE', day: '--', weekday: 'Not set' }
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00+08:00`)
  if (Number.isNaN(parsed.getTime())) return { month: 'DATE', day: value, weekday: '' }
  return {
    month: parsed.toLocaleDateString('en-PH', { month: 'short', timeZone: 'Asia/Manila' }).toUpperCase(),
    day: parsed.toLocaleDateString('en-PH', { day: 'numeric', timeZone: 'Asia/Manila' }),
    weekday: parsed.toLocaleDateString('en-PH', { weekday: 'long', timeZone: 'Asia/Manila' }),
  }
}

function PatientCareModalShell({
  id,
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  tone,
  onClose,
  children,
  footer,
}: {
  id: string
  eyebrow: string
  title: string
  subtitle: string
  icon: typeof Pill
  tone: 'prescription' | 'recall' | 'appointment'
  onClose: () => void
  children: React.ReactNode
  footer: React.ReactNode
}) {
  const titleId = `${id}-title`
  return <div className={`care223-backdrop is-${tone}`} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="care223-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <header className="care223-header">
        <span className="care223-header-icon" aria-hidden="true"><Icon size={21}/></span>
        <div className="care223-heading">
          <span>{eyebrow}</span>
          <h2 id={titleId}>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="care223-icon-button" aria-label={`Close ${eyebrow.toLowerCase()}`} onClick={onClose}><X size={19}/></button>
      </header>
      <div className="care223-scroll" role="region" aria-label={`${eyebrow} information`} tabIndex={0}>{children}</div>
      <footer className="care223-footer">{footer}</footer>
    </section>
  </div>
}

export function PatientAppointmentDetailsModal({
  appointment,
  serviceName,
  branchName,
  dentistName,
  estimatedFee,
  onClose,
}: {
  appointment: Appointment
  serviceName: string
  branchName: string
  dentistName: string
  estimatedFee: string
  onClose: () => void
}) {
  const date = careModalDateParts(appointment.date)
  const requiresUpdate = appointmentNeedsClinicUpdate(appointment)
  return <PatientCareModalShell
    id="patient-appointment-detail"
    eyebrow="Appointment details"
    title={serviceName}
    subtitle={appointment.appointmentNumber ?? appointment.id}
    icon={CalendarCheck2}
    tone="appointment"
    onClose={onClose}
    footer={<button type="button" className="care223-action is-secondary" onClick={onClose}><X size={15}/>Close details</button>}
  >
    <section className="care223-appointment-overview">
      <div className="care223-date-tile" aria-hidden="true"><span>{date.month}</span><strong>{date.day}</strong><small>{date.weekday}</small></div>
      <div className="care223-overview-copy">
        <div className="care223-statuses"><PatientStatusBadge status={appointment.status}/><PatientStatusBadge status={appointment.paymentStatus ?? 'not_billed'} variant="compact"/></div>
        <h3>{clinicDate(appointment.date)} at {timeLabel(appointment.startTime)}</h3>
        <p>{dentistName} <i aria-hidden="true"/> {branchName}</p>
      </div>
      <div className="care223-fee"><span>Estimated fee</span><strong>{estimatedFee}</strong><small>{statusLabel(appointment.paymentStatus ?? 'not_billed')}</small></div>
    </section>

    {requiresUpdate&&<div className="care223-alert is-warning"><Clock3 size={17}/><div><strong>Clinic update pending</strong><span>This visit date has passed, but its clinical status has not been finalized. Please contact the clinic if you need an update.</span></div></div>}

    <section className="care223-section">
      <header><span>Visit information</span><h3>Your schedule</h3></header>
      <dl className="care223-facts">
        <div><dt><Clock3 size={15}/>Time</dt><dd>{timeLabel(appointment.startTime)}{appointment.endTime ? ` - ${timeLabel(appointment.endTime)}` : ''}</dd></div>
        <div><dt><MapPin size={15}/>Branch</dt><dd>{branchName}</dd></div>
        <div><dt><Stethoscope size={15}/>Dentist</dt><dd>{dentistName}</dd></div>
        <div><dt><HeartPulse size={15}/>Service</dt><dd>{serviceName}</dd></div>
      </dl>
    </section>

    {appointment.reasonForVisit&&<section className="care223-note"><span>Reason for visit</span><p>{appointment.reasonForVisit}</p></section>}
    <div className="care223-trust"><ShieldCheck size={16}/><span>Appointment details are shown from your clinic record in your authenticated patient account.</span></div>
  </PatientCareModalShell>
}

export function PatientRecallDetailsModal({
  recall,
  branchName,
  linkedAppointment,
  onClose,
  onAction,
  actionLabel,
}: {
  recall: RecallQueueItem
  branchName: string
  linkedAppointment?: string
  onClose: () => void
  onAction?: () => void
  actionLabel?: string
}) {
  const due = careModalDateParts(recall.dueDate)
  const dueBucket = getRecallDueBucket(recall)
  const title = recall.reason || (recall.kind === 'follow_up' ? 'Follow-up recommended' : 'Recall reminder')
  return <PatientCareModalShell
    id="patient-recall-detail"
    eyebrow="Recall / follow-up"
    title={title}
    subtitle={recall.dueDate ? `Recommended for ${clinicDate(recall.dueDate)}` : 'Recommended return visit'}
    icon={HeartPulse}
    tone="recall"
    onClose={onClose}
    footer={<><button type="button" className="care223-action is-secondary" onClick={onClose}><X size={15}/>Close</button>{onAction&&actionLabel&&<button type="button" className="care223-action is-primary" onClick={onAction}><CalendarDays size={16}/>{actionLabel}<ArrowRight size={15}/></button>}</>}
  >
    <section className={`care223-recall-overview is-${dueBucket}`}>
      <div className="care223-date-tile" aria-hidden="true"><span>{due.month}</span><strong>{due.day}</strong><small>{due.weekday}</small></div>
      <div className="care223-overview-copy">
        <div className="care223-statuses"><PatientStatusBadge status={recall.status}/>{dueBucket==='overdue'&&<PatientStatusBadge status="overdue"/>}</div>
        <span className="care223-overline">{recall.kind.replaceAll('_', ' ')}</span>
        <h3>{recall.patientMessage || 'Your clinic recommends a future visit.'}</h3>
        <p>{recall.reason || 'A return visit was recommended by your clinic.'}</p>
      </div>
    </section>

    <section className="care223-section">
      <header><span>Care coordination</span><h3>Follow-up information</h3></header>
      <dl className="care223-facts">
        <div><dt><CalendarDays size={15}/>Recommended date</dt><dd>{recall.dueDate ? clinicDate(recall.dueDate) : 'No date set'}</dd></div>
        <div><dt><Stethoscope size={15}/>Dentist</dt><dd>{recall.providerName || 'Care team'}</dd></div>
        <div><dt><MapPin size={15}/>Branch</dt><dd>{branchName}</dd></div>
        <div><dt><CalendarCheck2 size={15}/>Appointment</dt><dd>{linkedAppointment || 'Not booked yet'}</dd></div>
      </dl>
    </section>

    <section className="care223-note"><span>Related care</span><p>{recall.sourceId ? `${recall.sourceType.replaceAll('_', ' ')} ${recall.sourceId}` : recall.sourceType.replaceAll('_', ' ')}</p><small>Added {recall.createdAt ? clinicDate(recall.createdAt) : 'date not recorded'}</small></section>
    <div className="care223-trust"><ShieldCheck size={16}/><span>This recommendation comes from the clinic record shared with your authenticated patient account.</span></div>
  </PatientCareModalShell>
}

export function PatientPrescriptionDetailsModal({
  prescription,
  branchName,
  dentistName,
  linkedAppointment,
  onClose,
}: {
  prescription: PatientPrescription
  branchName: string
  dentistName: string
  linkedAppointment: string
  onClose: () => void
}) {
  const items = prescriptionItems(prescription)
  return <PatientCareModalShell
    id="patient-prescription-detail"
    eyebrow="Prescription"
    title={prescriptionName(prescription)}
    subtitle={`Issued ${clinicDate(prescription.prescriptionDate)} at ${branchName}`}
    icon={Pill}
    tone="prescription"
    onClose={onClose}
    footer={<button type="button" className="care223-action is-secondary" onClick={onClose}><X size={15}/>Close prescription</button>}
  >
    <section className="care223-prescription-overview">
      <span className="care223-prescription-mark" aria-hidden="true"><Pill size={25}/></span>
      <div className="care223-overview-copy">
        <div className="care223-statuses"><PatientStatusBadge status={prescription.status}/></div>
        <span className="care223-overline">How to take it</span>
        <h3>{prescriptionInstructionLine(prescription)}</h3>
        <p>Follow the directions provided by your prescribing dentist.</p>
      </div>
    </section>

    <section className="care223-section">
      <header><span>Prescription context</span><h3>Issued by your care team</h3></header>
      <dl className="care223-facts">
        <div><dt><Stethoscope size={15}/>Dentist</dt><dd>{dentistName}</dd></div>
        <div><dt><MapPin size={15}/>Branch</dt><dd>{branchName}</dd></div>
        <div><dt><CalendarDays size={15}/>Issued date</dt><dd>{clinicDate(prescription.prescriptionDate)}</dd></div>
        <div><dt><CalendarCheck2 size={15}/>Appointment</dt><dd>{linkedAppointment}</dd></div>
      </dl>
    </section>

    <section className="care223-section care223-medications">
      <header><span>Medication plan</span><h3>{items.length} medication{items.length === 1 ? '' : 's'}</h3></header>
      <div className="care223-medication-list">
        {items.map((item, index)=><article className="care223-medication" key={item.id}>
          <header><span className="care223-medication-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><span>Medication</span><h3>{item.medication || 'Medication'}</h3>{item.strength&&<p>{item.strength}</p>}</div></header>
          <dl><div><dt>Dosage</dt><dd>{item.dosage || 'As directed'}</dd></div><div><dt>Frequency</dt><dd>{item.frequency || 'As directed'}</dd></div><div><dt>Duration</dt><dd>{item.duration || 'As directed'}</dd></div></dl>
          {item.instructions&&<div className="care223-medication-instructions"><ClipboardList size={16}/><div><span>Special instructions</span><p>{item.instructions}</p></div></div>}
        </article>)}
      </div>
    </section>

    {prescription.notes&&<section className="care223-note"><span>Additional note</span><p>{prescription.notes}</p></section>}
    <div className="care223-trust"><ShieldCheck size={16}/><span>This prescription is read-only. Contact the clinic if any direction is unclear.</span></div>
  </PatientCareModalShell>
}

function PatientPrescriptionHero({ total, activeCount, latestDate }: { total: number; activeCount: number; latestDate?: string }) {
  return <CareWorkspaceHero
    icon={Pill}
    eyebrow="Medication center"
    title="Prescriptions"
    copy="Clear medication directions from your dental care team, organized for quick reference."
    className="care218-hero-rx"
    facts={[
      { label: 'Active medication', value: activeCount, note: activeCount === 1 ? 'Current prescription' : 'Current prescriptions', tone: activeCount ? 'success' : 'default' },
      { label: 'Last issued', value: latestDate ? clinicDate(latestDate).replace(/, \d{4}$/, '') : 'None', note: 'Most recent order' },
      { label: 'Medication record', value: total, note: 'All prescriptions' },
    ]}
  />
}

function PatientPrescriptionSummary({ activePrescriptions, onBookVisit }: { activePrescriptions: PatientPrescription[]; onBookVisit: () => void }) {
  const latest = activePrescriptions[0]
  if (!activePrescriptions.length) {
    return <section className="pv3-rx-summary-redesign is-empty"><CheckCircle2 size={18}/><div><strong>No active prescriptions</strong><span>Medication instructions issued by your dentist will appear here.</span></div><Button variant="secondary" size="sm" onClick={onBookVisit}>Book a visit</Button></section>
  }
  return <section className="pv3-rx-summary-redesign"><Pill size={18}/><div><strong>{activePrescriptions.length} active prescription{activePrescriptions.length === 1 ? '' : 's'}</strong><span>Latest: {prescriptionName(latest)} · Issued {clinicDate(latest.prescriptionDate)}</span></div></section>
}

function PatientPrescriptionCard({ rx, branchName, onOpen }: { rx: PatientPrescription; branchName: string; onOpen: () => void }) {
  const item = prescriptionPrimaryItem(rx)
  const hasMore = prescriptionItems(rx).length > 1
  return <button type="button" className={`pv3-rx-record-redesign is-${rx.status}`} onClick={onOpen}>
    <span className="pv3-rx-record-icon" aria-hidden="true"><Pill size={18}/></span>
    <section className="pv3-rx-record-main">
      <header><PatientStatusBadge status={rx.status} /><small><CalendarDays size={13}/>Issued {clinicDate(rx.prescriptionDate)}</small></header>
      <div className="pv3-rx-name"><h3>{prescriptionName(rx)}</h3>{item?.strength && <p className="pv3-rx-strength">{item.strength}</p>}</div>
      <div className="pv3-rx-dose-grid">
        <div className="pv3-rx-instruction">
          <span>Take</span>
          <strong>{prescriptionInstructionLine(rx)}</strong>
        </div>
        <div className="pv3-rx-duration">
          <span>For</span>
          <strong>{item?.duration || rx.duration || 'As directed'}</strong>
        </div>
      </div>
      {(item?.instructions || rx.instructions) && <p className="pv3-rx-directions">{item?.instructions || rx.instructions}</p>}
      {hasMore && <small className="pv3-rx-more">{prescriptionItems(rx).length - 1} additional medication{prescriptionItems(rx).length - 1 === 1 ? '' : 's'} in this prescription</small>}
      <footer>
        <span><Stethoscope size={14}/>Prescribed by {rx.providerNameSnapshot || 'your dentist'}</span>
        <span><MapPin size={14}/>{branchName}</span>
      </footer>
    </section>
    <aside><span>Review prescription</span><ChevronRight size={17}/></aside>
  </button>
}

function CareTrendChart({ appointments, treatments }: {
  appointments: ReturnType<typeof getAppointmentsByPatient>
  treatments: ReturnType<typeof getTreatmentsByPatient>
}) {
  const [range, setRange] = useState<6 | 12>(6)
  const [hovered, setHovered] = useState<number | null>(null)
  const data = useMemo(() => {
    const now = new Date()
    return Array.from({ length: range }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (range - index - 1), 1)
      const year = date.getFullYear()
      const month = date.getMonth()
      const visits = appointments.filter((item) => {
        const d = new Date(`${item.date}T00:00:00`)
        return d.getFullYear() === year && d.getMonth() === month && item.status !== 'cancelled'
      }).length
      const care = treatments.filter((item) => {
        if (!item.treatmentDate || item.status !== 'completed') return false
        const d = new Date(`${item.treatmentDate}T00:00:00`)
        return d.getFullYear() === year && d.getMonth() === month
      }).length
      return { label: date.toLocaleDateString('en-PH', { month: 'short' }), score: visits + care, visits, care }
    })
  }, [appointments, range, treatments])

  const max = Math.max(...data.map((item) => item.score), 1)
  const points = data.map((item, index) => ({
    x: 30 + (index * 360) / Math.max(data.length - 1, 1),
    y: 116 - (item.score / max) * 70,
  }))
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const visitTotal = data.reduce((sum, item) => sum + item.visits, 0)
  const careTotal = data.reduce((sum, item) => sum + item.care, 0)

  return <section className="pv3-dashboard-v216-chart">
    <header>
      <div><span><Activity size={15}/> Care activity</span><h3>Your care over time</h3><p>Visits and treatments recorded by your clinic.</p></div>
      <div className="pv3-dashboard-v216-segmented" aria-label="Care activity range"><button type="button" aria-pressed={range === 6} className={range === 6 ? 'is-active' : ''} onClick={() => setRange(6)}>6 months</button><button type="button" aria-pressed={range === 12} className={range === 12 ? 'is-active' : ''} onClick={() => setRange(12)}>12 months</button></div>
    </header>
    <div className="pv3-dashboard-v216-chart-wrap">
      <svg viewBox="0 0 420 150" role="img" aria-label={`${visitTotal} visits and ${careTotal} treatments recorded in the selected period`}>
        <title>Monthly visits and treatments</title>
        <defs><linearGradient id="pv3DashboardArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".2"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs>
        {[46, 81, 116].map((y) => <line key={y} x1="30" x2="390" y1={y} y2={y} stroke="#e8eef7" strokeWidth="1" />)}
        <path d={`${path} L ${points.at(-1)?.x ?? 390} 122 L ${points[0]?.x ?? 30} 122 Z`} fill="url(#pv3DashboardArea)" />
        <path d={path} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((point, index) => <g key={`${data[index].label}-${index}`} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)}>
          <circle cx={point.x} cy={point.y} r={hovered === index ? 5.5 : 4} fill="#fff" stroke="#2563eb" strokeWidth="2.5" />
          <circle cx={point.x} cy={point.y} r="13" fill="transparent" style={{ cursor: 'pointer' }} />
          <text x={point.x} y="144" textAnchor="middle" fontSize="9" fill="#718096">{data[index].label}</text>
          {hovered === index && <g><rect x={Math.max(4, Math.min(point.x - 43, 330))} y={Math.max(5, point.y - 34)} width="86" height="25" rx="6" fill="#172033"/><text x={Math.max(47, Math.min(point.x, 373))} y={Math.max(21, point.y - 18)} textAnchor="middle" fontSize="8" fill="#fff">{data[index].visits} visits - {data[index].care} care</text></g>}
        </g>)}
      </svg>
    </div>
    <footer><span><i className="is-visits"/> {visitTotal} visits</span><span><i className="is-care"/> {careTotal} treatments</span><small>Updated from your clinic record</small></footer>
  </section>
}

export function PatientPortalPage() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, signOut } = useAuth()
  const requestedTab = searchParams.get('tab') as TabKey | null
  const initialTab = navItems.some((item) => item.key === requestedTab) ? requestedTab! : 'dashboard'

  const [patient, setPatient] = useState<Patient | null>(null)
  const [lookupState, setLookupState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [mobileNav, setMobileNav] = useState(false)
  const [revision, setRevision] = useState(0)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [appointmentView, setAppointmentView] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming')
  const [appointmentPage, setAppointmentPage] = useState(1)
  const [selectedRecord, setSelectedRecord] = useState<DentalRecord | null>(null)
  const [selectedPrescription, setSelectedPrescription] = useState<PatientPrescription | null>(null)
  const [selectedRecall, setSelectedRecall] = useState<RecallQueueItem | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<PatientPayment | null>(null)
  const [paymentHistoryView, setPaymentHistoryView] = useState<'all' | 'receipts'>('all')
  const [pendingBookingRecall, setPendingBookingRecall] = useState<RecallQueueItem | null>(null)
  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>('all')
  const [documentQuery, setDocumentQuery] = useState('')
  const [documentSort, setDocumentSort] = useState<DocumentSort>('newest')
  const [documentBusyId, setDocumentBusyId] = useState<string | null>(null)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [recordPage, setRecordPage] = useState(1)
  const [planPage, setPlanPage] = useState(1)
  const [recallPage, setRecallPage] = useState(1)
  const [recallFilter, setRecallFilter] = useState<'upcoming' | 'due_soon' | 'completed' | 'all'>('upcoming')
  const [documentPage, setDocumentPage] = useState(1)
  const [treatmentPage, setTreatmentPage] = useState(1)
  const [prescriptionPage, setPrescriptionPage] = useState(1)
  const [prescriptionFilter, setPrescriptionFilter] = useState<'all' | 'active' | 'previous'>('all')
  const [prescriptionQuery, setPrescriptionQuery] = useState('')

  const [bookingStep, setBookingStep] = useState(0)
  const [bookingBusy, setBookingBusy] = useState(false)
  const [bookingAvailabilityBusy, setBookingAvailabilityBusy] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null)
  const [booking, setBooking] = useState({ serviceId: '', branchId: '', providerId: '', date: '', startTime: '', notes: '' })

  const [profileEditing, setProfileEditing] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profilePhotoMessage, setProfilePhotoMessage] = useState<string | null>(null)
  const [profileImage, setProfileImage] = useState('')
  const [profile, setProfile] = useState({
    firstName: '', middleName: '', lastName: '', dateOfBirth: '', email: '', phone: '', address: '',
    emergencyContact: '', emergencyContactPhone: '', emergencyContactRelationship: '',
  })

  const [payMode, setPayMode] = useState<'none' | 'cash' | 'online'>('none')
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null)
  const [paySession, setPaySession] = useState<PatientQrPaymentSession | null>(null)
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [payStatus, setPayStatus] = useState<string | null>(null)
  const [payConfirmation, setPayConfirmation] = useState<{ paymentNumber?: string } | null>(null)

  const resolvedPatientId = user?.role === 'patient' ? user.patientId ?? patientId : patientId

  useEffect(() => {
    let alive = true
    async function load() {
      if (!user || user.role !== 'patient') { if (alive) setLookupState('missing'); return }
      setLookupState('loading')
      try {
        const row = await getCurrentPatientForAuthenticatedUser(user.id)
        if (!alive) return
        if (!row) { setPatient(null); setLookupState('missing'); return }
        setPatient(row)
        setLookupState('ready')
      } catch (error) {
        if (!alive) return
        setLookupError(error instanceof Error ? error.message : 'Unable to load your patient record.')
        setLookupState('error')
      }
    }
    void load()
    return () => { alive = false }
  }, [patientId, user])

  useEffect(() => {
    if (!patient) return
    setProfileImage(patient.profileImage ?? '')
    setProfile({
      firstName: patient.firstName, middleName: patient.middleName, lastName: patient.lastName,
      dateOfBirth: patient.dateOfBirth, email: patient.email, phone: patient.phone, address: patient.address,
      emergencyContact: patient.emergencyContact, emergencyContactPhone: patient.emergencyContactPhone,
      emergencyContactRelationship: patient.emergencyContactRelationship ?? '',
    })
  }, [patient])

  useEffect(() => {
    document.body.classList.toggle('pv3-nav-lock', mobileNav)
    return () => document.body.classList.remove('pv3-nav-lock')
  }, [mobileNav])

  const appointments = useMemo(() => { void revision; return patient ? getAppointmentsByPatient(patient.patientId) : [] }, [patient, revision])
  const records = useMemo(() => { void revision; return patient ? getDentalRecordsByPatientId(patient.patientId) : [] }, [patient, revision])
  const recalls = useMemo(() => { void revision; return patient ? getStoredPatientRecalls(patient.patientId) : [] }, [patient, revision])
  const treatments = useMemo(() => { void revision; return patient ? getTreatmentsByPatient(patient.patientId) : [] }, [patient, revision])
  const plans = useMemo(() => { void revision; return patient ? getTreatmentPlansByPatient(patient.patientId) : [] }, [patient, revision])
  const prescriptions = useMemo(() => { void revision; return patient ? getPrescriptionsByPatient(patient.patientId) : [] }, [patient, revision])
  const invoices = useMemo(() => { void revision; return patient ? getInvoicesByPatient(patient.patientId) : [] }, [patient, revision])
  const payments = useMemo(() => { void revision; return patient ? getPaymentsByPatient(patient.patientId) : [] }, [patient, revision])
  const receipts = useMemo(() => { void revision; return patient ? getReceiptsByPatient(patient.patientId) : [] }, [patient, revision])
  const documents = useMemo(() => { void revision; return patient ? getDocumentsByPatient(patient.patientId) : [] }, [patient, revision])
  const balance = useMemo(() => { void revision; return patient ? getOutstandingBalanceByPatient(patient.patientId) : 0 }, [patient, revision])

  const services = useMemo(() => getStoredServices().filter((item) => item.status === 'active' && item.onlineBookable !== false && item.internalOnly !== true), [revision])
  const branches = useMemo(() => getStoredBranches().filter((item) => item.status === 'active'), [revision])
  const serviceMap = useMemo(() => new Map(getStoredServices().map((item) => [item.id, item])), [revision])
  const branchMap = useMemo(() => new Map(getStoredBranches().map((item) => [item.id, item])), [revision])
  const providerMap = useMemo(() => new Map(getStoredProviders().map((item) => [item.id, item])), [revision])

  const selectedService = services.find((item) => item.id === booking.serviceId)
  const selectedBranch = branches.find((item) => item.id === booking.branchId)
  const openInvoices = invoices.filter((invoice) => invoice.balanceCents > 0 && invoice.status !== 'void')
  const billingInvoices = [...invoices].sort((a, b) => {
    const balancePriority = Number(b.balanceCents > 0 && b.status !== 'void') - Number(a.balanceCents > 0 && a.status !== 'void')
    return balancePriority || String(b.dueDate ?? b.invoiceDate).localeCompare(String(a.dueDate ?? a.invoiceDate))
  })
  const selectedPayInvoice = invoices.find((invoice) => invoice.id === payInvoiceId) ?? null
  const availability = useMemo(() => {
    if (!booking.date || !booking.serviceId || !booking.branchId) return { status: 'missing_context' as const, slots: [], eligibleProviderCount: 0, scheduledProviderCount: 0 }
    return getAppointmentAvailability({ branchId: booking.branchId, serviceId: booking.serviceId, date: booking.date })
  }, [booking.branchId, booking.date, booking.serviceId, revision])

  useEffect(() => {
    if (tab !== 'booking' || bookingStep !== 2 || !booking.branchId || !booking.serviceId || !booking.date) return
    let alive = true
    setBookingAvailabilityBusy(true)
    void refreshPatientBookingAvailability(booking.date)
      .then(() => { if (alive) setRevision((value) => value + 1) })
    .catch((cause) => { if (alive) setBookingError(cause instanceof Error ? cause.message : 'Unable to refresh clinic times.') })
      .finally(() => { if (alive) setBookingAvailabilityBusy(false) })
    return () => { alive = false }
  }, [booking.branchId, booking.date, booking.serviceId, bookingStep, tab])

  const nextAppointment = useMemo(() => [...appointments]
    .filter((item) => item.date >= manilaToday() && !['cancelled', 'no_show', 'completed', 'rejected', 'rescheduled'].includes(item.status))
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))[0], [appointments])
  const appointmentGroups = useMemo(() => {
    const cancelledStatuses = ['cancelled', 'no_show', 'rejected']
    const upcoming = appointments
      .filter((item) => !cancelledStatuses.includes(item.status) && item.status !== 'completed' && !appointmentNeedsClinicUpdate(item))
      .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    const past = appointments
      .filter((item) => item.status === 'completed' || appointmentNeedsClinicUpdate(item))
      .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`))
    const cancelled = appointments
      .filter((item) => cancelledStatuses.includes(item.status))
      .sort((a, b) => `${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`))
    return { upcoming, past, cancelled }
  }, [appointments])
  const filteredAppointments = appointmentGroups[appointmentView]
  const appointmentPageCount = Math.max(1, Math.ceil(filteredAppointments.length / APPOINTMENT_PAGE_SIZE))
  const safeAppointmentPage = Math.min(Math.max(appointmentPage, 1), appointmentPageCount)
  const appointmentStartIndex = filteredAppointments.length ? (safeAppointmentPage - 1) * APPOINTMENT_PAGE_SIZE : 0
  const appointmentEndIndex = Math.min(appointmentStartIndex + APPOINTMENT_PAGE_SIZE, filteredAppointments.length)
  const visibleAppointments = filteredAppointments.slice(appointmentStartIndex, appointmentEndIndex)
  const nextRecall = useMemo(() => recalls.find((item) => !['completed', 'dismissed', 'cancelled'].includes(item.status)), [recalls])
  const completedTreatments = treatments.filter((item) => item.status === 'completed').length
  const treatmentProgress = treatments.length ? Math.round((completedTreatments / treatments.length) * 100) : 0
  const fullName = patient ? `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}`.trim() : ''
  const activePlan = plans.find((item) => ['planned', 'scheduled', 'in_progress'].includes(item.status)) ?? plans[0]
  const completedPlanTreatments = activePlan ? activePlan.treatments.filter((id) => treatments.some((item) => item.id === id && item.status === 'completed')).length : 0
  const planProgress = activePlan ? Math.round((completedPlanTreatments / Math.max(activePlan.treatments.length, 1)) * 100) : 0
  const recentDocuments = [...documents].sort((a, b) => String(b.uploadDate).localeCompare(String(a.uploadDate))).slice(0, 6)
  const recentPrescriptions = [...prescriptions]
    .filter((item) => item.status !== 'voided')
    .sort((a, b) => String(b.prescriptionDate).localeCompare(String(a.prescriptionDate)))
    .slice(0, 6)
  const sortedRecords = [...records].sort((a, b) => String(b.recordDate).localeCompare(String(a.recordDate)))
  const recordPageCount = Math.max(1, Math.ceil(sortedRecords.length / RECORD_PAGE_SIZE))
  const safeRecordPage = Math.min(Math.max(recordPage, 1), recordPageCount)
  const recordStartIndex = sortedRecords.length ? (safeRecordPage - 1) * RECORD_PAGE_SIZE : 0
  const recordEndIndex = Math.min(recordStartIndex + RECORD_PAGE_SIZE, sortedRecords.length)
  const visibleRecords = sortedRecords.slice(recordStartIndex, recordEndIndex)
  const sortedPlans = [...plans].sort((a, b) => String(b.presentedAt ?? b.createdAt).localeCompare(String(a.presentedAt ?? a.createdAt)))
  const planPageCount = Math.max(1, Math.ceil(sortedPlans.length / PLAN_PAGE_SIZE))
  const safePlanPage = Math.min(Math.max(planPage, 1), planPageCount)
  const planStartIndex = sortedPlans.length ? (safePlanPage - 1) * PLAN_PAGE_SIZE : 0
  const planEndIndex = Math.min(planStartIndex + PLAN_PAGE_SIZE, sortedPlans.length)
  const visiblePlans = sortedPlans.slice(planStartIndex, planEndIndex)
  const recallMatchesFilter = (item: RecallQueueItem) => {
    const bucket = getRecallDueBucket(item)
    if (recallFilter === 'all') return true
    if (recallFilter === 'completed') return ['completed', 'dismissed', 'cancelled'].includes(item.status)
    if (recallFilter === 'due_soon') return ['overdue', 'due_soon'].includes(bucket) && !['completed', 'dismissed', 'cancelled'].includes(item.status)
    return !['completed', 'dismissed', 'cancelled'].includes(item.status)
  }
  const filteredRecalls = [...recalls]
    .filter(recallMatchesFilter)
    .sort((a, b) => String(a.dueDate ?? '9999-12-31').localeCompare(String(b.dueDate ?? '9999-12-31')))
  const recallPageCount = Math.max(1, Math.ceil(filteredRecalls.length / RECALL_PAGE_SIZE))
  const safeRecallPage = Math.min(Math.max(recallPage, 1), recallPageCount)
  const recallStartIndex = filteredRecalls.length ? (safeRecallPage - 1) * RECALL_PAGE_SIZE : 0
  const recallEndIndex = Math.min(recallStartIndex + RECALL_PAGE_SIZE, filteredRecalls.length)
  const visibleRecalls = filteredRecalls.slice(recallStartIndex, recallEndIndex)
  const sortedTreatments = [...treatments].sort((a, b) => String(b.treatmentDate || b.createdAt).localeCompare(String(a.treatmentDate || a.createdAt)))
  const treatmentPageCount = Math.max(1, Math.ceil(sortedTreatments.length / TREATMENT_PAGE_SIZE))
  const safeTreatmentPage = Math.min(Math.max(treatmentPage, 1), treatmentPageCount)
  const treatmentStartIndex = sortedTreatments.length ? (safeTreatmentPage - 1) * TREATMENT_PAGE_SIZE : 0
  const treatmentEndIndex = Math.min(treatmentStartIndex + TREATMENT_PAGE_SIZE, sortedTreatments.length)
  const visibleTreatments = sortedTreatments.slice(treatmentStartIndex, treatmentEndIndex)
  const activePrescriptions = [...prescriptions]
    .filter((item) => item.status === 'active')
    .sort((a, b) => String(b.prescriptionDate).localeCompare(String(a.prescriptionDate)))
  const latestPrescriptionDate = [...prescriptions].sort((a, b) => String(b.prescriptionDate).localeCompare(String(a.prescriptionDate)))[0]?.prescriptionDate
  const prescriptionNeedle = prescriptionQuery.trim().toLowerCase()
  const filteredPrescriptions = [...prescriptions]
    .filter((item) => prescriptionFilter === 'all' ? true : prescriptionFilter === 'active' ? item.status === 'active' : item.status !== 'active')
    .filter((item) => {
      if (!prescriptionNeedle) return true
      return [
        prescriptionName(item),
        item.instructions,
        item.notes,
        item.providerNameSnapshot,
        branchMap.get(item.branchId ?? '')?.name,
        ...prescriptionItems(item).flatMap((rxItem) => [rxItem.medication, rxItem.dosage, rxItem.frequency, rxItem.duration, rxItem.instructions]),
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(prescriptionNeedle))
    })
  const sortedPrescriptions = filteredPrescriptions.sort((a, b) => String(b.prescriptionDate).localeCompare(String(a.prescriptionDate)))
  const prescriptionPageCount = Math.max(1, Math.ceil(sortedPrescriptions.length / PRESCRIPTION_PAGE_SIZE))
  const safePrescriptionPage = Math.min(Math.max(prescriptionPage, 1), prescriptionPageCount)
  const prescriptionStartIndex = sortedPrescriptions.length ? (safePrescriptionPage - 1) * PRESCRIPTION_PAGE_SIZE : 0
  const prescriptionEndIndex = Math.min(prescriptionStartIndex + PRESCRIPTION_PAGE_SIZE, sortedPrescriptions.length)
  const visiblePrescriptions = sortedPrescriptions.slice(prescriptionStartIndex, prescriptionEndIndex)
  const recallAppointments = useMemo(() => new Map(appointments.map((item) => [item.id, item])), [appointments])
  const receiptMap = useMemo(() => new Map(receipts.map((item) => [item.paymentId, item])), [receipts])
  const paidAmount = payments.filter((item) => ['completed', 'partially_refunded', 'refunded'].includes(item.status)).reduce((sum, item) => sum + item.allocatedCents, 0)
  const recentPayments = payments.slice(0, 8)
  const paymentsWithReceipts = payments.filter((payment) => payment.status === 'completed' && receiptMap.has(payment.id))
  const visiblePaymentHistory = paymentHistoryView === 'receipts' ? paymentsWithReceipts : recentPayments
  const documentCategories = useMemo(() => Array.from(new Set(documents.map((item) => item.category))), [documents])
  const documentBranchName = (document: PatientDocument) => {
    const treatment = document.treatmentId ? treatments.find((item) => item.id === document.treatmentId) : undefined
    const record = document.clinicalVisitId ? records.find((item) => item.id === document.clinicalVisitId) : undefined
    const branchId = treatment?.branchId ?? record?.branchId
    return branchId ? branchMap.get(branchId)?.name : undefined
  }
  const recentDocumentCount = documents.filter((item) => {
    const timestamp = new Date(item.createdAt || item.uploadDate).getTime()
    return Number.isFinite(timestamp) && Date.now() - timestamp <= 30 * 24 * 60 * 60 * 1000
  }).length
  const representedDocumentBranches = new Set(documents.map(documentBranchName).filter(Boolean))
  const filteredDocuments = [...documents]
    .filter((item) => documentFilter === 'all' || item.category === documentFilter)
    .filter((item) => {
      const needle = documentQuery.trim().toLowerCase()
      if (!needle) return true
      return [item.fileName, item.description, item.category, item.fileType].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle))
    })
    .sort((a, b) => {
      if (documentSort === 'name') return a.fileName.localeCompare(b.fileName)
      const compare = String(b.uploadDate ?? b.createdAt).localeCompare(String(a.uploadDate ?? a.createdAt))
      return documentSort === 'newest' ? compare : -compare
    })
  const documentPageCount = Math.max(1, Math.ceil(filteredDocuments.length / DOCUMENT_PAGE_SIZE))
  const safeDocumentPage = Math.min(Math.max(documentPage, 1), documentPageCount)
  const documentStartIndex = filteredDocuments.length ? (safeDocumentPage - 1) * DOCUMENT_PAGE_SIZE : 0
  const documentEndIndex = Math.min(documentStartIndex + DOCUMENT_PAGE_SIZE, filteredDocuments.length)
  const visibleDocuments = filteredDocuments.slice(documentStartIndex, documentEndIndex)
  const canBookRecall = (recall: RecallQueueItem) => !recall.linkedAppointmentId && !['booked', 'completed', 'dismissed', 'cancelled'].includes(recall.status)

  useEffect(() => {
    setTreatmentPage(1)
  }, [resolvedPatientId, treatments.length])

  useEffect(() => {
    setRecordPage(1)
    setPlanPage(1)
    setRecallPage(1)
    setDocumentPage(1)
    setPrescriptionPage(1)
  }, [resolvedPatientId])

  useEffect(() => {
    setRecallPage(1)
  }, [recallFilter, recalls.length])

  useEffect(() => {
    setDocumentPage(1)
  }, [documentFilter, documentQuery, documents.length])

  useEffect(() => {
    setPrescriptionPage(1)
  }, [prescriptionFilter, prescriptionQuery, prescriptions.length])

  useEffect(() => {
    setAppointmentPage(1)
  }, [appointmentView])

  useEffect(() => {
    if (appointmentPage > appointmentPageCount) setAppointmentPage(appointmentPageCount)
  }, [appointmentPage, appointmentPageCount])

  useEffect(() => {
    if (treatmentPage > treatmentPageCount) setTreatmentPage(treatmentPageCount)
  }, [treatmentPage, treatmentPageCount])

  useEffect(() => {
    if (recordPage > recordPageCount) setRecordPage(recordPageCount)
  }, [recordPage, recordPageCount])

  useEffect(() => {
    if (planPage > planPageCount) setPlanPage(planPageCount)
  }, [planPage, planPageCount])

  useEffect(() => {
    if (recallPage > recallPageCount) setRecallPage(recallPageCount)
  }, [recallPage, recallPageCount])

  useEffect(() => {
    if (documentPage > documentPageCount) setDocumentPage(documentPageCount)
  }, [documentPage, documentPageCount])

  useEffect(() => {
    if (prescriptionPage > prescriptionPageCount) setPrescriptionPage(prescriptionPageCount)
  }, [prescriptionPage, prescriptionPageCount])

  useEffect(() => {
    if (!paySession || payMode !== 'online') return
    let cancelled = false
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const result = await checkPatientQrPayment(paySession.paymentId)
          if (cancelled) return
          if (result.completed) {
            window.clearInterval(interval)
            setPayStatus('Payment confirmed automatically. Your balance and receipt are updated.')
            setPayConfirmation({ paymentNumber: result.paymentNumber ?? paySession.paymentNumber })
            await hydratePatientPortalFromDatabase()
            if (!cancelled) setRevision((value) => value + 1)
          }
        } catch {
          // Keep polling silent. The manual status action surfaces any error to the patient.
        }
      })()
    }, 5000)
    return () => { cancelled = true; window.clearInterval(interval) }
  }, [payMode, paySession])

  if (!resolvedPatientId) return <Navigate to="/login" replace />
  if (lookupState === 'loading') return <PortalSkeleton variant="patient" message="Loading your latest clinic information" />
  if (lookupState === 'error') return <div className="pv3-loading"><strong>We could not load your portal</strong><small>{lookupError}</small></div>
  if (!patient) return <div className="pv3-loading"><strong>No patient record found</strong><small>Please contact the clinic so your account can be linked.</small></div>

  function openTab(next: TabKey) {
    setTab(next)
    setMobileNav(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function updateBooking(key: keyof typeof booking, value: string) {
    setBooking((current) => {
      if (key === 'serviceId') return { ...current, serviceId: value, startTime: '' }
      if (key === 'branchId') return { ...current, branchId: value, providerId: '', date: '', startTime: '' }
      if (key === 'providerId') return { ...current, providerId: '', startTime: '' }
      if (key === 'date') return { ...current, [key]: value, startTime: '' }
      return { ...current, [key]: value }
    })
    setBookingError(null)
  }

  function bookRecallFollowUp(recall: RecallQueueItem) {
    if (!canBookRecall(recall)) return
    const nextBooking = {
      serviceId: recall.serviceId ?? '',
      branchId: recall.branchId ?? '',
      providerId: '',
      date: recall.dueDate && recall.dueDate >= manilaToday() ? recall.dueDate : '',
      startTime: '',
      notes: `Follow-up request for: ${recall.reason || statusLabel(recall.kind)}${recall.patientMessage ? `\n${recall.patientMessage}` : ''}`,
    }
    setPendingBookingRecall(recall)
    setSelectedRecall(null)
    setBookingSuccess(null)
    setBookingError(null)
    setBooking(nextBooking)
    setBookingStep(nextBooking.serviceId ? nextBooking.branchId ? 2 : 1 : 0)
    openTab('booking')
  }

  async function bookingNext() {
    if (bookingBusy) return
    if (bookingStep === 0 && !booking.serviceId) return setBookingError('Choose a service to continue.')
    if (bookingStep === 1 && !booking.branchId) return setBookingError('Choose a clinic branch to continue.')
    if (bookingStep === 2 && (!booking.date || !booking.startTime)) return setBookingError('Choose an available date and time.')
    if (bookingStep < 3) { setBookingStep((value) => value + 1); return }
    setBookingBusy(true)
    setBookingError(null)
    try {
      await refreshPatientBookingAvailability(booking.date)
      const freshAvailability = getAppointmentAvailability({ branchId: booking.branchId, serviceId: booking.serviceId, date: booking.date })
      const slot = freshAvailability.slots.find((item) => item.startTime === booking.startTime)
    if (!slot || !selectedService) return setBookingError('That time is no longer available. Please select another slot.')
      const appointment = await createPatientPortalAppointmentPersisted({
        branchId: booking.branchId, serviceId: booking.serviceId,
        date: booking.date, startTime: booking.startTime, notes: booking.notes.trim(),
      })
      if (pendingBookingRecall) {
        await linkRecallToAppointment(pendingBookingRecall.id, appointment.id)
        await listPatientRecalls(appointment.patientId)
        setPendingBookingRecall(null)
      }
      await hydratePatientPortalFromDatabase()
      setBookingSuccess(appointment.appointmentNumber ?? appointment.id)
      setRevision((value) => value + 1)
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Unable to submit this appointment request.')
    } finally {
      setBookingBusy(false)
    }
  }

  function resetBooking() {
    setBooking({ serviceId: '', branchId: '', providerId: '', date: '', startTime: '', notes: '' })
    setBookingStep(0)
    setBookingSuccess(null)
    setBookingError(null)
    setPendingBookingRecall(null)
  }

  async function saveProfile() {
    if (profileBusy) return
    setProfileBusy(true)
    setProfileMessage(null)
    try {
      const updated = await updateMyPatientProfilePersisted({ ...profile, profileImage })
      setPatient(updated)
      setProfileEditing(false)
      setProfileMessage('Profile updated successfully.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Unable to save your profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  async function syncPatientAuthEmail(email: string) {
    const updated = await updateMyPatientProfilePersisted({ ...profile, email, profileImage })
    setPatient(updated)
    setProfile((current) => ({ ...current, email: updated.email }))
  }

  function handlePatientProfileImage(file?: File) {
    if (!file) return
    setProfilePhotoMessage(null)
    setProfileMessage(null)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProfilePhotoMessage('Upload a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfilePhotoMessage('Profile photo must be 2 MB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setProfileImage(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  }

  function choosePayment(invoiceId: string, mode: 'cash' | 'online') {
    setPayInvoiceId(invoiceId)
    setPayMode(mode)
    setPaySession(null)
    setPayError(null)
    setPayStatus(null)
    setPayConfirmation(null)
  }

  function getPatientReceiptPayload(payment: PatientPayment) {
    if (!patient) return
    if (payment.patientId !== patient.patientId) return
    const receipt = receiptMap.get(payment.id)
    const invoice = invoices.find((item) => item.id === payment.invoiceId)
    const branch = branchMap.get(receipt?.branchId ?? payment.branchId ?? invoice?.branchId ?? '')
    return { receipt, payment, invoice, patient: { name: fullName, patientId: patient.patientId }, branch }
  }

  function printPatientReceipt(payment: PatientPayment) {
    const payload = getPatientReceiptPayload(payment)
    if (!payload || !canPrintOfficialReceipt(payload)) return
    openOfficialReceiptWindow(payload)
  }

  async function downloadPatientReceipt(payment: PatientPayment) {
    const payload = getPatientReceiptPayload(payment)
    if (!payload || !canPrintOfficialReceipt(payload)) return
    await downloadOfficialReceiptPdf(payload)
  }

  async function downloadPatientDocument(document: PatientDocument) {
    setDocumentBusyId(document.id)
    setDocumentError(null)
    try {
      await downloadPatientDocumentFile(document)
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : 'Document download is unavailable.')
    } finally {
      setDocumentBusyId(null)
    }
  }

  async function startQrPayment() {
    if (!payInvoiceId || payBusy) return
    setPayBusy(true)
    setPayError(null)
    setPayStatus(null)
    try {
      const session = await createPatientQrPayment(payInvoiceId)
      setPaySession(session)
      setPayConfirmation(null)
      setPayStatus('QR ready. Payment status will refresh automatically after you pay.')
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'Unable to start online payment.')
    } finally {
      setPayBusy(false)
    }
  }

  async function checkQrStatus() {
    if (!paySession || payBusy) return
    setPayBusy(true)
    setPayError(null)
    try {
      const result = await checkPatientQrPayment(paySession.paymentId)
      if (result.completed) {
        setPayStatus('Payment confirmed. Your invoice and receipt have been updated.')
        setPayConfirmation({ paymentNumber: result.paymentNumber ?? paySession.paymentNumber })
        await hydratePatientPortalFromDatabase()
        setRevision((value) => value + 1)
      } else {
        setPayStatus('Payment is not confirmed yet. We will keep checking automatically.')
      }
    } catch (error) {
      setPayError(error instanceof Error ? error.message : 'Unable to confirm payment status.')
    } finally {
      setPayBusy(false)
    }
  }

  const pageCopy: Record<TabKey, [string, string]> = {
    dashboard: ['Overview', 'A clear snapshot of your visits, care progress and account.'],
    booking: ['Book a Visit', 'Choose a service and request a clinic appointment time.'],
    appointments: ['Appointments', 'Review upcoming and previous visits with complete appointment details.'],
    'dental-records': ['Dental Records', 'Your clinical visit records and finalized dental summaries.'],
    recalls: ['Recalls & Follow-ups', 'Recommended return visits and follow-up coordination shared by your clinic.'],
    'treatment-plans': ['Treatment Plans', 'Recommended and planned care shared by your dentist.'],
    treatments: ['Treatments', 'Procedures completed, in progress, or scheduled by your care team.'],
    prescriptions: ['Prescriptions', 'Read medication and dosage instructions issued by your dentist.'],
    payments: ['Payments & Invoices', 'Review balances and pay an issued invoice in clinic or through QR Ph.'],
    documents: ['Documents', 'Secure files your clinic has intentionally shared with you.'],
    profile: ['Profile', 'Manage contact, emergency and communication information.'],
  }

  return <div className="pv3-shell">
    <button className={`pv3-backdrop ${mobileNav ? 'is-open' : ''}`} type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)} />
    <aside className={`pv3-sidebar ${mobileNav ? 'is-open' : ''}`}>
      <div className="pv3-brand"><span>P</span><div><strong>Plamenco</strong><small>Dental Co.</small></div><button type="button" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <nav className="pv3-nav" aria-label="Patient portal navigation">
        {patientNavigationGroups.map((group) => (
          <section className="pv3-nav-section" key={group.title} aria-label={group.title}>
            <p>{group.title}</p>
            {group.keys.map((key) => {
              const item = navItemByKey.get(key)
              if (!item) return null
              const Icon = item.icon
              return <button key={item.key} type="button" className={tab === item.key ? 'is-active' : ''} onClick={() => openTab(item.key)}><Icon size={18}/><span>{item.label}</span></button>
            })}
          </section>
        ))}
      </nav>
      <div className="pv3-sidebar-footer">
        <div className="pv3-account">
          <span className="pv3-avatar" style={profileImage ? { backgroundImage: `url(${profileImage})` } : undefined}>{!profileImage && initials(fullName)}</span>
          <div><strong>{fullName}</strong><small>{patient.patientId}</small></div>
        </div>
        <div className="pv3-secure"><LockKeyhole size={15}/><span><strong>Secure patient access</strong><small>Private clinic information</small></span></div>
        <button type="button" className="pv3-signout" onClick={() => { void signOut(); navigate('/login', { replace: true }) }}><LogOut size={16}/><span>Sign out</span></button>
      </div>
    </aside>

    <main className="pv3-main">
      <header className="pv3-topbar">
        <button className="pv3-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20}/></button>
        <div className="pv3-topbar-copy"><span>{greeting()}</span><h1>{pageCopy[tab][0]}</h1><p>{pageCopy[tab][1]}</p></div>
        <div className="pv3-topbar-actions-v8"><TopbarNotificationBell className="is-patient" /><button className="pv3-top-book" onClick={() => openTab('booking')}><CalendarDays size={15}/><span>Book visit</span></button></div>
      </header>

      <div className="pv3-content">
        {tab === 'dashboard' && <section className="pv3-dashboard-v216">
          <header className="pv3-dashboard-v216-hero">
            <div className="pv3-dashboard-v216-identity">
              <PatientAvatar patient={patient} size={64} loading="eager" />
              <div><span><ShieldCheck size={14}/> Secure care overview</span><h2>{greeting()}, <strong>{patient.firstName}</strong></h2><p>Your next visit, care progress, clinic updates, and account status in one place.</p></div>
            </div>
            <div className="pv3-dashboard-v216-hero-context">
              <div><small>Today</small><time>{new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}</time></div>
              <div className="pv3-dashboard-v216-hero-actions"><Button icon={<CalendarDays size={15}/>} onClick={() => openTab('booking')}>Book visit</Button>{nextAppointment && <Button variant="secondary" icon={<CalendarCheck2 size={15}/>} onClick={() => setSelectedAppointment(nextAppointment)}>View next visit</Button>}</div>
            </div>
          </header>

          <section className="pv3-dashboard-v216-metrics" aria-label="Your care snapshot">
            <button type="button" onClick={() => openTab('appointments')}><span className="is-blue"><CalendarCheck2 size={18}/></span><div><small>Next visit</small><strong>{nextAppointment ? clinicDate(nextAppointment.date) : 'Not scheduled'}</strong><p>{nextAppointment ? timeLabel(nextAppointment.startTime) : 'Book when you are ready'}</p></div><ChevronRight size={16}/></button>
            <button type="button" onClick={() => openTab('treatment-plans')}><span className="is-green"><ClipboardList size={18}/></span><div><small>Care progress</small><strong>{activePlan ? `${planProgress}% complete` : 'No active plan'}</strong><p>{activePlan?.name || 'Plans from your dentist appear here'}</p></div><ChevronRight size={16}/></button>
            <button type="button" onClick={() => openTab('recalls')}><span className="is-amber"><HeartPulse size={18}/></span><div><small>Follow-up</small><strong>{nextRecall?.dueDate ? clinicDate(nextRecall.dueDate) : 'Nothing due'}</strong><p>{nextRecall?.reason || 'No active reminder'}</p></div><ChevronRight size={16}/></button>
            <button type="button" onClick={() => openTab('payments')}><span className={balance > 0 ? 'is-red' : 'is-green'}><CircleDollarSign size={18}/></span><div><small>Account balance</small><strong>{money(balance)}</strong><p>{openInvoices.length ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}` : 'Your account is settled'}</p></div><ChevronRight size={16}/></button>
          </section>

          <div className="pv3-dashboard-v216-priority">
            <section className="pv3-dashboard-v216-visit">
              <header><div><span><CalendarCheck2 size={15}/> Next appointment</span><h3>{nextAppointment ? serviceMap.get(nextAppointment.serviceId)?.name ?? 'Dental appointment' : 'Plan your next visit'}</h3></div>{nextAppointment && <PatientStatusBadge status={nextAppointment.status}/>}</header>
              {nextAppointment ? <div className="pv3-dashboard-v216-visit-body">
                <div className="pv3-dashboard-v216-date"><strong>{new Date(`${nextAppointment.date}T00:00:00`).getDate()}</strong><span>{new Date(`${nextAppointment.date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short' }).toUpperCase()}</span><small>{new Date(`${nextAppointment.date}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short' })}</small></div>
                <div className="pv3-dashboard-v216-visit-detail"><p>{nextAppointment.reasonForVisit || 'Your clinic is preparing for this visit.'}</p><dl>
                  <div><dt>Schedule</dt><dd><Clock3 size={14}/>{timeLabel(nextAppointment.startTime)}</dd></div>
                  <div><dt>Dentist</dt><dd><Stethoscope size={14}/>{appointmentDentistLabel(nextAppointment, providerMap)}</dd></div>
                  <div><dt>Branch</dt><dd><MapPin size={14}/>{branchMap.get(nextAppointment.branchId ?? '')?.name ?? 'Clinic branch'}</dd></div>
                </dl></div>
              </div> : <div className="pv3-dashboard-v216-visit-empty"><CalendarDays size={24}/><div><strong>No upcoming appointment</strong><p>Choose a clinic, service, and convenient time whenever you are ready.</p></div></div>}
              <footer>{nextAppointment ? <><Button icon={<CalendarCheck2 size={15}/>} onClick={() => setSelectedAppointment(nextAppointment)}>View details</Button><Button variant="secondary" icon={<CalendarDays size={15}/>} onClick={() => openTab('appointments')}>All appointments</Button></> : <Button icon={<CalendarDays size={15}/>} onClick={() => openTab('booking')}>Book a visit</Button>}</footer>
            </section>

            <aside className="pv3-dashboard-v216-actions">
              <header><span><Activity size={15}/> Action center</span><h3>Your next steps</h3><p>Everything that may need your attention.</p></header>
              {nextRecall && <button type="button" onClick={() => openTab('recalls')}><span className="is-amber"><HeartPulse size={17}/></span><div><strong>Review your follow-up</strong><small>{nextRecall.dueDate ? `Recommended ${clinicDate(nextRecall.dueDate)}` : 'Your care team left a reminder'}</small></div><ChevronRight size={16}/></button>}
              {balance > 0 && <button type="button" onClick={() => openTab('payments')}><span className="is-red"><WalletCards size={17}/></span><div><strong>Review outstanding balance</strong><small>{money(balance)} across {openInvoices.length} invoice{openInvoices.length === 1 ? '' : 's'}</small></div><ChevronRight size={16}/></button>}
              <button type="button" onClick={() => openTab('documents')}><span className="is-blue"><FileUser size={17}/></span><div><strong>Clinic-shared files</strong><small>{documents.length} document{documents.length === 1 ? '' : 's'} available securely</small></div><ChevronRight size={16}/></button>
              {!nextRecall && balance <= 0 && <div className="pv3-dashboard-v216-clear"><CheckCircle2 size={18}/><div><strong>You are all caught up</strong><small>No follow-up or payment action is waiting.</small></div></div>}
            </aside>
          </div>

          <div className="pv3-dashboard-v216-insights">
            <CareTrendChart appointments={appointments} treatments={treatments}/>
            <section className="pv3-dashboard-v216-plan">
              <header><div><span><ClipboardList size={15}/> Care roadmap</span><h3>Current treatment plan</h3></div><button type="button" onClick={() => openTab('treatment-plans')} aria-label="Open treatment plans"><ArrowRight size={17}/></button></header>
              {activePlan ? <article><div className="pv3-dashboard-v216-plan-title"><div><PatientStatusBadge status={activePlan.status}/><h4>{activePlan.name}</h4></div><strong>{planProgress}%</strong></div><p>{activePlan.description || 'Your dentist is coordinating the next stages of your care.'}</p><div className="pv3-dashboard-v216-progress" role="progressbar" aria-label="Treatment plan completion" aria-valuenow={planProgress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${planProgress}%` }}/></div><dl><div><dt>Completed care</dt><dd>{completedPlanTreatments} of {activePlan.treatments.length}</dd></div><div><dt>Plan value</dt><dd>{Number(activePlan.quotedTotalCents ?? 0) > 0 ? money(Number(activePlan.quotedTotalCents)) : 'To be confirmed'}</dd></div></dl></article> : <div className="pv3-dashboard-v216-plan-empty"><ClipboardList size={22}/><strong>No active treatment plan</strong><p>A plan will appear here when your dentist shares one.</p></div>}
            </section>
          </div>

          <div className="pv3-dashboard-v216-updates">
            <section>
              <header><div><span><FileUser size={15}/> Recent files</span><h3>Shared by your clinic</h3></div><button type="button" onClick={() => openTab('documents')}>View all <ChevronRight size={14}/></button></header>
              <div>{recentDocuments.map((document) => <article key={document.id}><span className="pv3-dashboard-v216-update-icon"><FileText size={16}/></span><div><strong>{document.fileName}</strong><p>{document.category.replaceAll('_', ' ')} - {clinicDate(document.uploadDate)}</p></div><button type="button" aria-label={`Download ${document.fileName}`} title="Download" onClick={() => void downloadPatientDocument(document)}><Download size={15}/></button></article>)}{!recentDocuments.length && <div className="pv3-dashboard-v216-mini-empty">No shared documents yet.</div>}</div>
            </section>
            <section>
              <header><div><span><Pill size={15}/> Medication</span><h3>Recent prescriptions</h3></div><button type="button" onClick={() => openTab('prescriptions')}>View all <ChevronRight size={14}/></button></header>
              <div>{recentPrescriptions.map((rx) => <button type="button" className="pv3-dashboard-v216-rx" key={rx.id} onClick={() => setSelectedPrescription(rx)}><span className="pv3-dashboard-v216-update-icon"><Pill size={16}/></span><div><strong>{prescriptionName(rx)}</strong><p>Issued {clinicDate(rx.prescriptionDate)}</p></div><PatientStatusBadge status={rx.status}/></button>)}{!recentPrescriptions.length && <div className="pv3-dashboard-v216-mini-empty">No active prescriptions right now.</div>}</div>
            </section>
          </div>
        </section>}

        {tab === ('dashboard-v134' as TabKey) && <section className="pv3-dashboard-v2">
          <DashboardGreeting
            variant="patient"
            eyebrow="Patient dashboard"
            name={patient.firstName}
            subtitle="Here's what's coming up in your dental care."
            signal="Your care view"
            icon={<HeartPulse size={18} />}
            actions={
              <>
                <button type="button" onClick={() => openTab('booking')}><CalendarDays size={15} />Book visit</button>
                {nextAppointment && <button type="button" className="is-secondary" onClick={() => setSelectedAppointment(nextAppointment)}><CalendarCheck2 size={15} />View appointment</button>}
              </>
            }
          />

          <section className="pv3-dashboard-v134-status" aria-label="Care snapshot">
            <button type="button" onClick={() => openTab('appointments')}>
              <span><CalendarCheck2 size={17}/></span>
              <div><small>Next visit</small><strong>{nextAppointment ? clinicDate(nextAppointment.date) : 'Not scheduled'}</strong></div>
            </button>
            <button type="button" onClick={() => openTab('recalls')}>
              <span><HeartPulse size={17}/></span>
              <div><small>Follow-up</small><strong>{nextRecall?.dueDate ? clinicDate(nextRecall.dueDate) : 'None due'}</strong></div>
            </button>
            <button type="button" onClick={() => openTab('treatment-plans')}>
              <span><ClipboardList size={17}/></span>
              <div><small>Care plan</small><strong>{activePlan ? `${planProgress}% progress` : 'No active plan'}</strong></div>
            </button>
            <button type="button" className={balance > 0 ? 'is-due' : 'is-clear'} onClick={() => openTab('payments')}>
              <span><CircleDollarSign size={17}/></span>
              <div><small>Balance</small><strong>{money(balance)}</strong></div>
            </button>
          </section>

          <div className="pv3-dashboard-v134-layout">
            <section className="pv3-dashboard-v134-visit">
              <header>
                <div><span>UPCOMING VISIT</span><h2>{nextAppointment ? serviceMap.get(nextAppointment.serviceId)?.name ?? 'Dental appointment' : 'Ready when you are'}</h2></div>
                {nextAppointment && <PatientStatusBadge status={nextAppointment.status} />}
              </header>
              {nextAppointment ? (
                <div className="pv3-dashboard-v134-visit-body">
                  <div className="pv3-dashboard-v134-date"><strong>{new Date(`${nextAppointment.date}T00:00:00`).getDate()}</strong><span>{new Date(`${nextAppointment.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</span></div>
                  <dl>
                    <div><dt>Time</dt><dd><Clock3 size={14}/>{timeLabel(nextAppointment.startTime)}</dd></div>
                    <div><dt>Dentist</dt><dd><Stethoscope size={14}/>{appointmentDentistLabel(nextAppointment, providerMap)}</dd></div>
                    <div><dt>Branch</dt><dd><MapPin size={14}/>{branchMap.get(nextAppointment.branchId ?? '')?.name ?? 'Clinic branch'}</dd></div>
                    <div><dt>Reference</dt><dd>{nextAppointment.appointmentNumber ?? nextAppointment.id}</dd></div>
                  </dl>
                  <div className="pv3-dashboard-v134-actions">
                    <Button onClick={() => setSelectedAppointment(nextAppointment)}>View appointment</Button>
                    <Button variant="secondary" onClick={() => openTab('appointments')}>All visits</Button>
                  </div>
                </div>
              ) : (
                <div className="pv3-dashboard-v134-empty">
                  <CalendarDays size={24}/>
                  <div><strong>No upcoming visit</strong><p>Choose a clinic time when you are ready for your next dental appointment.</p></div>
                  <Button onClick={() => openTab('booking')}>Book a visit</Button>
                </div>
              )}
            </section>

            <aside className="pv3-dashboard-v134-aside">
              <section className={`pv3-dashboard-v134-action ${balance > 0 ? 'is-attention' : ''}`}>
                <span><WalletCards size={18}/></span>
                <div>
                  <small>{balance > 0 ? 'PAYMENT ATTENTION' : 'ACCOUNT STATUS'}</small>
                  <h3>{balance > 0 ? money(balance) : 'Settled'}</h3>
                  <p>{balance > 0 ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'} awaiting payment.` : 'No outstanding balance is recorded.'}</p>
                </div>
                <button type="button" onClick={() => openTab('payments')}>{balance > 0 ? 'Review payments' : 'View receipts'} <ChevronRight size={14}/></button>
              </section>
              <section className="pv3-dashboard-v134-action">
                <span><CalendarDays size={18}/></span>
                <div><small>FAST ACTION</small><h3>Book your next visit</h3><p>Find branch availability and send a request to the clinic.</p></div>
                <button type="button" onClick={() => openTab('booking')}>Book visit <ChevronRight size={14}/></button>
              </section>
            </aside>
          </div>

          <div className="pv3-dashboard-v134-care">
            <section>
              <header><span><HeartPulse size={16}/> Recommended care</span><button type="button" onClick={() => openTab('recalls')}>Open <ChevronRight size={14}/></button></header>
              {nextRecall ? (
                <article>
                  <PatientStatusBadge status={nextRecall.status} />
                  <h3>{nextRecall.reason || (nextRecall.kind === 'follow_up' ? 'Follow-up recommended' : 'Recall reminder')}</h3>
                  <p>{nextRecall.patientMessage || 'Your clinic recommends a future return visit.'}</p>
                  <dl><div><dt>Recommended</dt><dd>{nextRecall.dueDate ? clinicDate(nextRecall.dueDate) : 'Date not set'}</dd></div><div><dt>Dentist</dt><dd>{nextRecall.providerName || 'Care team'}</dd></div></dl>
                </article>
              ) : <div className="pv3-dashboard-v134-mini-empty">No follow-up recommendation is posted right now.</div>}
            </section>

            <section>
              <header><span><ClipboardList size={16}/> Treatment plan</span><button type="button" onClick={() => openTab('treatment-plans')}>Open <ChevronRight size={14}/></button></header>
              {activePlan ? (
                <article>
                  <div className="pv3-dashboard-v134-plan-top"><PatientStatusBadge status={activePlan.status} /><strong>{planProgress}%</strong></div>
                  <h3>{activePlan.name}</h3>
                  <p>{activePlan.description || 'Your care team will share proposed care details here.'}</p>
                  <div className="pv3-progress"><i style={{width:`${planProgress}%`}}/></div>
                </article>
              ) : <div className="pv3-dashboard-v134-mini-empty">Treatment plans shared by your dentist will appear here.</div>}
            </section>
          </div>

          <div className="pv3-dashboard-v134-feed">
            <section>
              <header><div><span>RECENT FILES</span><h3>Documents shared by the clinic</h3></div><button type="button" onClick={() => openTab('documents')}>View all</button></header>
              <div>
                {recentDocuments.map((document) => <article key={document.id}><span><FileUser size={16}/></span><div><strong>{document.fileName}</strong><p>{document.category.replaceAll('_',' ')} - {clinicDate(document.uploadDate)}</p></div><button type="button" onClick={() => void downloadPatientDocument(document)}>Download</button></article>)}
                {!recentDocuments.length && <div className="pv3-dashboard-v134-mini-empty">No shared documents yet.</div>}
              </div>
            </section>
            <section>
              <header><div><span>MEDICATIONS</span><h3>Recent prescriptions</h3></div><button type="button" onClick={() => openTab('prescriptions')}>View all</button></header>
              <div>
                {recentPrescriptions.map((rx) => <article key={rx.id}><span><Pill size={16}/></span><div><strong>{prescriptionName(rx)}</strong><p>{statusLabel(rx.status)} - Issued {clinicDate(rx.prescriptionDate)}</p></div><PatientStatusBadge status={rx.status} /></article>)}
                {!recentPrescriptions.length && <div className="pv3-dashboard-v134-mini-empty">No prescriptions recorded right now.</div>}
              </div>
            </section>
          </div>
        </section>}

        {tab === ('dashboard-legacy' as TabKey) && <>
          <section className="pv3-greeting">
            <div><span className="pv3-wave">👋</span><div><p>{greeting()}</p><h2>Welcome back, <em>{patient.firstName}</em></h2><span>Here is a quick look at your dental care today.</span></div></div>
            <div className="pv3-greeting-actions"><button onClick={() => openTab('booking')}><CalendarDays size={16}/>Book a visit</button><button onClick={() => openTab('payments')}><WalletCards size={16}/>View billing</button></div>
          </section>

          <section className="pv3-kpis">
            <article><span><CalendarCheck2 size={17}/></span><div><small>NEXT VISIT</small><strong>{nextAppointment ? clinicDate(nextAppointment.date) : 'No visit'}</strong><p>{nextAppointment ? `${timeLabel(nextAppointment.startTime)} · ${serviceMap.get(nextAppointment.serviceId)?.name ?? 'Appointment'}` : 'Book when you are ready'}</p></div></article>
            <article><span><HeartPulse size={17}/></span><div><small>NEXT FOLLOW-UP</small><strong>{nextRecall?.dueDate ? clinicDate(nextRecall.dueDate) : 'None due'}</strong><p>{nextRecall ? statusLabel(nextRecall.status) : 'No active recall on file'}</p></div></article>
            <article className={balance > 0 ? 'is-due' : ''}><span><CircleDollarSign size={17}/></span><div><small>OUTSTANDING</small><strong>{money(balance)}</strong><p>{openInvoices.length ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}` : 'Your account is settled'}</p></div></article>
            <article><span><FileText size={17}/></span><div><small>SHARED RECORDS</small><strong>{records.length + documents.length}</strong><p>{records.length} clinical · {documents.length} documents</p></div></article>
          </section>

          <div className="pv3-dashboard-grid">
            <CareTrendChart appointments={appointments} treatments={treatments}/>
            <section className="pv3-panel pv3-next-panel"><div className="pv3-panel-head"><div><span>NEXT APPOINTMENT</span><h3>Your upcoming visit</h3></div><button onClick={() => openTab('appointments')}>View all <ChevronRight size={14}/></button></div>{nextAppointment ? <div className="pv3-next-card"><div className="pv3-date-tile"><strong>{new Date(`${nextAppointment.date}T00:00:00`).getDate()}</strong><span>{new Date(`${nextAppointment.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</span></div><div><PatientStatusBadge status={nextAppointment.status} /><h4>{serviceMap.get(nextAppointment.serviceId)?.name ?? 'Dental appointment'}</h4><p><Clock3 size={14}/>{timeLabel(nextAppointment.startTime)}</p><p><MapPin size={14}/>{branchMap.get(nextAppointment.branchId ?? '')?.name ?? 'Clinic branch'}</p></div></div> : <EmptyState icon={CalendarDays} title="No upcoming visit" copy="Choose a clinic time whenever you are ready." action={<Button size="sm" onClick={() => openTab('booking')}>Book a visit</Button>}/>}</section>
          </div>

          <div className="pv3-dashboard-grid lower">
            <section className="pv3-panel"><div className="pv3-panel-head"><div><span>TREATMENT PLAN</span><h3>Current care plan</h3></div><button onClick={() => openTab('treatment-plans')}>Details <ChevronRight size={14}/></button></div>{plans[0] ? <div className="pv3-plan-summary"><div><strong>{plans[0].name}</strong><PatientStatusBadge status={plans[0].status} /></div><p>{plans[0].description || 'Your treatment plan is being coordinated by your dentist.'}</p><div className="pv3-progress"><i style={{width:`${planProgress}%`}}/></div><footer><span>{planProgress}% complete</span>{Number(plans[0].quotedTotalCents ?? 0) > 0 && <strong>{money(Number(plans[0].quotedTotalCents))}</strong>}</footer></div> : <EmptyState icon={HeartPulse} title="No active care plan" copy="Your dentist will publish a treatment plan here when appropriate."/>}</section>
            <section className="pv3-panel"><div className="pv3-panel-head"><div><span>RECENT ACTIVITY</span><h3>Latest updates</h3></div></div><div className="pv3-activity">{[
              ...appointments.slice(-2).map((item) => ({ key:`a-${item.id}`, title:'Appointment update', copy:`${serviceMap.get(item.serviceId)?.name ?? 'Visit'} · ${statusLabel(item.status)}`, date:item.date, Icon:CalendarDays })),
              ...payments.slice(-2).map((item) => ({ key:`p-${item.id}`, title:'Payment recorded', copy:`${money(item.amountCents)} · ${statusLabel(item.status)}`, date:item.date, Icon:CreditCard })),
              ...records.slice(-2).map((item) => ({ key:`r-${item.id}`, title:'Dental summary shared', copy:item.chiefComplaint || 'Clinical summary', date:item.recordDate, Icon:FileText })),
              ...recalls.slice(0,2).map((item) => ({ key:`f-${item.id}`, title:item.kind === 'follow_up' ? 'Follow-up recommended' : 'Recall reminder', copy:item.reason || statusLabel(item.status), date:item.dueDate ?? item.createdAt, Icon:HeartPulse })),
            ].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,5).map((item)=><div key={item.key}><span><item.Icon size={15}/></span><section><strong>{item.title}</strong><p>{item.copy}</p></section><small>{clinicDate(item.date)}</small></div>)}{!appointments.length&&!payments.length&&!records.length&&!recalls.length&&<EmptyState icon={Activity} title="Nothing new yet" copy="Clinic activity will appear here."/>}</div></section>
          </div>
        </>}

        {tab === 'booking' && <section className="pv3-page pv3-booking-v3">
          <PageHead eyebrow="GUIDED BOOKING" title="Book a visit" copy="Choose one step at a time. The clinic will assign the dentist after reviewing your request."/>
          {bookingSuccess ? <div className="pv3-success"><span><CheckCircle2 size={30}/></span><h2>Appointment request sent</h2><p>Reference <strong>{bookingSuccess}</strong> is now waiting for clinic confirmation.</p><div><Button onClick={() => openTab('appointments')}>View appointments</Button><Button variant="secondary" onClick={resetBooking}>Book another</Button></div></div> : <div className="pv3-booking-shell-v3">
            <section className="pv3-book-stage">
              <div className="pv3-book-progress-v3">{['Service','Branch','Date & time','Review'].map((label,index)=><div key={label} className={index < bookingStep ? 'is-complete' : index === bookingStep ? 'is-current' : ''}><span>{index < bookingStep ? <Check size={13}/> : index+1}</span><small>{label}</small></div>)}</div>
              {bookingError && <div className="pv3-alert is-error">{bookingError}</div>}
              <div className="pv3-book-step-card">
                {bookingStep===0&&<><div className="pv3-step-title"><span><Stethoscope size={18}/></span><div><h3>Choose the reason for your visit</h3><p>Select a service from the clinic catalog. Fees and durations stay connected to the same internal service records.</p></div></div><div className="pv3-service-grid pv3-picker-grid">{services.map((service)=><button type="button" key={service.id} className={booking.serviceId===service.id?'is-selected':''} onClick={()=>updateBooking('serviceId',service.id)}><span className="pv3-service-icon"><Stethoscope size={18}/></span><div><strong>{service.name}</strong><p>{service.description || 'Dental service'}</p><small>{service.duration} min</small></div><b>{serviceMoney(service.price)}</b></button>)}</div>{!services.length&&<div className="pv3-inline-empty">No online-bookable services are available right now. Please contact the clinic.</div>}</>}
                {bookingStep===1&&<><div className="pv3-step-title"><span><MapPin size={18}/></span><div><h3>Choose your clinic branch</h3><p>Pick the location where you want this appointment to happen.</p></div></div><div className="pv3-choice-grid pv3-picker-grid">{branches.map((branch)=><button type="button" key={branch.id} className={booking.branchId===branch.id?'is-selected':''} onClick={()=>updateBooking('branchId',branch.id)}><MapPin size={20}/><strong>{branch.name}</strong><small>{[branch.city,branch.province].filter(Boolean).join(', ') || 'Plamenco Dental Co.'}</small></button>)}</div>{!branches.length&&<div className="pv3-inline-empty">No active branches are available for online booking.</div>}</>}
                {bookingStep===2&&<><div className="pv3-step-title"><span><CalendarDays size={18}/></span><div><h3>Pick a date and time</h3><p>Times are based on branch hours, clinic capacity, and existing appointments. Your dentist is assigned after review.</p></div></div><div className="pv3-schedule-picker"><label className="pv3-field pv3-date-field"><span>Preferred date</span><input type="date" min={manilaToday()} value={booking.date} onChange={(e)=>updateBooking('date',e.target.value)}/></label><div className="pv3-slot-grid">{availability.slots.map((slot)=><button type="button" key={`branch-${slot.startTime}-${slot.operatoryId ?? 'none'}`} className={booking.startTime===slot.startTime?'is-selected':''} onClick={()=>{setBooking((current)=>({...current,startTime:slot.startTime,providerId:''}));setBookingError(null)}}><Clock3 size={15}/><strong>{timeLabel(slot.startTime)}</strong><small>Dentist to be assigned</small></button>)}</div></div>{booking.date&&!availability.slots.length&&<div className="pv3-inline-empty">No clinic times are available then. Choose another time or date.</div>}</>}
                {bookingStep===3&&<><div className="pv3-step-title"><span><ShieldCheck size={18}/></span><div><h3>Review your appointment request</h3><p>The clinic will coordinate the dentist and confirm your visit.</p></div></div><div className="pv3-review-grid pv3-review-v3"><div><span>Service</span><strong>{selectedService?.name ?? '—'}</strong></div><div><span>Dentist</span><strong>To be assigned</strong></div><div><span>Branch</span><strong>{selectedBranch?.name ?? '—'}</strong></div><div><span>Date</span><strong>{clinicDate(booking.date)}</strong></div><div><span>Time</span><strong>{timeLabel(booking.startTime)}</strong></div><div><span>Estimated amount</span><strong>{selectedService?serviceMoney(selectedService.price):'—'}</strong></div></div><label className="pv3-field"><span>Notes for the clinic</span><textarea rows={4} value={booking.notes} onChange={(e)=>updateBooking('notes',e.target.value)} placeholder="Symptoms, concerns, or anything your care team should know."/></label><div className="pv3-info-note"><Banknote size={17}/><div><strong>Payment is handled after billing</strong><p>Once the clinic issues an invoice, you can pay in person or through QR Ph from Payments.</p></div></div></>}
              </div>
              <footer className="pv3-book-actions pv3-book-actions-v3"><Button variant="secondary" disabled={bookingStep===0||bookingBusy} onClick={()=>setBookingStep((step)=>Math.max(0,step-1))}><ChevronLeft size={15}/>Back</Button><Button disabled={bookingBusy||bookingAvailabilityBusy} onClick={()=>void bookingNext()}>{bookingBusy?'Submitting...':bookingAvailabilityBusy?'Refreshing slots...':bookingStep===3?'Confirm request':'Continue'}{bookingStep<3&&<ArrowRight size={15}/>}</Button></footer>
            </section>
            <aside className="pv3-book-summary-v3"><span>VISIT SUMMARY</span><h3>{selectedService?.name ?? 'Your next dental visit'}</h3><p>{selectedService?.description || 'Your choices appear here as you move through booking.'}</p><dl><div><dt>Branch</dt><dd>{selectedBranch?.name ?? 'Choose a branch'}</dd></div><div><dt>Dentist</dt><dd>To be assigned</dd></div><div><dt>Schedule</dt><dd>{booking.date?`${clinicDate(booking.date)} - ${timeLabel(booking.startTime)}`:'Choose date and time'}</dd></div><div><dt>Estimated amount</dt><dd>{selectedService?serviceMoney(selectedService.price):'—'}</dd></div></dl><small>Your visit is pending until the clinic confirms and assigns a dentist.</small></aside>
          </div>}
        </section>}

        {tab === ('booking-legacy' as TabKey) && <section className="pv3-page">
          <PageHead eyebrow="APPOINTMENT REQUEST" title="Book your next visit" copy="A guided booking experience connected to your clinic's live service catalog and branch appointment capacity."/>
          {bookingSuccess ? <div className="pv3-success"><span><CheckCircle2 size={30}/></span><h2>Appointment request sent</h2><p>Reference <strong>{bookingSuccess}</strong> is now waiting for clinic confirmation.</p><div><Button onClick={() => openTab('appointments')}>View appointments</Button><Button variant="secondary" onClick={resetBooking}>Book another</Button></div></div> : <div className="pv3-book-layout">
            <section className="pv3-panel pv3-book-card">
              <div className="pv3-book-steps">{['Service','Branch','Schedule','Review'].map((label,index)=><div key={label} className={index <= bookingStep ? 'is-active' : ''}><span>{index < bookingStep ? <Check size={13}/> : index+1}</span><small>{label}</small></div>)}</div>
              {bookingError && <div className="pv3-alert is-error">{bookingError}</div>}
              <div className="pv3-book-body">
                {bookingStep===0&&<><div className="pv3-step-title"><span><Stethoscope size={18}/></span><div><h3>Select a service</h3><p>Prices are pulled from the same clinic service catalog used by internal portals.</p></div></div><div className="pv3-service-grid">{services.map((service)=><button key={service.id} className={booking.serviceId===service.id?'is-selected':''} onClick={()=>updateBooking('serviceId',service.id)}><span className="pv3-service-icon"><Stethoscope size={18}/></span><div><strong>{service.name}</strong><p>{service.description || 'Dental service'}</p><small>{service.duration} min</small></div><b>{serviceMoney(service.price)}</b></button>)}</div></>}
                {bookingStep===1&&<><div className="pv3-step-title"><span><MapPin size={18}/></span><div><h3>Choose a clinic branch</h3><p>Select the branch that is most convenient for your visit.</p></div></div><div className="pv3-choice-grid">{branches.map((branch)=><button key={branch.id} className={booking.branchId===branch.id?'is-selected':''} onClick={()=>updateBooking('branchId',branch.id)}><MapPin size={20}/><strong>{branch.name}</strong><small>{[branch.city,branch.province].filter(Boolean).join(', ') || 'Plamenco Dental Co.'}</small></button>)}</div></>}
                {bookingStep===2&&<><div className="pv3-step-title"><span><CalendarDays size={18}/></span><div><h3>Pick a date and time</h3><p>Times are based on branch hours, clinic capacity, and existing appointments.</p></div></div><label className="pv3-field pv3-date-field"><span>Preferred date</span><input type="date" min={manilaToday()} value={booking.date} onChange={(e)=>updateBooking('date',e.target.value)}/></label><div className="pv3-slot-grid">{availability.slots.map((slot)=><button key={`branch-${slot.startTime}-${slot.operatoryId ?? 'none'}`} className={booking.startTime===slot.startTime?'is-selected':''} onClick={()=>{setBooking((current)=>({...current,startTime:slot.startTime,providerId:''}));setBookingError(null)}}><Clock3 size={15}/><strong>{timeLabel(slot.startTime)}</strong><small>Dentist to be assigned</small></button>)}</div>{booking.date&&!availability.slots.length&&<div className="pv3-inline-empty">No clinic times are available then. Choose another time or date.</div>}</>}
                {bookingStep===3&&<><div className="pv3-step-title"><span><ShieldCheck size={18}/></span><div><h3>Review appointment</h3><p>The clinic will coordinate the dentist and confirm your visit.</p></div></div><div className="pv3-review-grid"><div><span>Service</span><strong>{selectedService?.name ?? '—'}</strong></div><div><span>Estimated fee</span><strong>{selectedService?serviceMoney(selectedService.price):'—'}</strong></div><div><span>Branch</span><strong>{selectedBranch?.name ?? '—'}</strong></div><div><span>Dentist</span><strong>To be assigned</strong></div><div><span>Date</span><strong>{clinicDate(booking.date)}</strong></div><div><span>Time</span><strong>{timeLabel(booking.startTime)}</strong></div></div><label className="pv3-field"><span>Notes for the clinic</span><textarea rows={4} value={booking.notes} onChange={(e)=>updateBooking('notes',e.target.value)} placeholder="Symptoms, concerns, or anything your care team should know."/></label><div className="pv3-info-note"><Banknote size={17}/><div><strong>Payment is handled after billing</strong><p>Once the clinic issues an invoice, you can pay in person or through QR Ph from Payments.</p></div></div></>}
              </div>
              <footer className="pv3-book-actions"><Button variant="secondary" disabled={bookingStep===0||bookingBusy} onClick={()=>setBookingStep((step)=>Math.max(0,step-1))}><ChevronLeft size={15}/>Back</Button><Button disabled={bookingBusy} onClick={()=>void bookingNext()}>{bookingBusy?'Submitting request...':bookingStep===3?'Confirm request':'Continue'}{bookingStep<3&&<ArrowRight size={15}/>}</Button></footer>
            </section>
            <aside className="pv3-panel pv3-book-summary"><span>VISIT SUMMARY</span><h3>{selectedService?.name ?? 'Your next dental visit'}</h3><p>{selectedService?.description || 'Build your appointment step by step.'}</p><div className="pv3-book-price"><span>Estimated fee</span><strong>{selectedService?serviceMoney(selectedService.price):'—'}</strong></div><ul><li><MapPin size={15}/><span>{selectedBranch?.name ?? 'Choose a branch'}</span></li><li><Stethoscope size={15}/><span>To be assigned</span></li><li><CalendarDays size={15}/><span>{booking.date?`${clinicDate(booking.date)} · ${timeLabel(booking.startTime)}`:'Choose a time'}</span></li></ul><small>Your visit is pending until the clinic confirms and assigns a dentist.</small></aside>
          </div>}
        </section>}

        {tab === 'appointments' && <section className="pv3-page pv3-appointments-v3 pv3-care-page-v217 pv3-care-appointments-v217">
          <PageHead eyebrow="YOUR VISITS" title="Appointments" copy="Upcoming, past and cancelled requests, with patient-safe appointment details." action={<Button size="sm" onClick={()=>openTab('booking')}>Book a visit</Button>}/>
          <section className="pv3-appointments-v135-summary" aria-label="Appointment summary">
            <button type="button" className={appointmentView==='upcoming'?'is-active':''} onClick={()=>setAppointmentView('upcoming')}>
              <span><CalendarDays size={17}/></span>
              <div><small>Upcoming</small><strong>{appointmentGroups.upcoming.length}</strong><p>{nextAppointment ? `${clinicDate(nextAppointment.date)} at ${timeLabel(nextAppointment.startTime)}` : 'No visit scheduled'}</p></div>
            </button>
            <button type="button" className={appointmentView==='past'?'is-active':''} onClick={()=>setAppointmentView('past')}>
              <span><CheckCircle2 size={17}/></span>
              <div><small>Past visits</small><strong>{appointmentGroups.past.length}</strong><p>{appointmentGroups.past[0] ? `Latest ${clinicDate(appointmentGroups.past[0].date)}` : 'No past visits yet'}</p></div>
            </button>
            <button type="button" className={appointmentView==='cancelled'?'is-active is-muted':''} onClick={()=>setAppointmentView('cancelled')}>
              <span><X size={17}/></span>
              <div><small>Cancelled / missed</small><strong>{appointmentGroups.cancelled.length}</strong><p>Kept here for your records</p></div>
            </button>
          </section>
          <section className="pv3-appointments-v135-board">
            <header>
              <div>
                <span>VISIT TIMELINE</span>
                <h3>{appointmentView === 'upcoming' ? 'Upcoming appointments' : appointmentView === 'past' ? 'Past appointments' : 'Cancelled and missed visits'}</h3>
                <p>{filteredAppointments.length ? `${filteredAppointments.length} appointment${filteredAppointments.length === 1 ? '' : 's'} in this view.` : 'Nothing to show in this view right now.'}</p>
              </div>
              <div className="pv3-appointment-tabs pv3-appointments-v135-tabs" role="tablist" aria-label="Appointment sections">
                {([
                  ['upcoming','Upcoming',appointmentGroups.upcoming.length],
                  ['past','Past',appointmentGroups.past.length],
                  ['cancelled','Cancelled',appointmentGroups.cancelled.length],
                ] as const).map(([key,label,count])=><button key={key} type="button" role="tab" aria-selected={appointmentView===key} className={appointmentView===key?'is-active':''} onClick={()=>setAppointmentView(key)}><span>{label}</span><strong>{count}</strong></button>)}
              </div>
            </header>
            <div className="pv3-appointment-list pv3-appointment-list-v3 pv3-appointments-v135-list">
              {visibleAppointments.map((item)=><button type="button" key={item.id} className={`pv3-appointment-card pv3-appointment-card-v3 pv3-appointments-v135-card is-${item.status}${appointmentNeedsClinicUpdate(item) ? ' is-awaiting-clinic-update' : ''}`} onClick={()=>setSelectedAppointment(item)}>
                <div className="pv3-appointments-v135-date"><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</span><small>{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-PH',{weekday:'short'})}</small></div>
                <section>
                  <div className="pv3-appointments-v135-card-top"><PatientStatusBadge status={item.status} /><small>{item.appointmentNumber ?? item.id}</small>{appointmentNeedsClinicUpdate(item)&&<span className="pv3-appointment-update-pending"><Clock3 size={12}/>Clinic update pending</span>}</div>
                  <h3>{serviceMap.get(item.serviceId)?.name ?? 'Dental appointment'}</h3>
                  <dl>
                    <div><dt>Time</dt><dd><Clock3 size={14}/>{timeLabel(item.startTime)}</dd></div>
                    <div><dt>Dentist</dt><dd><Stethoscope size={14}/>{appointmentDentistLabel(item, providerMap)}</dd></div>
                    <div><dt>Branch</dt><dd><MapPin size={14}/>{branchMap.get(item.branchId ?? '')?.name ?? 'Clinic branch'}</dd></div>
                  </dl>
                </section>
                <aside>
                  <PatientStatusBadge status={item.paymentStatus ?? 'not_billed'} variant="compact" />
                  <span>View details <ChevronRight size={16}/></span>
                </aside>
              </button>)}
              {!visibleAppointments.length&&<EmptyState icon={CalendarDays} title={appointmentView==='upcoming'?'No upcoming appointments':appointmentView==='past'?'No past appointments yet':'No cancelled appointments'} copy={appointmentView==='upcoming'?'When you book or receive confirmation for a future visit, it will appear here.':appointmentView==='past'?'Completed visits and older appointments awaiting a clinic update will appear here.':'Cancelled, rejected or missed appointments will appear here for reference.'} action={appointmentView==='upcoming'?<Button onClick={()=>openTab('booking')}>Book appointment</Button>:undefined}/>}
            </div>
            {filteredAppointments.length > APPOINTMENT_PAGE_SIZE && <div className="pv3-contained-pagination"><span>Showing {appointmentStartIndex + 1}-{appointmentEndIndex} of {filteredAppointments.length}</span><Pagination page={safeAppointmentPage} pageCount={appointmentPageCount} onPageChange={setAppointmentPage} label="Appointment timeline pagination" /></div>}
          </section>
        </section>}

        {tab === ('appointments-legacy' as TabKey) && <section className="pv3-page">
          <PageHead eyebrow="YOUR VISITS" title="Appointments" copy="Every upcoming and previous appointment, with clinic status and complete visit details." action={<Button size="sm" onClick={()=>openTab('booking')}>Book a visit</Button>}/>
          <div className="pv3-appointment-stats"><div><span>Upcoming</span><strong>{appointments.filter((item)=>!['completed','cancelled','no_show','rejected'].includes(item.status)).length}</strong></div><div><span>Completed</span><strong>{appointments.filter((item)=>item.status==='completed').length}</strong></div><div><span>Total visits</span><strong>{appointments.length}</strong></div></div>
          <div className="pv3-appointment-list">{[...appointments].sort((a,b)=>`${b.date}T${b.startTime}`.localeCompare(`${a.date}T${a.startTime}`)).map((item)=><button key={item.id} className="pv3-appointment-card" onClick={()=>setSelectedAppointment(item)}><div className="pv3-date-tile"><strong>{new Date(`${item.date}T00:00:00`).getDate()}</strong><span>{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-PH',{month:'short'}).toUpperCase()}</span></div><section><div><PatientStatusBadge status={item.status} /><small>{item.appointmentNumber ?? item.id}</small></div><h3>{serviceMap.get(item.serviceId)?.name ?? 'Dental appointment'}</h3><p><Clock3 size={14}/>{timeLabel(item.startTime)}<span>•</span><MapPin size={14}/>{branchMap.get(item.branchId ?? '')?.name ?? 'Clinic branch'}</p></section><aside><span>{appointmentDentistLabel(item, providerMap)}</span><PatientStatusBadge status={item.paymentStatus ?? 'not_billed'} variant="compact" /><ChevronRight size={17}/></aside></button>)}{!appointments.length&&<EmptyState icon={CalendarDays} title="No appointments yet" copy="When you book your first visit, it will appear here." action={<Button onClick={()=>openTab('booking')}>Book appointment</Button>}/>}</div>
        </section>}

        {tab === 'dental-records' && <section className="pv3-page pv3-clinical-history-v4 pv3-care-page-v217 pv3-care-records-v217 pv3-care-page-v218 care218-records">
          <CareWorkspaceHero icon={FileText} eyebrow="Clinical archive" title="Dental Records" copy="A private timeline of the clinical summaries your care team has released to you." className="care218-hero-records" facts={[
            { label: 'Shared records', value: records.length, note: 'Visible in your portal' },
            { label: 'Finalized', value: records.filter((item)=>['finalized','amended'].includes(item.status)).length, note: 'Clinic-reviewed summaries', tone: 'success' },
            { label: 'Latest visit', value: sortedRecords[0]?clinicDate(sortedRecords[0].recordDate):'None yet', note: 'Most recent entry' },
          ]}/>
          <section className="pv3-history-panel">
            <header><div><span>VISIT DOCUMENTATION</span><h3>Your clinical timeline</h3><p>Open an entry to review the diagnosis, findings, treatment and follow-up shared by your clinic.</p></div><div className="care218-privacy-note"><ShieldCheck size={16}/><span>Only finalized patient-visible records appear here.</span></div></header>
            <div className="pv3-history-timeline">
              {visibleRecords.map((record)=><button type="button" key={record.id} onClick={()=>setSelectedRecord(record)}><span className="pv3-history-dot"><FileText size={17}/></span><section><div><PatientStatusBadge status={record.status} /><small>{clinicDate(record.recordDate)}</small></div><h3>{record.chiefComplaint || 'Dental visit summary'}</h3><p>{record.visitType.replaceAll('_',' ')}{record.followUpDate?` - Follow-up ${clinicDate(record.followUpDate)}`:''}</p></section><ChevronRight size={18}/></button>)}
              {!records.length&&<EmptyState icon={FileText} title="No shared dental records" copy="Your dentist can publish patient-visible visit summaries here after care is finalized."/>}
            </div>
            {sortedRecords.length > RECORD_PAGE_SIZE && <div className="pv3-contained-pagination"><span>Showing {recordStartIndex + 1}-{recordEndIndex} of {sortedRecords.length}</span><Pagination page={safeRecordPage} pageCount={recordPageCount} onPageChange={setRecordPage} label="Dental record timeline pagination" /></div>}
          </section>
        </section>}

        {tab === ('dental-records-legacy' as TabKey) && <section className="pv3-page">
          <PageHead eyebrow="CLINICAL SUMMARIES" title="Dental Records" copy="Finalized patient-visible summaries from your clinical visits. Click a record to view details."/>
          <div className="pv3-record-overview"><div><FileText size={20}/><span><strong>{records.length}</strong><small>Shared records</small></span></div><div><CheckCircle2 size={20}/><span><strong>{records.filter((item)=>['finalized','amended'].includes(item.status)).length}</strong><small>Finalized summaries</small></span></div><div><CalendarCheck2 size={20}/><span><strong>{records[0]?clinicDate(records[0].recordDate):'—'}</strong><small>Most recent record</small></span></div></div>
          <div className="pv3-record-list">{records.map((record)=><button key={record.id} onClick={()=>setSelectedRecord(record)}><span className="pv3-record-icon"><FileText size={19}/></span><section><div><PatientStatusBadge status={record.status} /><small>{clinicDate(record.recordDate)}</small></div><h3>{record.chiefComplaint || 'Dental visit summary'}</h3><p>{record.visitType.replaceAll('_',' ')}{record.followUpDate?` · Follow-up ${clinicDate(record.followUpDate)}`:''}</p></section><ChevronRight size={18}/></button>)}{!records.length&&<EmptyState icon={FileText} title="No shared dental records" copy="Your dentist can publish patient-visible visit summaries here after care is finalized."/>}</div>
        </section>}

        {tab === 'recalls' && <section className="pv3-page pv3-recalls-v5 pv3-care-page-v217 pv3-care-recalls-v217 pv3-care-page-v218 care218-recalls">
          <CareWorkspaceHero icon={HeartPulse} eyebrow="Return-care agenda" title="Recalls & Follow-Ups" copy="Keep recommended checkups and post-treatment reviews moving without losing the clinical context." className="care218-hero-recalls" action={<Button size="sm" onClick={()=>openTab('booking')}><CalendarDays size={15}/>Book a visit</Button>} facts={[
            { label: 'Active recommendations', value: recalls.filter((item)=>!['completed','dismissed','cancelled'].includes(item.status)).length, note: 'Need your attention', tone: 'warning' },
            { label: 'Next recommended', value: nextRecall?.dueDate ? clinicDate(nextRecall.dueDate) : 'None', note: 'Suggested return date' },
            { label: 'Already booked', value: recalls.filter((item)=>item.status==='booked'||Boolean(item.linkedAppointmentId)).length, note: 'Connected appointments', tone: 'success' },
          ]}/>
          <div className="pv3-care-toolbar">
            {([
              ['upcoming','Upcoming'],
              ['due_soon','Due soon'],
              ['completed','Completed'],
              ['all','All'],
            ] as const).map(([key,label])=><button key={key} type="button" className={recallFilter===key?'is-active':''} onClick={()=>setRecallFilter(key)}>{label}</button>)}
          </div>
          <div className="pv3-recall-list-v5">
            {visibleRecalls.map((item: RecallQueueItem)=>{
              const linkedAppointment = item.linkedAppointmentId ? recallAppointments.get(item.linkedAppointmentId) : undefined
              const relatedTreatment = item.sourceId ? treatments.find((treatment)=>treatment.id === item.sourceId) : undefined
              const branchName = item.branchId ? branchMap.get(item.branchId)?.name : ''
              const title = item.reason || (item.kind === 'follow_up' ? 'Follow-up recommended' : 'Recall reminder')
              return (
                <article
                  key={item.id}
                  className="pv3-recall-card-v5"
                  role="button"
                  tabIndex={0}
                  aria-label={`Open recall details for ${title}`}
                  onClick={()=>setSelectedRecall(item)}
                  onKeyDown={(event)=>{
                    if(event.key==='Enter'||event.key===' '){
                      event.preventDefault()
                      setSelectedRecall(item)
                    }
                  }}
                >
                  <span className="pv3-recall-icon-v5"><HeartPulse size={19}/></span>
                  <section className="pv3-recall-main-v5">
                    <div className="pv3-recall-card-top-v5"><PatientStatusBadge status={item.status} />{getRecallDueBucket(item)==='overdue'&&<PatientStatusBadge status="overdue" />}<small>{item.kind.replaceAll('_',' ')}</small></div>
                    <h3>{title}</h3>
                    <p>{item.patientMessage || 'Your clinic recommends a return visit.'}</p>
                    <dl>
                      <div><dt>Recommended</dt><dd>{item.dueDate ? clinicDate(item.dueDate) : 'No date set'}</dd></div>
                      <div><dt>Dentist</dt><dd>{item.providerName || 'Care team'}</dd></div>
                      <div><dt>Related care</dt><dd>{relatedTreatment?.serviceNameSnapshot || (item.sourceId ? `${item.sourceType.replaceAll('_',' ')} ${item.sourceId}` : item.sourceType.replaceAll('_',' '))}</dd></div>
                      <div><dt>Branch</dt><dd>{branchName || 'Clinic branch'}</dd></div>
                    </dl>
                  </section>
                  <aside className="pv3-recall-action-v5">
                    {linkedAppointment ? <span className="pv3-linked-appointment-v5">Booked: {linkedAppointment.appointmentNumber ?? linkedAppointment.id}</span> : <span>{item.linkedAppointmentId ? `Appointment ${item.linkedAppointmentId}` : 'Not booked'}</span>}
                    {canBookRecall(item)&&<button type="button" onClick={(event)=>{event.stopPropagation();bookRecallFollowUp(item)}} onKeyDown={(event)=>event.stopPropagation()}><CalendarDays size={14}/>Book follow-up</button>}
                    <b>Details <ChevronRight size={15}/></b>
                  </aside>
                </article>
              )
            })}
            {!visibleRecalls.length&&<EmptyState icon={HeartPulse} title={recalls.length ? 'No recommendations in this view' : 'No recalls or follow-ups'} copy={recalls.length ? 'Try another status filter to review older recommendations.' : 'When your clinic recommends a future return visit, it will appear here.'} action={!recalls.length?<Button onClick={()=>openTab('booking')}>Book a visit</Button>:undefined}/>}
          </div>
          {filteredRecalls.length > RECALL_PAGE_SIZE && <div className="pv3-contained-pagination"><span>Showing {recallStartIndex + 1}-{recallEndIndex} of {filteredRecalls.length}</span><Pagination page={safeRecallPage} pageCount={recallPageCount} onPageChange={setRecallPage} label="Recall recommendations pagination" /></div>}
        </section>}

        {tab === 'treatment-plans' && <section className="pv3-page pv3-treatments-v4 pv3-care-page-v217 pv3-care-plans-v217 pv3-care-page-v218 care218-plans">
          <CareWorkspaceHero icon={ClipboardList} eyebrow="Care roadmap" title="Treatment Plans" copy="Understand what your dentist recommends, what has been decided, and what comes next." className="care218-hero-plans" facts={[
            { label: 'Current progress', value: `${planProgress}%`, note: activePlan ? `${completedPlanTreatments} completed care item${completedPlanTreatments===1?'':'s'}` : 'No active plan' },
            { label: 'Current plan', value: activePlan?.name ?? 'Not started', note: activePlan?.description || 'No plan shared yet' },
            { label: 'Proposed items', value: activePlan?.treatments.length ?? 0, note: activePlan ? statusLabel(activePlan.status) : 'Awaiting recommendation', tone: activePlan ? 'warning' : 'default' },
          ]}/>
          <div className="care218-progress-track" aria-label={`Treatment plan ${planProgress}% complete`}><span style={{width:`${planProgress}%`}}/></div>
          <section className="pv3-treatment-panel-v4">
            <header><div><span>TREATMENT PLAN REGISTRY</span><h3>Recommended care roadmap</h3><p>Plans are proposals and estimates. Accepted recommendations do not become completed treatment automatically.</p></div></header>
            <div className="pv3-treatment-cards-v4">
              {visiblePlans.map((plan,index)=><article key={plan.id}><div className="pv3-treatment-marker">{planStartIndex+index+1}</div><section><div><PatientStatusBadge status={plan.status} />{plan.planNumber&&<small>{plan.planNumber}</small>}</div><h3>{plan.name || 'Treatment plan'}</h3><p>{plan.description || 'Recommended care prepared by your dentist.'}</p><dl><div><dt>Dentist</dt><dd>{plan.providerNameSnapshot || providerMap.get(plan.providerId ?? '')?.displayName || 'Care team'}</dd></div><div><dt>Presented</dt><dd>{plan.presentedAt?clinicDate(plan.presentedAt):clinicDate(plan.createdAt)}</dd></div><div><dt>Estimate</dt><dd>{Number(plan.quotedTotalCents??0)>0?money(Number(plan.quotedTotalCents)):Number(plan.overallCost)>0?money(Math.round(Number(plan.overallCost)*100)):'To be confirmed'}</dd></div></dl><small>{plan.treatments.length ? `${plan.treatments.length} linked proposed item${plan.treatments.length===1?'':'s'}` : 'No linked procedure items yet'}</small></section></article>)}
              {!plans.length&&<EmptyState icon={ClipboardList} title="No treatment plans yet" copy="Recommended or planned care will appear here when your dentist shares a plan."/>}
            </div>
            {sortedPlans.length > PLAN_PAGE_SIZE && <div className="pv3-contained-pagination"><span>Showing {planStartIndex + 1}-{planEndIndex} of {sortedPlans.length}</span><Pagination page={safePlanPage} pageCount={planPageCount} onPageChange={setPlanPage} label="Treatment plan registry pagination" /></div>}
          </section>
        </section>}

        {tab === 'treatments' && <section className="pv3-page pv3-treatments-v4 pv3-care-page-v217 pv3-care-treatments-v217 pv3-care-page-v218 care218-treatments">
          <CareWorkspaceHero icon={HeartPulse} eyebrow="Procedure history" title="Treatments" copy="Track the procedures your clinic has scheduled, started, or completed as part of your care." className="care218-hero-treatments" facts={[
            { label: 'Care progress', value: `${treatmentProgress}%`, note: `${completedTreatments} of ${treatments.length} completed`, tone: completedTreatments ? 'success' : 'default' },
            { label: 'In progress', value: treatments.filter((item)=>item.status==='in_progress').length, note: 'Active procedures', tone: 'warning' },
            { label: 'Remaining', value: Math.max(treatments.length-completedTreatments,0), note: 'Planned or active items' },
          ]}/>
          <div className="care218-progress-track" aria-label={`Treatment progress ${treatmentProgress}%`}><span style={{width:`${treatmentProgress}%`}}/></div>
          <section className="pv3-treatment-panel-v4">
            <header><div><span>TREATMENT HISTORY</span><h3>Procedure records</h3><p>Costs shown here reflect patient-facing treatment records when available; payment remains in Billing.</p></div></header>
            <div className="pv3-treatment-cards-v4">
              {visibleTreatments.map((item,index)=><article key={item.id}><div className={`pv3-treatment-marker ${item.status==='completed'?'is-done':''}`}>{item.status==='completed'?<Check size={14}/>:treatmentStartIndex+index+1}</div><section><div><PatientStatusBadge status={item.status} />{item.toothNumber&&<small>Tooth {item.toothNumber}</small>}</div><h3>{item.serviceNameSnapshot || item.description || 'Dental treatment'}</h3><p>{item.description || 'Care item added by your dentist.'}</p><dl><div><dt>Dentist</dt><dd>{item.providerNameSnapshot || providerMap.get(item.providerId ?? '')?.displayName || 'Care team'}</dd></div><div><dt>Date</dt><dd>{item.treatmentDate?clinicDate(item.treatmentDate):'To be scheduled'}</dd></div><div><dt>Cost</dt><dd>{Number(item.priceSnapshotCents??0)>0?money(Number(item.priceSnapshotCents)):'To be confirmed'}</dd></div></dl></section></article>)}
              {!treatments.length&&<EmptyState icon={HeartPulse} title="No treatments yet" copy="Procedures created by your care team will appear here."/>}
            </div>
            {sortedTreatments.length > TREATMENT_PAGE_SIZE && <div className="pv3-treatment-pagination-v6"><span>Showing {treatmentStartIndex + 1}-{treatmentEndIndex} of {sortedTreatments.length}</span><Pagination page={safeTreatmentPage} pageCount={treatmentPageCount} onPageChange={setTreatmentPage} label="Treatment history pagination" /></div>}
          </section>
        </section>}

        {tab === ('treatments-legacy' as TabKey) && <section className="pv3-page">
          <PageHead eyebrow="CARE PLAN" title="Treatments" copy="A detailed view of planned, active and completed care."/>
          <div className="pv3-treatment-hero"><section><span>OVERALL PROGRESS</span><strong>{treatmentProgress}%</strong><p>{completedTreatments} of {treatments.length} treatment items completed</p><div className="pv3-progress"><i style={{width:`${treatmentProgress}%`}}/></div></section><aside><span>Current plan</span><h3>{plans[0]?.name ?? 'No active plan'}</h3><PatientStatusBadge status={plans[0]?.status ?? 'planned'} />{Number(plans[0]?.quotedTotalCents ?? 0)>0&&<div><small>Quoted total</small><strong>{money(Number(plans[0]?.quotedTotalCents))}</strong></div>}</aside></div>
          <div className="pv3-treatment-layout"><section className="pv3-panel"><div className="pv3-panel-head"><div><span>TREATMENT TIMELINE</span><h3>Your care items</h3></div></div><div className="pv3-treatment-list">{treatments.map((item,index)=><article key={item.id}><div className={`pv3-treatment-marker ${item.status==='completed'?'is-done':''}`}>{item.status==='completed'?<Check size={14}/>:index+1}</div><section><div><PatientStatusBadge status={item.status} />{item.toothNumber&&<small>Tooth {item.toothNumber}</small>}</div><h4>{item.serviceNameSnapshot || item.description || 'Dental treatment'}</h4><p>{item.description || 'Care item added by your dentist.'}</p><footer><span><CalendarDays size={13}/>{item.treatmentDate?clinicDate(item.treatmentDate):'To be scheduled'}</span>{Number(item.priceSnapshotCents??0)>0&&<strong>{money(Number(item.priceSnapshotCents))}</strong>}</footer></section></article>)}{!treatments.length&&<EmptyState icon={HeartPulse} title="No treatments yet" copy="Treatment items created by your dentist will appear here."/>}</div></section><aside className="pv3-panel pv3-plan-detail"><span>PLAN DETAILS</span><h3>{plans[0]?.name ?? 'Treatment plan'}</h3><p>{plans[0]?.description || 'No detailed treatment plan has been shared yet.'}</p><dl><div><dt>Status</dt><dd>{statusLabel(plans[0]?.status)}</dd></div><div><dt>Items</dt><dd>{treatments.length}</dd></div><div><dt>Completed</dt><dd>{completedTreatments}</dd></div><div><dt>Remaining</dt><dd>{Math.max(treatments.length-completedTreatments,0)}</dd></div></dl></aside></div>
        </section>}

        {tab === 'prescriptions' && <section className="pv3-page pv3-prescriptions-v4 pv3-care-page-v217 pv3-care-prescriptions-v217 pv3-care-page-v218 care218-prescriptions">
          <PatientPrescriptionHero total={prescriptions.length} activeCount={activePrescriptions.length} latestDate={latestPrescriptionDate} />
          <PatientPrescriptionSummary activePrescriptions={activePrescriptions} onBookVisit={() => openTab('booking')} />
          {prescriptions.length > 2 && <section className="pv3-rx-toolbar-redesign" aria-label="Prescription filters">
            <div className="pv3-rx-filter-tabs">{(['all','active','previous'] as const).map((filter) => <button key={filter} type="button" className={prescriptionFilter === filter ? 'is-active' : ''} onClick={() => setPrescriptionFilter(filter)}>{filter === 'all' ? 'All' : filter === 'active' ? 'Active' : 'Previous'}</button>)}</div>
            <label><Search size={15}/><input value={prescriptionQuery} onChange={(event) => setPrescriptionQuery(event.target.value)} placeholder="Search medication"/></label>
          </section>}
          <section className="pv3-rx-registry-redesign" aria-label="Prescription registry">
            <header><div><span>MEDICATION LIST</span><h3>{sortedPrescriptions.length} prescription{sortedPrescriptions.length === 1 ? '' : 's'}</h3><p>Open a prescription to review dosage, duration, dentist, branch, and related appointment context.</p></div><small>{sortedPrescriptions.length ? `Showing ${prescriptionStartIndex + 1}-${prescriptionEndIndex} of ${sortedPrescriptions.length}` : 'No matching prescriptions'}</small></header>
            <div className="pv3-rx-card-grid-redesign">{visiblePrescriptions.map((rx) => <PatientPrescriptionCard key={rx.id} rx={rx} branchName={branchMap.get(rx.branchId ?? '')?.name ?? 'Clinic branch'} onOpen={() => setSelectedPrescription(rx)} />)}</div>
            {!prescriptions.length&&<EmptyState icon={Pill} title="No prescriptions yet" copy="Medication instructions issued by your dentist will appear here." action={<Button variant="secondary" onClick={() => openTab('booking')}>Book a visit</Button>}/>}
            {prescriptions.length > 0 && !sortedPrescriptions.length&&<EmptyState icon={Search} title="No prescriptions found" copy="Try another status filter or medication search."/>}
          </section>
          {sortedPrescriptions.length > PRESCRIPTION_PAGE_SIZE && <div className="pv3-contained-pagination pv3-rx-pagination-redesign"><span>{prescriptionStartIndex + 1}-{prescriptionEndIndex} of {sortedPrescriptions.length}</span><Pagination page={safePrescriptionPage} pageCount={prescriptionPageCount} onPageChange={setPrescriptionPage} label="Prescription pagination" /></div>}
          <section className="pv3-rx-care-context-redesign"><div className="pv125-care-locations-slot" /></section>
        </section>}

        {tab === ('prescriptions-legacy' as TabKey) && <section className="pv3-page">
          <PageHead eyebrow="MEDICATION" title="Prescriptions" copy="Read-only medication and dosage instructions issued by your dentist. Prescription creation remains inside the clinical workspace."/>
          <div className="pv3-rx-grid">{prescriptions.map((rx)=><article key={rx.id}><header><span><Pill size={19}/></span><PatientStatusBadge status={rx.status} /></header><small>Issued {clinicDate(rx.prescriptionDate)}</small><h3>{rx.medication || rx.items?.map((item)=>item.medication).filter(Boolean).join(', ') || 'Prescription'}</h3><div>{rx.items?.map((item)=><section key={item.id}><strong>{item.medication}</strong>{item.strength&&<span>{item.strength}</span>}<dl><div><dt>Dosage</dt><dd>{item.dosage||'As directed'}</dd></div><div><dt>Frequency</dt><dd>{item.frequency||'As directed'}</dd></div><div><dt>Duration</dt><dd>{item.duration||'As directed'}</dd></div></dl>{item.instructions&&<p>{item.instructions}</p>}</section>)}</div>{rx.providerNameSnapshot&&<footer><Stethoscope size={14}/><span>Prescribed by {rx.providerNameSnapshot}</span></footer>}</article>)}{!prescriptions.length&&<EmptyState icon={Pill} title="No prescriptions" copy="Medication orders created by your dentist during a clinical visit will appear here."/>}</div>
        </section>}

        {tab === 'payments' && <section className="pv3-page pv3-payments-v6 pv3-care-page-v217 pv3-care-payments-v217 pv3-care-page-v218 care218-payments pay221-page">
          <CareWorkspaceHero icon={WalletCards} eyebrow="Financial ledger" title="Payments & Receipts" copy="A clear account of clinic charges, posted payments, outstanding balances, and official receipts." className="care218-hero-payments" facts={[
            { label: 'Outstanding', value: money(balance), note: openInvoices.length?`${openInvoices.length} open invoice${openInvoices.length===1?'':'s'}`:'Account settled', tone: balance>0?'danger':'success' },
            { label: 'Paid amount', value: money(paidAmount), note: 'Completed payments', tone: 'success' },
            { label: 'Official receipts', value: receipts.length, note: `${invoices.length} invoice${invoices.length===1?'':'s'} on file` },
          ]}/>
          <div className="pay221-workspace">
            <section className="pay221-ledger" aria-labelledby="pay221-ledger-title">
              <header className="pay221-section-head">
                <div>
                  <span>OUTSTANDING INVOICES</span>
                  <h3 id="pay221-ledger-title">Your billing ledger</h3>
                  <p>Review each clinic charge and choose how you would like to settle an open balance.</p>
                </div>
                <div className={balance > 0 ? 'pay221-balance is-due' : 'pay221-balance is-clear'}>
                  <small>Balance due</small>
                  <strong>{money(balance)}</strong>
                  <span>{openInvoices.length ? `${openInvoices.length} awaiting payment` : 'All invoices settled'}</span>
                </div>
              </header>

              <div className="pay221-invoice-list">
                {billingInvoices.map((invoice) => {
                  const paidPercent = invoice.totalCents > 0 ? Math.min(100, Math.max(0, Math.round((invoice.amountPaidCents / invoice.totalCents) * 100))) : 0
                  const isPayable = invoice.balanceCents > 0 && invoice.status !== 'void'
                  return <article key={invoice.id} className={`pay221-invoice ${isPayable ? 'is-open' : 'is-settled'}`}>
                    <div className="pay221-invoice-topline">
                      <div className="pay221-invoice-identity">
                        <span aria-hidden="true"><ReceiptText size={18}/></span>
                        <div>
                          <small>INVOICE</small>
                          <strong>{invoice.invoiceNumber}</strong>
                          <p>Issued {clinicDate(invoice.invoiceDate)}{invoice.dueDate ? ` · Due ${clinicDate(invoice.dueDate)}` : ''}</p>
                        </div>
                      </div>
                      <div className="pay221-invoice-due">
                        <PatientStatusBadge status={invoice.status} />
                        <small>{isPayable ? 'AMOUNT DUE' : 'BALANCE'}</small>
                        <strong>{money(invoice.balanceCents)}</strong>
                      </div>
                    </div>

                    <div className="pay221-invoice-body">
                      <section className="pay221-services">
                        <small>SERVICES</small>
                        <div>{invoice.items.slice(0, 3).map((item) => <span key={item.id}>{item.description}</span>)}{invoice.items.length > 3 && <span>+{invoice.items.length - 3} more</span>}{!invoice.items.length && <span>Dental services</span>}</div>
                      </section>
                      <section className="pay221-progress" aria-label={`${paidPercent}% of invoice paid`}>
                        <div><span>Payment progress</span><strong>{paidPercent}%</strong></div>
                        <i><span style={{ width: `${paidPercent}%` }}/></i>
                        <footer><span>{money(invoice.amountPaidCents)} paid</span><span>{money(invoice.totalCents)} total</span></footer>
                      </section>
                    </div>

                    <footer className="pay221-invoice-actions">
                      {isPayable ? <>
                        <button type="button" className="pay221-secondary-action" onClick={() => choosePayment(invoice.id, 'cash')}><Banknote size={16}/><span>Pay in clinic</span></button>
                        <button type="button" className="pay221-primary-action" onClick={() => choosePayment(invoice.id, 'online')}><QrCode size={16}/><span>Pay securely with QR Ph</span><ArrowRight size={15}/></button>
                      </> : <span className="pay221-settled-note"><CheckCircle2 size={16}/>No outstanding balance</span>}
                    </footer>
                  </article>
                })}
                {!invoices.length && <EmptyState icon={CheckCircle2} title="No invoices yet" copy="Clinic invoices and balances will appear here after care is billed."/>}
              </div>
            </section>

            <aside className="pay221-activity" aria-labelledby="pay221-activity-title">
              <header className="pay221-activity-head">
                <div>
                  <span>PAYMENT HISTORY</span>
                  <h3 id="pay221-activity-title">{paymentHistoryView === 'receipts' ? 'Official receipts' : 'Recent activity'}</h3>
                  <p>Your posted clinic and online payments.</p>
                </div>
                <strong>{visiblePaymentHistory.length}</strong>
              </header>
              {receipts.length > 0 && <div className="pay221-history-filter" role="group" aria-label="Payment history view"><button type="button" className={paymentHistoryView === 'all' ? 'is-active' : ''} onClick={() => setPaymentHistoryView('all')}>All activity</button><button type="button" className={paymentHistoryView === 'receipts' ? 'is-active' : ''} onClick={() => setPaymentHistoryView('receipts')}>Receipts</button></div>}
              <div className="pay221-history-list">{visiblePaymentHistory.map((payment) => {
                const receipt = receiptMap.get(payment.id)
                const hasReceipt = payment.status === 'completed' && Boolean(receipt)
                return <article key={payment.id} className={hasReceipt ? 'has-receipt' : ''} tabIndex={0} role="button" aria-label={hasReceipt ? `View official receipt ${receipt?.receiptNumber}` : `View payment ${payment.paymentNumber || payment.id}`} onClick={() => setSelectedPayment(payment)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedPayment(payment) } }}>
                  <span className="pay221-history-icon" aria-hidden="true">{hasReceipt ? <ReceiptText size={16}/> : <CreditCard size={16}/>}</span>
                  <section><strong>{payment.paymentNumber || 'Payment'}</strong><p>{clinicDate(payment.date)} · {patientPaymentMethodLabel(payment)}</p><small>{hasReceipt ? `Receipt ${receipt?.receiptNumber}` : payment.status === 'completed' ? 'Receipt posting pending' : 'Receipt available after completion'}</small></section>
                  <div><strong>{money(payment.amountCents)}</strong><PatientStatusBadge status={payment.status} />{hasReceipt && <span>Open receipt <ArrowRight size={13}/></span>}</div>
                </article>
              })}{!payments.length && <EmptyState icon={CreditCard} title="No payments yet" copy="Completed clinic payments and receipt links will appear here."/>}{payments.length > 0 && !visiblePaymentHistory.length && <EmptyState icon={ReceiptText} title="No receipts in this view" copy="Completed payments with official receipts will appear here."/>}</div>
              {receipts.length > 0 && paymentHistoryView !== 'receipts' && <button type="button" className="pay221-receipt-shortcut" onClick={() => setPaymentHistoryView('receipts')}><ReceiptText size={16}/><span><strong>{receipts.length} official receipt{receipts.length === 1 ? '' : 's'}</strong><small>Ready to view or download</small></span><ArrowRight size={16}/></button>}
            </aside>
          </div>
        </section>}

        {tab === 'documents' && <section className="pv3-page pv3-documents-v7 pv3-documents-premium pv3-care-page-v217 pv3-care-documents-v217 pv3-care-page-v218 care218-documents">
          <CareWorkspaceHero icon={FileUser} eyebrow="Secure file library" title="Documents" copy="Find, review, and download the records your clinic has intentionally shared with you." className="care218-hero-documents" facts={[
            { label: 'Files available', value: documents.length, note: `${recentDocumentCount} recent upload${recentDocumentCount===1?'':'s'}` },
            { label: 'Categories', value: documentCategories.length, note: 'Organized by record type' },
            { label: 'Care locations', value: representedDocumentBranches.size || 'Clinic', note: 'Source branches' },
          ]}/>
          {documentError&&<div className="pv3-alert is-error">{documentError}</div>}
          <div className="pv3-file-toolbar pv3-file-toolbar-redesign">
            <label><Search size={15}/><input value={documentQuery} onChange={(event)=>setDocumentQuery(event.target.value)} placeholder="Search documents by name, type, date, or description" /></label>
            <select value={documentSort} onChange={(event)=>setDocumentSort(event.target.value as DocumentSort)} aria-label="Sort documents"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">File name</option></select>
            <div><button type="button" className={documentFilter==='all'?'is-active':''} onClick={()=>setDocumentFilter('all')}>All</button>{documentCategories.map((category)=><button key={category} type="button" className={documentFilter===category?'is-active':''} onClick={()=>setDocumentFilter(category)}>{category.replaceAll('_',' ')}</button>)}</div>
          </div>
          <div className="pv3-document-list-v7 pv3-document-list-premium pv3-document-list-redesign">{visibleDocuments.map((document)=><DocumentCard key={document.id} document={{...document, branchName: documentBranchName(document) || 'Clinic branch'}} variant="patient" busy={documentBusyId===document.id} onDownload={(item)=>void downloadPatientDocument(item)} />)}{!visibleDocuments.length&&<EmptyState icon={FileUser} title={documents.length?'No documents match this view':'No documents shared yet'} copy={documents.length?'Adjust the search or category filter to review another file.':'Files only appear here when your clinic intentionally marks them visible to you.'}/>}</div>
          {filteredDocuments.length > DOCUMENT_PAGE_SIZE && <div className="pv3-contained-pagination"><span>Showing {documentStartIndex + 1}-{documentEndIndex} of {filteredDocuments.length}</span><Pagination page={safeDocumentPage} pageCount={documentPageCount} onPageChange={setDocumentPage} label="Shared documents pagination" /></div>}
        </section>}

        {tab === 'profile' && <section className="pv3-page unified-profile-page">
          <header className="unified-profile-hero">
            <div className="unified-profile-identity">
              <label className={`unified-profile-avatar ${profileEditing ? 'is-editable' : ''}`} style={profileImage?{backgroundImage:`url(${profileImage})`}:undefined} aria-label={profileEditing ? 'Change profile photo' : 'Patient profile photo'}>
                {!profileImage&&initials(fullName)}
                {profileEditing&&<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>handlePatientProfileImage(event.target.files?.[0])}/>}
                {profileEditing&&<span aria-hidden="true"><Camera size={17}/></span>}
              </label>
              <div className="unified-profile-title">
                <span>Patient account</span>
                <h2>{fullName}</h2>
                <p>{patient.patientId} - Verified patient</p>
                <div className="unified-profile-meta"><PatientStatusBadge status="active" /><span><ShieldCheck size={14}/> Patient Portal</span><span>{profile.email || patient.email || 'No email'}</span></div>
              </div>
            </div>
            <div className="unified-profile-actions">
              {profileEditing ? (
                <>
                  <Button size="sm" variant="secondary" disabled={profileBusy} onClick={()=>{setProfileEditing(false);setProfilePhotoMessage(null);setProfileMessage(null);setProfileImage(patient.profileImage ?? '')}}>Cancel</Button>
                  <Button size="sm" disabled={profileBusy} onClick={()=>void saveProfile()}>{profileBusy?'Saving...':'Save changes'}</Button>
                </>
              ) : <Button size="sm" onClick={()=>setProfileEditing(true)}>Edit profile</Button>}
            </div>
          </header>
          {(profileMessage||profilePhotoMessage)&&<div className={`pv3-alert ${profilePhotoMessage?'is-error':''}`}>{profilePhotoMessage||profileMessage}</div>}
          <div className="unified-profile-layout"><section className="unified-profile-panel"><header><span><UserRound size={18}/></span><div><h3>Personal information</h3><p>Details your clinic uses for appointments and patient account updates.</p></div></header><div className="pv3-profile-fields unified-profile-fields">{[
            ['firstName','First name','text'],['middleName','Middle name','text'],['lastName','Last name','text'],['dateOfBirth','Date of birth','date'],['phone','Phone','tel'],['address','Address','text'],['emergencyContact','Emergency contact','text'],['emergencyContactPhone','Emergency phone','tel'],['emergencyContactRelationship','Relationship','text'],
          ].map(([key,label,type])=><label key={key}><span>{label}</span><input type={type} disabled={!profileEditing} value={profile[key as keyof typeof profile]} onChange={(event)=>setProfile((current)=>({...current,[key]:event.target.value}))}/></label>)}<label><span>Account email</span><input type="email" disabled value={profile.email || patient.email || ''}/></label></div></section><aside className="unified-profile-panel pv3-communication"><header><span><ShieldCheck size={18}/></span><div><h3>Notification preferences</h3><p>Choose how the clinic may contact you about appointments and care.</p></div></header><CommunicationPreferencesPanel patient={patient} actor={user?.id ?? patient.patientId} /></aside><AccountSecurityPanel currentEmail={profile.email || patient.email || user?.email || ''} onEmailSynced={syncPatientAuthEmail}/></div>
        </section>}
      </div>
    </main>

    {selectedAppointment && <PatientAppointmentDetailsModal
      appointment={selectedAppointment}
      serviceName={serviceMap.get(selectedAppointment.serviceId)?.name ?? 'Dental appointment'}
      branchName={branchMap.get(selectedAppointment.branchId ?? '')?.name ?? 'Clinic branch'}
      dentistName={appointmentDentistLabel(selectedAppointment, providerMap)}
      estimatedFee={serviceMap.get(selectedAppointment.serviceId) ? serviceMoney(serviceMap.get(selectedAppointment.serviceId)!.price) : 'Price to be confirmed'}
      onClose={() => setSelectedAppointment(null)}
    />}

    {selectedRecord && <div className="pv3-modal-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setSelectedRecord(null)}><section className="pv3-detail-modal pv3-record-modal"><header><div><span>DENTAL RECORD</span><h2>{selectedRecord.chiefComplaint || 'Dental visit summary'}</h2><p>{clinicDate(selectedRecord.recordDate)}</p></div><button type="button" aria-label="Close dental record details" onClick={()=>setSelectedRecord(null)}><X size={19}/></button></header><div className="pv3-record-hero"><span><FileText size={21}/></span><div><PatientStatusBadge status={selectedRecord.status} /><h3>{selectedRecord.visitType.replaceAll('_',' ')}</h3><p>This is the patient-visible summary finalized by your clinical team.</p></div></div><div className="pv3-detail-grid"><div><span>Visit date</span><strong>{clinicDate(selectedRecord.recordDate)}</strong></div><div><span>Record status</span><strong>{statusLabel(selectedRecord.status)}</strong></div><div><span>Visit type</span><strong>{selectedRecord.visitType.replaceAll('_',' ')}</strong></div><div><span>Follow-up</span><strong>{selectedRecord.followUpDate?clinicDate(selectedRecord.followUpDate):'Not scheduled'}</strong></div></div><section className="pv3-detail-note"><span>Visit summary</span><p>{selectedRecord.chiefComplaint || 'Your dentist has shared a finalized dental visit summary.'}</p></section><div className="pv3-record-privacy"><ShieldCheck size={16}/><span>Internal clinical notes, assessments and private dentist-only fields are intentionally not exposed in the patient portal.</span></div><footer><Button variant="secondary" onClick={()=>setSelectedRecord(null)}>Close record</Button></footer></section></div>}

    {selectedPayment && (()=>{const receipt=receiptMap.get(selectedPayment.id);const invoice=invoices.find((item)=>item.id===selectedPayment.invoiceId);const branch=branchMap.get(receipt?.branchId ?? selectedPayment.branchId ?? invoice?.branchId ?? '');const payload=getPatientReceiptPayload(selectedPayment);const hasOfficialReceipt=Boolean(payload&&canPrintOfficialReceipt(payload));return <PatientPaymentDetailsModal payment={selectedPayment} receipt={receipt} invoice={invoice} branch={branch} patientName={fullName} patientId={patient.patientId} official={hasOfficialReceipt} onClose={()=>setSelectedPayment(null)} onDownload={()=>{void downloadPatientReceipt(selectedPayment)}} onPrint={()=>printPatientReceipt(selectedPayment)}/>})()}
    {payMode !== 'none' && selectedPayInvoice && <div className="pv3-modal-backdrop pay221-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !payBusy && setPayMode('none')}>
      <section className={`pv3-pay-modal pay221-pay-modal ${payMode === 'online' ? 'is-online' : 'is-cash'} ${payConfirmation ? 'is-confirmed' : ''}`} role="dialog" aria-modal="true" aria-labelledby="pay221-dialog-title">
        <header className="pay221-modal-head">
          <div className="pay221-modal-title">
            <span aria-hidden="true">{payMode === 'cash' ? <Banknote size={20}/> : payConfirmation ? <CheckCircle2 size={20}/> : <QrCode size={20}/>}</span>
            <div><small>{payMode === 'cash' ? 'PAY AT CLINIC' : payConfirmation ? 'PAYMENT RECEIVED' : 'QR PH CHECKOUT'}</small><h2 id="pay221-dialog-title">{payMode === 'cash' ? 'Settle this invoice in person' : payConfirmation ? 'Payment confirmed' : 'Secure QR Ph payment'}</h2><p>{selectedPayInvoice.invoiceNumber} · Plamenco Dental Co.</p></div>
          </div>
          <button type="button" aria-label="Close payment dialog" onClick={() => setPayMode('none')} disabled={payBusy}><X size={19}/></button>
        </header>

        {payMode === 'cash' ? <div className="pay221-cash-body">
          <section><small>AMOUNT TO PRESENT AT CASHIER</small><strong>{money(selectedPayInvoice.balanceCents)}</strong><p>Show invoice <b>{selectedPayInvoice.invoiceNumber}</b> at the clinic cashier. Your account updates only after clinic staff receives and records the payment.</p></section>
          <div><ShieldCheck size={17}/><span>No browser payment record will be created for this option.</span></div>
        </div> : <div className="pay221-checkout">
          {payConfirmation ? <div className="pay221-confirmed">
            <span><CheckCircle2 size={34}/></span><small>PAYMENT COMPLETE</small><h3>{money(paySession?.amountCents ?? selectedPayInvoice.balanceCents)}</h3><p>Your payment was received and the clinic ledger has been refreshed.</p><div><small>PAYMENT REFERENCE</small><strong>{payConfirmation.paymentNumber ?? paySession?.paymentNumber ?? paySession?.paymentId}</strong></div><Button onClick={() => setPayMode('none')}>Return to payments</Button>
          </div> : <>
            <aside className="pay221-checkout-summary">
              <span>PAYMENT SUMMARY</span>
              <strong>{money(selectedPayInvoice.balanceCents)}</strong>
              <p>Exact outstanding balance</p>
              <dl><div><dt>Invoice</dt><dd>{selectedPayInvoice.invoiceNumber}</dd></div><div><dt>Issued</dt><dd>{clinicDate(selectedPayInvoice.invoiceDate)}</dd></div><div><dt>Payment method</dt><dd>QR Ph</dd></div></dl>
              <div className="pay221-secure-note"><LockKeyhole size={17}/><span><strong>Secure checkout</strong><small>QR processing is handled by PayMongo. Plamenco never stores your wallet credentials.</small></span></div>
            </aside>
            <section className={`pay221-checkout-stage ${paySession ? 'has-qr' : ''}`}>
              {payError && <div className="pv3-alert is-error">{payError}</div>}
              {!paySession ? <>
                <div className="pay221-qr-mark"><QrCode size={38}/></div>
                <small>STEP 1 OF 2</small>
                <h3>Generate a one-time QR code</h3>
                <p>Use any QR Ph-supported banking or wallet app. The code is created for this invoice and exact amount only.</p>
                <Button icon={<QrCode size={16}/>} disabled={payBusy} onClick={() => void startQrPayment()}>{payBusy ? 'Generating secure code...' : 'Generate QR Ph code'}</Button>
                <span className="pay221-stage-footnote"><ShieldCheck size={14}/>Encrypted payment session</span>
              </> : <>
                <small>STEP 2 OF 2</small>
                <h3>Scan to pay {money(paySession.amountCents)}</h3>
                <div className="pay221-qr-frame"><img src={paySession.qrImage} alt={`QR Ph payment for ${selectedPayInvoice.invoiceNumber}`}/></div>
                <p>Open your bank or wallet app, scan the code, and complete payment. This page checks your status automatically.</p>
                {payStatus && <div className="pv3-alert is-success">{payStatus}</div>}
                <Button variant="secondary" disabled={payBusy} onClick={() => void checkQrStatus()}>{payBusy ? 'Checking payment...' : 'Check payment status'}</Button>
                <small className="pay221-reference">Reference: {paySession.paymentNumber ?? paySession.paymentId}</small>
              </>}
            </section>
          </>}
        </div>}
        {!payConfirmation && <footer className="pay221-modal-foot"><button type="button" onClick={() => setPayMode('none')} disabled={payBusy}>Cancel and return</button><span><ShieldCheck size={14}/>Authenticated patient session</span></footer>}
      </section>
    </div>}
    {selectedRecall && (() => {
      const linkedAppointment = selectedRecall.linkedAppointmentId ? recallAppointments.get(selectedRecall.linkedAppointmentId) : undefined
      const linkedAppointmentLabel = selectedRecall.linkedAppointmentId ? linkedAppointment?.appointmentNumber ?? selectedRecall.linkedAppointmentId : undefined
      const actionLabel = linkedAppointment ? 'View appointment' : selectedRecall.linkedAppointmentId ? 'View appointments' : canBookRecall(selectedRecall) ? 'Book follow-up' : undefined
      const onAction = linkedAppointment
        ? () => { setSelectedAppointment(linkedAppointment); setSelectedRecall(null) }
        : selectedRecall.linkedAppointmentId
          ? () => { setSelectedRecall(null); openTab('appointments') }
          : canBookRecall(selectedRecall)
            ? () => bookRecallFollowUp(selectedRecall)
            : undefined
      return <PatientRecallDetailsModal
        recall={selectedRecall}
        branchName={selectedRecall.branchId ? branchMap.get(selectedRecall.branchId)?.name ?? 'Clinic branch' : 'Clinic branch'}
        linkedAppointment={linkedAppointmentLabel}
        onClose={() => setSelectedRecall(null)}
        onAction={onAction}
        actionLabel={actionLabel}
      />
    })()}
    {selectedPrescription && <PatientPrescriptionDetailsModal
      prescription={selectedPrescription}
      branchName={branchMap.get(selectedPrescription.branchId ?? '')?.name ?? 'Clinic branch'}
      dentistName={selectedPrescription.providerNameSnapshot || providerMap.get(selectedPrescription.providerId ?? '')?.displayName || 'Prescribing dentist'}
      linkedAppointment={selectedPrescription.appointmentId ? appointments.find((item) => item.id === selectedPrescription.appointmentId)?.appointmentNumber ?? selectedPrescription.appointmentId : 'Not linked'}
      onClose={() => setSelectedPrescription(null)}
    />}
  </div>
}

