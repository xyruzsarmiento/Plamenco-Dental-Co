import { FileText, Pill, Search, Stethoscope } from 'lucide-react'
import { useMemo, useState } from 'react'
import { StatusBadge } from '../components/ui/Badge'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredPrescriptions } from '../features/prescriptions/prescriptionStore'
import '../styles/prescriptions-workspace-v96.css'

function formatDate(value: string) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PrescriptionsPage() {
  const [query, setQuery] = useState('')
  const patients = useMemo(() => new Map(getStoredPatients().map((patient) => [patient.patientId, patient])), [])
  const prescriptions = useMemo(() => getStoredPrescriptions().sort((a, b) => b.prescriptionDate.localeCompare(a.prescriptionDate)), [])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return prescriptions
    return prescriptions.filter((rx) => {
      const patient = patients.get(rx.patientId)
      const patientName = patient ? `${patient.firstName} ${patient.middleName ?? ''} ${patient.lastName}` : rx.patientId
      return [patientName, rx.patientId, rx.providerNameSnapshot, rx.medication, rx.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [patients, prescriptions, query])

  return (
    <div className="prescriptions-workspace">
      <section className="prescriptions-hero">
        <div>
          <p className="eyebrow">Clinical workspace</p>
          <h2>Prescriptions</h2>
          <p>Review medication orders issued by authorized clinical providers. Prescription creation remains inside the clinical visit workflow.</p>
        </div>
        <div className="prescriptions-kpis">
          <span><small>Total</small><strong>{prescriptions.length}</strong></span>
          <span><small>Active</small><strong>{prescriptions.filter((rx) => rx.status === 'active').length}</strong></span>
        </div>
      </section>

      <section className="panel prescriptions-panel">
        <div className="prescriptions-toolbar">
          <label>
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, medication, dentist..." />
          </label>
        </div>

        <div className="prescriptions-grid">
          {filtered.map((rx) => {
            const patient = patients.get(rx.patientId)
            const patientName = patient ? `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}` : rx.patientId
            return (
              <article key={rx.id} className="prescription-admin-card">
                <header>
                  <span><Pill size={18} /></span>
                  <StatusBadge status={rx.status} variant="compact" />
                </header>
                <small>{formatDate(rx.prescriptionDate)}</small>
                <h3>{patientName}</h3>
                <p className="prescription-patient-id">{rx.patientId}</p>
                <div className="prescription-medications">
                  {(rx.items?.length ? rx.items : [{ id: rx.id, medication: rx.medication, strength: '', dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration, instructions: rx.instructions }]).map((item) => (
                    <div key={item.id}>
                      <strong>{item.medication}{item.strength ? ` · ${item.strength}` : ''}</strong>
                      <span>{[item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ') || 'See clinical instructions'}</span>
                      {item.instructions && <small>{item.instructions}</small>}
                    </div>
                  ))}
                </div>
                <footer>
                  <span><Stethoscope size={14} /> {rx.providerNameSnapshot || rx.prescribedBy || 'Clinical provider'}</span>
                  {rx.dentalRecordId && <span><FileText size={14} /> Linked dental record</span>}
                </footer>
              </article>
            )
          })}
          {!filtered.length && <div className="prescriptions-empty"><Pill size={28} /><strong>No prescriptions found</strong><span>Prescription records matching your filter will appear here.</span></div>}
        </div>
      </section>
    </div>
  )
}
