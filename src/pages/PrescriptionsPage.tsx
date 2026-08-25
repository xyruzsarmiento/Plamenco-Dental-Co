import { FileText, Pill, Plus, Search, Stethoscope, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { usePermissions } from '../features/auth/permissions'
import { getStoredPatients } from '../features/patients/patientStore'
import { createPrescriptionPersisted, getStoredPrescriptions } from '../features/prescriptions/prescriptionStore'
import '../styles/prescriptions-workspace-v96.css'

function formatDate(value: string) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PrescriptionsPage() {
  const permissions = usePermissions()
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patientId, setPatientId] = useState('')
  const [medication, setMedication] = useState('')
  const [strength, setStrength] = useState('')
  const [dosage, setDosage] = useState('')
  const [frequency, setFrequency] = useState('')
  const [duration, setDuration] = useState('')
  const [instructions, setInstructions] = useState('')
  const [notes, setNotes] = useState('')

  const patientList = useMemo(() => getStoredPatients(), [revision])
  const patients = useMemo(() => new Map(patientList.map((patient) => [patient.patientId, patient])), [patientList])
  const prescriptions = useMemo(() => {
    void revision
    return getStoredPrescriptions().sort((a, b) => b.prescriptionDate.localeCompare(a.prescriptionDate))
  }, [revision])
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

  function resetForm() {
    setPatientId('')
    setMedication('')
    setStrength('')
    setDosage('')
    setFrequency('')
    setDuration('')
    setInstructions('')
    setNotes('')
    setError(null)
  }

  async function savePrescription() {
    if (busy) return
    if (!patientId) return setError('Select a patient.')
    if (!medication.trim() || !dosage.trim() || !frequency.trim()) return setError('Medication, dosage, and frequency are required.')
    setBusy(true)
    setError(null)
    try {
      await createPrescriptionPersisted({
        patientId,
        items: [{
          medication: medication.trim(),
          strength: strength.trim(),
          dosage: dosage.trim(),
          frequency: frequency.trim(),
          duration: duration.trim(),
          instructions: instructions.trim(),
        }],
        notes: notes.trim(),
        prescribedBy: 'Authenticated dentist',
      })
      resetForm()
      setCreating(false)
      setRevision((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save prescription.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="prescriptions-workspace">
      <section className="prescriptions-hero">
        <div>
          <p className="eyebrow">Clinical workspace</p>
          <h2>Prescriptions</h2>
          <p>Review and issue medication orders for patients from the dentist workspace.</p>
        </div>
        <div className="rx116-actions">
          <div className="prescriptions-kpis">
            <span><small>Total</small><strong>{prescriptions.length}</strong></span>
            <span><small>Active</small><strong>{prescriptions.filter((rx) => rx.status === 'active').length}</strong></span>
          </div>
          {permissions.can('prescriptions.create') && <Button icon={<Plus size={16} />} onClick={() => { resetForm(); setCreating(true) }}>New prescription</Button>}
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

      {creating && (
        <div className="rx116-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setCreating(false)}>
          <section className="rx116-modal" role="dialog" aria-modal="true" aria-labelledby="rx116-title">
            <header className="rx116-head">
              <div><span className="eyebrow">Clinical prescription</span><h2 id="rx116-title">New prescription</h2><p>Select a patient and enter the medication instructions. The authenticated dentist is recorded by the database.</p></div>
              <button type="button" aria-label="Close prescription dialog" onClick={() => setCreating(false)} disabled={busy}><X size={18} /></button>
            </header>
            <div className="rx116-form">
              <label className="rx116-span-2"><span>Patient</span><select value={patientId} onChange={(event) => setPatientId(event.target.value)} disabled={busy}><option value="">Select patient</option>{patientList.map((patient) => <option key={patient.id} value={patient.patientId}>{patient.firstName} {patient.lastName} · {patient.patientId}</option>)}</select></label>
              <label><span>Medication</span><input value={medication} onChange={(event) => setMedication(event.target.value)} placeholder="e.g. Amoxicillin" disabled={busy} /></label>
              <label><span>Strength</span><input value={strength} onChange={(event) => setStrength(event.target.value)} placeholder="e.g. 500 mg" disabled={busy} /></label>
              <label><span>Dosage</span><input value={dosage} onChange={(event) => setDosage(event.target.value)} placeholder="e.g. 1 capsule" disabled={busy} /></label>
              <label><span>Frequency</span><input value={frequency} onChange={(event) => setFrequency(event.target.value)} placeholder="e.g. Every 8 hours" disabled={busy} /></label>
              <label><span>Duration</span><input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="e.g. 7 days" disabled={busy} /></label>
              <label><span>Instructions</span><input value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="e.g. Take after meals" disabled={busy} /></label>
              <label className="rx116-span-2"><span>Clinical notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" disabled={busy} /></label>
              {error && <div className="rx116-error" role="alert">{error}</div>}
            </div>
            <footer className="rx116-footer"><Button variant="secondary" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button><Button onClick={() => void savePrescription()} disabled={busy}>{busy ? 'Saving…' : 'Save prescription'}</Button></footer>
          </section>
        </div>
      )}
    </div>
  )
}
