import { Activity, Building2, CalendarDays, ChevronRight, FileText, LoaderCircle, Pencil, Pill, Plus, Search, Stethoscope, Trash2, UserRound, X } from 'lucide-react'
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
import { createPrescriptionPersisted, type Prescription, type PrescriptionInput, type PrescriptionStatus, updatePrescriptionPersisted, updatePrescriptionStatusPersisted } from '../features/prescriptions/prescriptionStore'
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
  const canManagePrescriptions = user?.role === 'super_admin' || user?.role === 'dentist' || permissions.can('prescriptions.edit')
  const canCreatePrescriptions = user?.role === 'super_admin' || user?.role === 'dentist' || permissions.can('prescriptions.create')
  const branchContext = useOptionalBranchContext()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
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
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [editingPrescription, setEditingPrescription] = useState<Prescription | null>(null)
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
    const activeRecords = prescriptions.filter((rx) => rx.status !== 'voided' && (statusFilter === 'all' || effectiveStatus(rx) === statusFilter))
    if (!needle) return activeRecords
    return activeRecords.filter((rx) => {
      const patient = patients.get(rx.patientId)
      const patientName = patient ? `${patient.firstName} ${patient.middleName ?? ''} ${patient.lastName}` : rx.patientId
      return [patientName, rx.patientId, rx.providerNameSnapshot, rx.medication, effectiveStatus(rx), rx.branchId ? branchMap.get(rx.branchId) : '']
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [branchMap, patients, prescriptions, query, statusFilter])
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
  useEffect(() => {
    if (!selectedPatientId && patientGroups[0]) setSelectedPatientId(patientGroups[0].id)
  }, [patientGroups, selectedPatientId])


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
        if (canManagePrescriptions) {
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
  }, [canManagePrescriptions])

  function resetForm() {
    setEditingPrescription(null)
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

  async function deletePrescription() {
    if (!selectedPrescription || statusBusy || !window.confirm('Delete this prescription from the active workspace?')) return
    setStatusBusy(true)
    try {
      await updatePrescriptionStatusPersisted(selectedPrescription.id, 'voided')
      setPrescriptions((current) => current.filter((entry) => entry.id !== selectedPrescription.id))
      setSelectedPrescription(null)
      setSelectedPatientId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Prescription could not be deleted.')
    } finally {
      setStatusBusy(false)
    }
  }

  function editPrescription(prescription: Prescription) {
    const item = prescription.items?.[0]
    setEditingPrescription(prescription)
    setPatientId(prescription.patientId)
    setBranchId(prescription.branchId ?? branchContext?.activeBranchId ?? '')
    setMedication(item?.medication ?? prescription.medication)
    setStrength(item?.strength ?? '')
    setDosage(item?.dosage ?? prescription.dosage)
    setFrequency(item?.frequency ?? prescription.frequency)
    setDuration(item?.duration ?? prescription.duration)
    setInstructions(item?.instructions ?? prescription.instructions)
    setNotes(prescription.notes)
    setError(null)
    setSelectedPrescription(null)
    setCreating(true)
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
      const input: PrescriptionInput = {
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
        // Editing medication details must not change patient visibility. The
        // status is changed explicitly from the prescription details modal.
        status: editingPrescription?.status ?? 'active',
      }
      const confirmed = editingPrescription
        ? await updatePrescriptionPersisted(editingPrescription.id, input)
        : await createPrescriptionPersisted(input)

      // The RPC-confirmed PostgreSQL row is immediately safe to display. A
      // fresh database read then reconciles the complete registry without ever
      // treating browser storage as the source of truth.
      setPrescriptions((current) => editingPrescription
        ? current.map((entry) => entry.id === confirmed.id ? confirmed : entry)
        : [confirmed, ...current.filter((entry) => entry.id !== confirmed.id)])
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
        <div className="prescription-hero-identity"><span className="prescription-hero-icon"><Pill size={21} /></span><div><p className="eyebrow">Clinical medication</p><h2>Prescriptions</h2><p>Issue clear medication instructions, monitor course status, and keep patient visibility intentional.</p></div></div>
        {canCreatePrescriptions && <Button className="prescription-create-btn" icon={<Plus size={15} />} onClick={() => { resetForm(); setCreating(true) }}>New Rx</Button>}
      </section>

      <section className="prescription-desk">
        {loadError && <div className="rx116-load-error" role="alert">{loadError}<button type="button" onClick={() => { setLoadError(null); setLoadingRecords(true); void Promise.all([loadPatientsFromSupabase({ strict: true }), loadPrescriptionsFromSupabase({ strict: true })]).then(([nextPatients, nextPrescriptions]) => { setPatientList(nextPatients); setPrescriptions(nextPrescriptions); setLoadingRecords(false) }).catch((cause) => { setLoadError(cause instanceof Error ? cause.message : 'Unable to reload prescriptions.'); setLoadingRecords(false) }) }}>Retry</button></div>}
        <div className="prescription-desk-layout" aria-busy={loadingRecords}>
          <aside className="prescription-patient-rail">
            <div className="prescription-rail-heading"><div><span className="rx-desk-kicker">Patient directory</span><strong>{patientGroups.length} patient files</strong></div><UserRound size={18} /></div>
            <label className="prescription-rail-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient or order" /></label>
            <select className="prescription-rail-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} aria-label="Filter prescription status"><option value="all">All prescription statuses</option><option value="active">Active only</option><option value="inactive">Inactive only</option></select>
            <div className="prescription-rail-list">
              {loadingRecords && <div className="prescription-rail-state"><LoaderCircle size={18} /><span>Loading database records…</span></div>}
              {!loadingRecords && visible.map(({ id, records }) => {
                const patient = patients.get(id)
                const patientName = patient ? `${patient.firstName} ${patient.middleName ? `${patient.middleName} ` : ''}${patient.lastName}` : id
                const activeCount = records.filter((entry) => effectiveStatus(entry) === 'active').length
                return <button key={id} type="button" className={`prescription-patient-row${selectedPatientId === id ? ' is-selected' : ''}`} onClick={() => setSelectedPatientId(id)}><span className="prescription-patient-avatar">{patientName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><strong>{patientName}</strong><small>{records.length} order{records.length === 1 ? '' : 's'} · {activeCount} active</small></span><ChevronRight size={15} /></button>
              })}
              {!loadingRecords && !visible.length && <div className="prescription-rail-state"><Pill size={18} /><span>No patient files match.</span></div>}
            </div>
            {!loadingRecords && patientGroups.length > PRESCRIPTION_PAGE_SIZE && <Pagination page={effectivePage} pageCount={pageCount} onPageChange={setPage} label="Prescription patient pagination" />}
          </aside>

          <main className="prescription-desk-main">
            {loadingRecords && <div className="prescription-desk-empty"><LoaderCircle size={28} /><strong>Loading prescriptions</strong><span>Reading patient orders from Supabase…</span></div>}
            {!loadingRecords && selectedPatientId && patients.get(selectedPatientId) && (() => {
              const patient = patients.get(selectedPatientId)!
              const records = prescriptions.filter((record) => record.patientId === selectedPatientId && record.status !== 'voided').sort((a, b) => new Date(b.prescriptionDate).getTime() - new Date(a.prescriptionDate).getTime())
              const activeCount = records.filter((record) => effectiveStatus(record) === 'active').length
              return <>
                <section className="prescription-patient-banner"><div className="prescription-patient-avatar prescription-patient-avatar-lg">{`${patient.firstName[0] ?? ''}${patient.lastName[0] ?? ''}`.toUpperCase()}</div><div><span className="rx-desk-kicker">Selected patient</span><h2>{patient.firstName} {patient.middleName ? `${patient.middleName} ` : ''}{patient.lastName}</h2><p>{patient.patientId} · {patient.phone || 'No phone'} · {patient.email || 'No email'}</p></div><div className="prescription-patient-banner-meta"><span><Activity size={14} /> {activeCount} active</span><small>{records.length} total orders</small></div></section>
                <div className="prescription-summary-strip"><div><span>Active courses</span><strong>{activeCount}</strong></div><div><span>Inactive history</span><strong>{records.length - activeCount}</strong></div><div><span>Latest issue</span><strong>{records[0] ? formatDate(records[0].prescriptionDate) : '—'}</strong></div></div>
                <section className="prescription-order-section"><div className="prescription-section-heading"><div><span className="rx-desk-kicker">Medication history</span><h3>Prescription orders</h3><p>Open an order to edit instructions or change patient visibility.</p></div><Pill size={19} /></div><div className="prescription-order-grid">{records.map((record) => { const item = record.items?.[0]; return <button type="button" key={record.id} className="prescription-order-card" onClick={() => setSelectedPrescription(record)}><div className="prescription-order-card-top"><span className="prescription-order-icon"><Pill size={17} /></span><StatusBadge status={effectiveStatus(record)} variant="compact" /></div><span className="prescription-order-date"><CalendarDays size={13} /> {formatDate(record.prescriptionDate)}</span><strong>{item?.medication || record.medication || 'Medication details'}{item?.strength ? ` · ${item.strength}` : ''}</strong><span className="prescription-order-instructions">{[item?.dosage || record.dosage, item?.frequency || record.frequency, item?.duration || record.duration].filter(Boolean).join(' · ') || 'See clinical instructions'}</span><footer><span><Stethoscope size={13} /> {record.providerNameSnapshot || record.prescribedBy || 'Clinical provider'}</span><ChevronRight size={15} /></footer></button> })}</div></section>
              </>
            })()}
            {!loadingRecords && (!selectedPatientId || !patients.get(selectedPatientId)) && <div className="prescription-desk-empty"><UserRound size={28} /><strong>Select a patient</strong><span>Choose a patient file from the directory to review prescriptions.</span></div>}
          </main>
        </div>
      </section>

      {creating && (
        <div className="rx116-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setCreating(false)}>
          <section className="rx116-modal" role="dialog" aria-modal="true" aria-labelledby="rx116-title">
            <header className="rx116-head">
              <div><span className="eyebrow">Clinical prescription</span><h2 id="rx116-title">{editingPrescription ? 'Edit prescription' : 'New prescription'}</h2><p>{editingPrescription ? 'Update the medication instructions and save the revised clinical order.' : 'Select a patient and enter the medication instructions. The authenticated dentist is recorded by the database.'}</p></div>
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
        <div className="rx116-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && (setSelectedPrescription(null), setSelectedPatientId(null))}>
          <section className="rx116-modal rx116-detail-modal" role="dialog" aria-modal="true" aria-labelledby="rx116-detail-title">
            <header className="rx116-head">
              <div><span className="eyebrow">Prescription details</span><h2 id="rx116-detail-title">{selectedPrescription.medication || 'Prescription'}</h2><p>{formatDate(selectedPrescription.prescriptionDate)} · {branchMap.get(selectedPrescription.branchId ?? '') ?? 'Branch not recorded'}</p></div>
              <button type="button" aria-label="Close prescription details" onClick={() => { setSelectedPrescription(null); setSelectedPatientId(null) }}><X size={18} /></button>
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
            <footer className="rx116-footer rx-prescription-detail-footer"><Button variant="secondary" onClick={() => { setSelectedPrescription(null); setSelectedPatientId(null) }}>Close</Button>{canManagePrescriptions && effectiveStatus(selectedPrescription) !== 'voided' && <><Button variant="secondary" icon={<Pencil size={15} />} onClick={() => editPrescription(selectedPrescription)} disabled={statusBusy}>Edit</Button><Button variant="danger" icon={<Trash2 size={15} />} onClick={() => void deletePrescription()} disabled={statusBusy}>Delete</Button><Button onClick={() => void changeStatus(effectiveStatus(selectedPrescription) === 'active' ? 'inactive' : 'active')} disabled={statusBusy}>{statusBusy ? 'Saving...' : effectiveStatus(selectedPrescription) === 'active' ? 'Mark inactive' : 'Mark active'}</Button></>}</footer>
          </section>
        </div>
      )}
    </div>
  )
}
