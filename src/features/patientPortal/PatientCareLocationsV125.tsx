import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, CalendarDays, FileText, HeartPulse, ReceiptText } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { getAppointmentsByPatient } from '../appointments/appointmentStore'
import { getReceiptsByPatient } from '../billing/billingStore'
import { getStoredBranches } from '../branches/branchStore'
import { getDentalRecordsByPatientId } from '../dentalRecords/dentalRecordStore'
import { getDocumentsByPatient } from '../documents/documentStore'
import { getTreatmentsByPatient } from '../treatments/treatmentStore'
import '../../styles/patient-branch-history-v125.css'

type SummaryRow = { key: string; label: string; branches: string[]; Icon: typeof Building2 }

export function PatientCareLocationsV125() {
  const { user } = useAuth()
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const patientId = user?.role === 'patient' ? user.patientId : undefined

  useEffect(() => {
    if (!patientId) return
    const sync = () => setTarget(document.querySelector<HTMLElement>('.pv125-care-locations-slot'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [patientId])

  const rows = useMemo<SummaryRow[]>(() => {
    if (!patientId) return []
    const branchMap = new Map(getStoredBranches().map((branch) => [branch.id, branch.name]))
    const treatments = getTreatmentsByPatient(patientId)
    const records = getDentalRecordsByPatientId(patientId)
    const treatmentBranch = new Map(treatments.map((item) => [item.id, item.branchId]))
    const clinicalBranch = new Map(records.map((item) => [item.id, item.branchId]))
    const names = (ids: Array<string | undefined>) => [...new Set(ids.filter(Boolean).map((id) => branchMap.get(id!) ?? 'Unknown branch'))]
    const documents = getDocumentsByPatient(patientId)
    return [
      { key: 'appointments', label: 'Appointments', branches: names(getAppointmentsByPatient(patientId).map((item) => item.branchId)), Icon: CalendarDays },
      { key: 'summaries', label: 'Dental summaries', branches: names(records.map((item) => item.branchId)), Icon: FileText },
      { key: 'treatments', label: 'Treatments', branches: names(treatments.map((item) => item.branchId)), Icon: HeartPulse },
      { key: 'receipts', label: 'Receipts', branches: names(getReceiptsByPatient(patientId).map((item) => item.branchId)), Icon: ReceiptText },
      { key: 'documents', label: 'Documents', branches: names(documents.map((item) => item.treatmentId ? treatmentBranch.get(item.treatmentId) : item.clinicalVisitId ? clinicalBranch.get(item.clinicalVisitId) : undefined)), Icon: FileText },
    ]
  }, [patientId, target])

  if (!target || !patientId || !rows.some((row) => row.branches.length)) return null

  return createPortal(
    <section className="pv125-care-locations" aria-label="Clinic branch history">
      <header><div><span>YOUR CARE LOCATIONS</span><h2>One health history, across clinic branches</h2><p>Your portal remains unified. Branch labels show where each part of your care was recorded.</p></div><Building2 size={20}/></header>
      <div>{rows.map(({ key, label, branches, Icon }) => <article key={key}><Icon size={16}/><span><strong>{label}</strong><small>{branches.length ? branches.join(' · ') : 'No branch-linked records yet'}</small></span></article>)}</div>
    </section>,
    target,
  )
}
