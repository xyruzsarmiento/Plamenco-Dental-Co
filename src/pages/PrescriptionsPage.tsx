import { Building2, FileText, LoaderCircle, Pill, Plus, Search, Stethoscope, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { usePermissions } from '../features/auth/permissions'
import { useOptionalBranchContext } from '../features/branches/BranchContext'
import { getStoredBranches } from '../features/branches/branchStore'
import { PatientSearchCombobox } from '../features/patients/PatientSearchCombobox'
import { loadPatientsFromSupabase } from '../features/patients/patientPersistence'
import type { Patient } from '../features/patients/patientTypes'
import { createPrescriptionPersisted, type Prescription, type PrescriptionStatus, updatePrescriptionStatusPersisted } from '../features/prescriptions/prescriptionStore'
import { loadPrescriptionsFromSupabase } from '../features/prescriptions/prescriptionPersistence'
import '../styles/prescriptions-workspace-v96.css'

const PRESCRIPTION_PAGE_SIZE = 12

function durationInDays(value: string) {
  const match = value.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)/)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  if (match[2].startsWith('week')) return Math.round(amount * 7)
  if (match[2].startsWith('month')) return Math.round(amount * 30)
  return Math.round(amount)
}

function prescriptionEndDate(prescription: Prescription) {
  const days = durationInDays(prescription.duration || prescription.items?.[0]?.duration || '')
  if (!days || !prescription.prescriptionDate) return null
  const date = new Date(`${prescription.prescriptionDate}T00:00:00`)
  date.setDate(date.getDate() + days - 1)
  return date
}

function effectiveStatus(prescription: Prescription): PrescriptionStatus {
  if (prescription.status !== 'active') return prescription.status
  const endDate = prescriptionEndDate(prescription)
  return endDate && endDate < new Date(new Date().setHours(0, 0, 0, 0)) ? 'inactive' : 'active'
}

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
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadingRecords, setLoadingRecords] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [patientList, setPatientList] = useState<Patient[]>([])
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
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
  const [statusBusy, setStatusBusy] = useState(false)

  const patients = useMemo(() => {
    const map = new Map<string, Patient>()
    patientList.forEach((patient) => {
      map.set(patient.id, patient)
      map.set(patient.patientId, patient)
    })
    return map
  }, [patientList])

  const branches = useMemo(() => {
    const branchMap = new Map(getStoredBranches().map((branch) => [branch.id, branch]))
    branchContext?.availableBranches.forEach((branch) => branchMap.set(branch.id, branch))
    return Array.from(branchMap.values())
  }, [branchContext?.availableBranches])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches])
  const branchOptions = branchContext?.isAllBranchesMode
    ? branchContext.availableBranches
    : branchContext?.activeBranch
      ? [branchContext.activeBranch]
      : branchContext?.availableBranches ?? []

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return prescriptions
    return prescriptions.filter((rx) => {
      const patient = patients.get(rx.patientId)
      const patientName = patient ? `${patient.firstName} ${patient.middleName ?? ''} ${patient.lastName}` : rx.patientId
      return [patientName, rx.patientId, rx.providerNameSnapshot, rx.medication, effectiveStatus(rx), rx.branchId ? branchMap.get(rx.branchId) : '']
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [branchMap, patients, prescriptions, query])
  const patientGroups = useMemo(() => {
    const groups = new Map<string, Prescription[]>()
    filtered.forEach((rx) => groups.set(rx.patientId, [...(groups.get(rx.patientId) ?? []), rx]))
    return Array.from(groups.entries()).map(([id, records]) => ({ id, records }))
  }, [filtered])
  const pageCount = Math.max(1, Math.ceil(patientGroups.length / PRESCRIPTION_PAGE_SIZE))
  const effectivePage = Math.min(page, pageCount)
  const visible = useMemo(() => {
    const start = (effectivePage - 1) * PRESCRIPTION_PAGE_SIZE
    return patientGroups.slice(start, start + PRESCRIPTION_PAGE_SIZE)
  }, [effectivePage, patientGroups])


  useEffect(() => { setPage(1) }, [query])
  useEffect(() => { setPage((current) => Math.min(current, pageCount)) }, [pageCount])

  useEffect(() => {
    let active = true

    async function loadClinicalWorkspace() {
      setLoadingRecords(true)
      setLoadError(null)
      try {
        // Patients load first because prescription rows store the durable public
        // patient number and the page resolves that reference for display/search.
        const nextPatients = await loadPatientsFromSupabase({ strict: true })
        if (!active) return
        setPatientList(nextPatients)

        const nextPrescriptions = await loadPrescriptionsFromSupabase({ strict: true })
        if (!active) return
        setPrescriptions(nextPrescriptions)
        if (permissions.can('prescriptions.edit')) {
          const expired = nextPrescriptions.filter((rx) => rx.status === 'active' && effectiveStatus(rx) === 'inactive')
          if (expired.length) {
            void Promise.all(expired.map((rx) => updatePrescriptionStatusPersisted(rx.id, 'inactive')))
              .then((updated) => setPrescriptions((current) => current.map((entry) => updated.find((item) => item.id === entry.id) ?? entry)))
              .catch((cause) => { if (import.meta.env.DEV) console.warn('[prescription lifecycle] expiry sync', cause) })
          }
        }
      } catch (cause) {
        if (!active) return
        setLoadError(cause instanceof Error ? cause.message : 'Unable to load the clinical prescription workspace.')
      } finally {
        if (active) setLoadingRecords(false)
      }
    }

    void loadClinicalWorkspace()
    return () => { active = false }
  }, [permissions])

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

  async function refreshPrescriptions() {
    const nextPrescriptions = await loadPrescriptionsFromSupabase({ strict: true })
    setPrescriptions(nextPrescriptions)
    setLoadError(null)
  }

  async function changeStatus(status: PrescriptionStatus) {
    if (!selectedPrescription || statusBusy) return
    setStatusBusy(true)
    try {
      const confirmed = await updatePrescriptionStatusPersisted(selectedPrescription.id, status)
      setSelectedPrescription(confirmed)
      setPrescriptions((current) => current.map((entry) => entry.id === confirmed.id ? confirmed : entry))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Prescription status could not be saved.')
    } finally {
      setStatusBusy(false)
    }
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
      const confirmed = await createPrescriptionPersisted({
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

      // The RPC-confirmed PostgreSQL row is immediately safe to display. A
      // fresh database read then reconciles the complete registry without ever
      // treating browser storage as the source of truth.
      setPrescriptions((current) => [confirmed, ...current.filter((entry) => entry.id !== confirmed.id)])
      resetForm()
      setCreating(false)
      try {
        await refreshPrescriptions()
      } catch (refreshCause) {
        setLoadError(refreshCause instanceof Error
          ? `Prescription was saved, but the list could not be refreshed: ${refreshCause.message}`
          : 'Prescription was saved, but the list could not be refreshed from the clinic database.')
      }
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
            <span><small>Active</small><strong>{prescriptions.filter((rx) => effectiveStatus(rx) === 'active').length}</strong></span>
          </div>
          {permissions.can('prescriptions.create') && <Button icon={<Plus size={16} />} onClick={() => { resetForm(); setCreating(true) }}>New prescription</Button>}
        </div>
      </section>

      <section className="panel prescriptions-panel">
        <div className="prescriptions-toolbar">
          <label className="rx-prescription-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, medication, dentist..." />
          </label>
        </div>

        {loadError && <div className="rx116-load-error" role="alert">{loadError}<button type="button" onClick={() => { setLoadError(null); setLoadingRecords(true); void Promise.all([loadPatientsFromSupabase({ strict: true }), loadPrescriptionsFromSupabase({ strict: true })]).then(([nextPatients, nextPrescriptions]) => { setPatientList(nextPatients); setPrescriptions(nextPrescriptions); setLoadingRecords(false) }).catch((cause) => { setLoadError(cause instanceof Error ? cause.message : 'Unable to reload prescriptions.'); setLoadingRecords(false) }) }}>Retry</button></div>}

        <div className="prescriptions-grid" aria-busy={loadingRecords}>
          {loadingRecords && <div className="prescriptions-empty rx116-loading"><LoaderCircle size={28} /><strong>Loading prescriptions</strong><span>Reading patients and prescription records from the clinic database…</span></div>}
          {!loadingRecords && visible.map(({ id, records }) => {
            const rx = records[0]
            const patient = patients.get(id)
            const patientName = patient ? `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}` : id
            const activeCount = records.filter((entry) => effectiveStatus(entry) === 'active').length
            return (
              <article key={id} className="prescription-admin-card prescription-patient-card" role="button" tabIndex={0} onClick={() => setSelectedPrescription(rx)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedPrescription(rx) } }}>
                <header>
                  <span><Pill size={18} /></span>
                  <StatusBadge status={activeCount ? 'active' : effectiveStatus(rx)} variant="compact" />
                </header>
                <small>{formatDate(rx.prescriptionDate)}</small>
                <h3>{patientName}</h3>
                <p className="prescription-patient-id">{id} · {records.length} prescription{records.length === 1 ? '' : 's'}</p>
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
                  <span><FileText size={14} /> View patient orders</span>
                </footer>
              </article>
            )
          })}
          {!loadingRecords && !filtered.length && <div className="prescriptions-empty"><Pill size={28} /><strong>No prescriptions found</strong><span>Prescription records matching your filter will appear here.</span></div>}
        </div>
        {!loadingRecords && patientGroups.length > PRESCRIPTION_PAGE_SIZE && <div className="rx116-pagination"><span>Showing {(effectivePage - 1) * PRESCRIPTION_PAGE_SIZE + 1}-{Math.min(effectivePage * PRESCRIPTION_PAGE_SIZE, patientGroups.length)} of {patientGroups.length} patients</span><Pagination page={effectivePage} pageCount={pageCount} onPageChange={setPage} label="Prescription patient pagination" /></div>}
      </section>

      {creating && (
        <div className="rx116-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setCreating(false)}>
          <section className="rx116-modal" role="dialog" aria-modal="true" aria-labelledby="rx116-title">
            <header className="rx116-head">
              <div><span className="eyebrow">Clinical prescription</span><h2 id="rx116-title">New prescription</h2><p>Select a patient and enter the medication instructions. The authenticated dentist is recorded by the database.</p></div>
              <button type="button" aria-label="Close prescription dialog" onClick={() => setCreating(false)} disabled={busy}><X size={18} /></button>
            </header>
            <div className="rx116-form">
              <div className="rx116-span-2 rx116-patient-search"><PatientSearchCombobox patients={patientList} value={patientId} required disabled={busy || loadingRecords} placeholder={loadingRecords ? 'Loading patients from clinic database…' : 'Search by name, patient ID, phone or email'} scopeFilter={(patient) => patient.status === 'active'} onSelect={(patient) => setPatientId(patient?.patientId ?? '')} /></div>
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
            <footer className="rx116-footer"><Button variant="secondary" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button><Button onClick={() => void savePrescription()} disabled={busy || loadingRecords}>{busy ? 'Saving to database…' : 'Save prescription'}</Button></footer>
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
              <div><span>Status</span><StatusBadge status={effectiveStatus(selectedPrescription)} variant="compact" /></div>
              <div><span>Course ends</span><strong>{prescriptionEndDate(selectedPrescription) ? formatDate(prescriptionEndDate(selectedPrescription)!.toISOString().slice(0, 10)) : 'No duration recorded'}</strong></div>
            </div>
            <div className="prescription-medications rx116-detail-medications">
              {(selectedPrescription.items?.length ? selectedPrescription.items : [{ id: selectedPrescription.id, medication: selectedPrescription.medication, strength: '', dosage: selectedPrescription.dosage, frequency: selectedPrescription.frequency, duration: selectedPrescription.duration, instructions: selectedPrescription.instructions }]).map((item) => <section key={item.id}><strong>{item.medication}{item.strength ? ` · ${item.strength}` : ''}</strong><span>{[item.dosage, item.frequency, item.duration].filter(Boolean).join(' · ') || 'See clinical instructions'}</span>{item.instructions && <small>{item.instructions}</small>}</section>)}
            </div>
            {selectedPrescription.notes && <div className="rx116-context-note"><FileText size={15} /><span>{selectedPrescription.notes}</span></div>}
            <footer className="rx116-footer rx-prescription-detail-footer"><Button variant="secondary" onClick={() => setSelectedPrescription(null)}>Close</Button>{permissions.can('prescriptions.edit') && effectiveStatus(selectedPrescription) !== 'voided' && <Button onClick={() => void changeStatus(effectiveStatus(selectedPrescription) === 'active' ? 'inactive' : 'active')} disabled={statusBusy}>{statusBusy ? 'Saving...' : effectiveStatus(selectedPrescription) === 'active' ? 'Mark inactive' : 'Mark active'}</Button>}</footer>
          </section>
        </div>
      )}
    </div>
  )
}
