import { Building2, FileText, Pill, Plus, Search, Stethoscope, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { usePermissions } from '../features/auth/permissions'
import { useOptionalBranchContext } from '../features/branches/BranchContext'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { createPrescriptionPersisted, getStoredPrescriptions, type Prescription } from '../features/prescriptions/prescriptionStore'
import '../styles/prescriptions-workspace-v96.css'

const PRESCRIPTION_PAGE_SIZE = 10

function formatDate(value: string) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function PrescriptionsPage() {
  const { user } = useAuth()
  const permissions = usePermissions()
  const branchContext = useOptionalBranchContext()
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patientId, setPatientId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [medication, setMedication] = useState('')
  const [strength, setStrength] = useState('')
  const [dosage, setDosage] = useState('')
  const [frequency, setFrequency] = useState('')
  const [duration, setDuration] = useState('')
  const [instructions, setInstructions] = useState('')
  const [notes, setNotes] = useState('')
  const [page, setPage] = useState(1)
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null)

  const patientList = useMemo(() => getStoredPatients(), [revision])
  const patients = useMemo(() => {
    const map = new Map<string, (typeof patientList)[number]>()
    patientList.forEach((patient) => {
      map.set(patient.id, patient)
      map.set(patient.patientId, patient)
    })
    return map
  }, [patientList])
  const branches = useMemo(() => getStoredBranches(), [revision])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches])
  const branchOptions = branchContext?.isAllBranchesMode
    ? branchContext.availableBranches
    : branchContext?.activeBranch
      ? [branchContext.activeBranch]
      : branchContext?.availableBranches ?? []
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
      return [patientName, rx.patientId, rx.providerNameSnapshot, rx.medication, rx.status, rx.branchId ? branchMap.get(rx.branchId) : '']
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [branchMap, patients, prescriptions, query])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PRESCRIPTION_PAGE_SIZE))
  const effectivePage = Math.min(page, pageCount)
  const visible = useMemo(() => {
    const start = (effectivePage - 1) * PRESCRIPTION_PAGE_SIZE
    return filtered.slice(start, start + PRESCRIPTION_PAGE_SIZE)
  }, [effectivePage, filtered])

  useEffect(() => { setPage(1) }, [query])
  useEffect(() => { setPage((current) => Math.min(current, pageCount)) }, [pageCount])

  function resetForm() {
    setPatientId('')
    setBranchId(branchContext?.isAllBranchesMode ? '' : branchContext?.activeBranchId ?? '')
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
    const resolvedBranchId = branchContext?.isAllBranchesMode ? branchId : branchContext?.activeBranchId ?? branchId
    if (!resolvedBranchId) return setError('Choose the clinic branch for this prescription before saving.')
    const prescriber = user?.name || user?.email || ''
    if (!prescriber) return setError('A signed-in prescriber is required.')
    if (!medication.trim() || !dosage.trim() || !frequency.trim()) return setError('Medication, dosage, and frequency are required.')
    setBusy(true)
    setError(null)
    try {
      await createPrescriptionPersisted({
        patientId,
        branchId: resolvedBranchId,
        items: [{
          medication: medication.trim(),
          strength: strength.trim(),
          dosage: dosage.trim(),
          frequency: frequency.trim(),
          duration: duration.trim(),
          instructions: instructions.trim(),
        }],
        notes: notes.trim(),
        prescribedBy: prescriber,
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
          {visible.map((rx) => {
            const patient = patients.get(rx.patientId)
            const patientName = patient ? `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}` : rx.patientId
            return (
              <article key={rx.id} className="prescription-admin-card" role="button" tabIndex={0} onClick={() => setSelectedPrescription(rx)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedPrescription(rx) } }}>
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
                  <span><Building2 size={14} /> {rx.branchId ? branchMap.get(rx.branchId) ?? 'Unknown branch' : 'No branch recorded'}</span>
                  {rx.dentalRecordId && <span><FileText size={14} /> Linked dental record</span>}
                </footer>
              </article>
            )
          })}
          {!filtered.length && <div className="prescriptions-empty"><Pill size={28} /><strong>No prescriptions found</strong><span>Prescription records matching your filter will appear here.</span></div>}
        </div>
        {filtered.length > PRESCRIPTION_PAGE_SIZE && <div className="rx116-pagination"><span>Showing {(effectivePage - 1) * PRESCRIPTION_PAGE_SIZE + 1}-{Math.min(effectivePage * PRESCRIPTION_PAGE_SIZE, filtered.length)} of {filtered.length}</span><Pagination page={effectivePage} pageCount={pageCount} onPageChange={setPage} label="Prescription list pagination" /></div>}
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
              <label className="rx116-span-2"><span>Clinic branch</span><select value={branchContext?.isAllBranchesMode ? branchId : branchContext?.activeBranchId ?? branchId} onChange={(event) => setBranchId(event.target.value)} disabled={busy || (!branchContext?.isAllBranchesMode && Boolean(branchContext?.activeBranchId))}><option value="">Select branch</option>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <div className="rx116-span-2 rx116-context-note"><Building2 size={15} /><span>{branchContext?.isAllBranchesMode ? 'Select the branch that owns this prescription record.' : `Prescription will be linked to ${branchContext?.activeBranch?.name ?? 'the active clinic branch'}.`}</span></div>
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
      {selectedPrescription && (
        <div className="rx116-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedPrescription(null)}>
          <section className="rx116-modal rx116-detail-modal" role="dialog" aria-modal="true" aria-labelledby="rx116-detail-title">
            <header className="rx116-head">
              <div><span className="eyebrow">Prescription details</span><h2 id="rx116-detail-title">{selectedPrescription.medication || 'Prescription'}</h2><p>{formatDate(selectedPrescription.prescriptionDate)} · {branchMap.get(selectedPrescription.branchId ?? '') ?? 'Branch not recorded'}</p></div>
              <button type="button" aria-label="Close prescription details" onClick={() => setSelectedPrescription(null)}><X size={18} /></button>
            </header>
            <div className="rx116-detail-grid">
              <div><span>Patient</span><strong>{patients.get(selectedPrescription.patientId)?.firstName ?? ''} {patients.get(selectedPrescription.patientId)?.lastName ?? selectedPrescription.patientId}</strong></div>
              <div><span>Dentist</span><strong>{selectedPrescription.providerNameSnapshot || selectedPrescription.prescribedBy || 'Clinical provider'}</strong></div>
              <div><span>Branch</span><strong>{branchMap.get(selectedPrescription.branchId ?? '') ?? 'Branch not recorded'}</strong></div>
              <div><span>Status</span><StatusBadge status={selectedPrescription.status} variant="compact" /></div>
            </div>
            <div className="prescription-medications rx116-detail-medications">
              {(selectedPrescription.items?.length ? selectedPrescription.items : [{ id: selectedPrescription.id, medication: selectedPrescription.medication, strength: '', dosage: selectedPrescription.dosage, frequency: selectedPrescription.frequency, duration: selectedPrescription.duration, instructions: selectedPrescription.instructions }]).map((item) => <section key={item.id}><strong>{item.medication}{item.strength ? ` · ${item.strength}` : ''}</strong><span>{[item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ') || 'See clinical instructions'}</span>{item.instructions && <small>{item.instructions}</small>}</section>)}
            </div>
            {selectedPrescription.notes && <div className="rx116-context-note"><FileText size={15} /><span>{selectedPrescription.notes}</span></div>}
            <footer className="rx116-footer"><Button variant="secondary" onClick={() => setSelectedPrescription(null)}>Close</Button></footer>
          </section>
        </div>
      )}
    </div>
  )
}
