import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardList, FileSignature, HeartPulse, Save, ShieldCheck } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { SkeletonCard, SkeletonList, SkeletonText } from '../components/ui/DesignSystem'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { useAuth } from '../features/auth/AuthContext'
import {
  ensurePatientIntake,
  getAssignedPatientForms,
  getMedicalHistoryRevisions,
  markAssignedFormViewed,
  savePatientMedicalHistory,
  submitAssignedForm,
  submitPatientIntake,
  type AssignedPatientForm,
  type MedicalHistoryRevision,
  type PatientIntake,
} from '../features/intake/intakeStore'
import { SignaturePad } from '../features/intake/SignaturePad'
import { getCurrentPatientForAuthenticatedUser } from '../features/patients/patientStore'
import type { Patient } from '../features/patients/patientTypes'

function formatDateTime(value?: string) {
  if (!value) return 'Not yet confirmed'
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function statusLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function medicalValue(value: string) {
  return value.trim() || 'None recorded'
}

export function PatientIntakePage() {
  const { patientId: routePatientId } = useParams()
  const { user } = useAuth()
  const [patient, setPatient] = useState<Patient | null>(null)
  const [intake, setIntake] = useState<PatientIntake | null>(null)
  const [history, setHistory] = useState<MedicalHistoryRevision[]>([])
  const [forms, setForms] = useState<AssignedPatientForm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')
  const [selectedForm, setSelectedForm] = useState<AssignedPatientForm | null>(null)
  const [signerName, setSignerName] = useState('')
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [medicalForm, setMedicalForm] = useState({
    allergies: '',
    medicalConditions: '',
    currentMedications: '',
    previousSurgeries: '',
    medicalNotes: '',
    confirmedNoAllergies: false,
  })

  async function load() {
    if (!user || user.role !== 'patient') return
    setLoading(true)
    setError(null)
    try {
      const resolved = await getCurrentPatientForAuthenticatedUser(user.id)
      if (!resolved) throw new Error('Your patient record could not be found.')
      setPatient(resolved)
      const [currentIntake, revisions, assignedForms] = await Promise.all([
        ensurePatientIntake(resolved.patientId),
        getMedicalHistoryRevisions(resolved.patientId),
        getAssignedPatientForms(resolved.patientId),
      ])
      setIntake(currentIntake)
      setHistory(revisions)
      setForms(assignedForms)
      const latest = revisions[0]
      setMedicalForm({
        allergies: latest?.allergies ?? resolved.allergies ?? '',
        medicalConditions: latest?.medicalConditions ?? resolved.medicalConditions ?? '',
        currentMedications: latest?.currentMedications ?? resolved.currentMedications ?? '',
        previousSurgeries: latest?.previousSurgeries ?? resolved.previousSurgeries ?? '',
        medicalNotes: latest?.medicalNotes ?? resolved.medicalNotes ?? '',
        confirmedNoAllergies: latest?.confirmedNoAllergies ?? false,
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load your intake information.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [user?.id])

  const requiredUnsignedForms = useMemo(
    () => forms.filter((form) => !['signed', 'declined', 'superseded'].includes(form.status)),
    [forms],
  )
  const signedCount = useMemo(() => forms.filter((form) => form.status === 'signed').length, [forms])
  const emergencyContactComplete = Boolean(patient?.emergencyContact.trim() && patient?.emergencyContactPhone.trim())
  const medicalHistoryComplete = Boolean(intake?.medicalHistoryConfirmedAt)
  const intakeComplete = Boolean(patient && emergencyContactComplete && medicalHistoryComplete && requiredUnsignedForms.length === 0)
  const previousMedicalHistory = history.slice(1)

  if (!user || user.role !== 'patient') return <Navigate to="/login" replace />
  if (patient && routePatientId && routePatientId !== patient.patientId) return <Navigate to={`/portal/${patient.patientId}/intake`} replace />

  async function saveMedicalHistory() {
    if (!patient || !intake) return
    setSaveState('saving')
    setError(null)
    try {
      const confirmedAt = await savePatientMedicalHistory({ patientId: patient.patientId, intakeId: intake.id, ...medicalForm })
      setIntake({ ...intake, medicalHistoryConfirmedAt: confirmedAt, status: 'in_progress', updatedAt: confirmedAt })
      setHistory(await getMedicalHistoryRevisions(patient.patientId))
      setSaveState('saved')
    } catch (saveError) {
      setSaveState('error')
      setError(saveError instanceof Error ? saveError.message : 'Medical history could not be saved.')
    }
  }

  async function openForm(form: AssignedPatientForm) {
    setFormError(null)
    setSelectedForm(form)
    setSignerName(patient ? `${patient.firstName} ${patient.lastName}`.trim() : '')
    setSignatureBlob(null)
    if (form.status === 'assigned') {
      try {
        await markAssignedFormViewed(form.assignmentId)
        setForms((current) => current.map((entry) => entry.assignmentId === form.assignmentId ? { ...entry, status: 'viewed' } : entry))
      } catch {
        // Opening remains useful if the non-critical viewed marker fails.
      }
    }
  }

  async function submitForm(decline = false) {
    if (!selectedForm) return
    setFormSubmitting(true)
    setFormError(null)
    try {
      await submitAssignedForm({
        form: selectedForm,
        signedByName: signerName,
        decline,
        signatureBlob: decline ? undefined : signatureBlob ?? undefined,
      })
      const nextStatus = decline ? 'declined' : 'signed'
      setForms((current) => current.map((entry) => entry.assignmentId === selectedForm.assignmentId ? { ...entry, status: nextStatus } : entry))
      setSelectedForm(null)
      setSignerName('')
      setSignatureBlob(null)
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Consent could not be submitted.')
    } finally {
      setFormSubmitting(false)
    }
  }

  async function submitIntake() {
    if (!intake || !intakeComplete) return
    setSubmitState('submitting')
    setError(null)
    try {
      const updated = await submitPatientIntake(intake.id)
      setIntake(updated)
      setSubmitState('done')
    } catch (submitError) {
      setSubmitState('error')
      setError(submitError instanceof Error ? submitError.message : 'Intake could not be submitted.')
    }
  }

  if (loading) {
    return (
      <main className="page-stack portal-intake-page">
        <SkeletonCard>
          <SkeletonText lines={3} widths={['180px', 'min(520px, 82%)', 'min(420px, 70%)']} />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonList items={4} withAvatar={false} />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonText lines={5} widths={['220px', '96%', '92%', '88%', '72%']} />
        </SkeletonCard>
      </main>
    )
  }

  if (error && !patient) {
    return <main className="page-stack portal-intake-page"><div className="panel empty-state-panel"><AlertCircle size={24} /><h2>Could not load your intake</h2><p>{error}</p><Button onClick={() => void load()}>Retry</Button></div></main>
  }

  if (!patient || !intake) return null

  const signatureNeedsTypedName = selectedForm?.requiresSignature && selectedForm.signatureMethod === 'typed_acknowledgement'
  const signatureNeedsDrawing = selectedForm?.requiresSignature && selectedForm.signatureMethod === 'drawn'
  const canSubmitSelectedForm = Boolean(
    selectedForm
      && !formSubmitting
      && (!signatureNeedsTypedName || signerName.trim())
      && (!signatureNeedsDrawing || signatureBlob),
  )

  return (
    <main className="page-stack portal-intake-page">
      <header className="page-header">
        <div>
          <Link className="text-button" to={`/portal/${patient.patientId}`}><ArrowLeft size={15} /> Back to Patient Portal</Link>
          <p className="eyebrow">Pre-Visit Intake</p>
          <h1>Review your information before your visit</h1>
          <p>Update your medical history and complete only the clinic forms currently assigned to you.</p>
        </div>
        <Badge tone={intake.status === 'submitted' || intake.status === 'complete' ? 'success' : 'warning'}>{statusLabel(intake.status)}</Badge>
      </header>

      {error && <div className="error-alert"><AlertCircle size={17} /> {error}</div>}

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">Checklist</p><h2>Visit preparation</h2></div><ClipboardList size={20} /></div>
        <div className="intake-checklist-grid">
          <article><CheckCircle2 size={18} /><strong>Personal Information</strong><span>{patient.firstName} {patient.lastName}</span></article>
          <article className={medicalHistoryComplete ? '' : 'needs-attention'}>{medicalHistoryComplete ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<strong>Medical History</strong><span>{medicalHistoryComplete ? `Confirmed ${formatDateTime(intake.medicalHistoryConfirmedAt)}` : 'Needs review'}</span></article>
          <article className={emergencyContactComplete ? '' : 'needs-attention'}>{emergencyContactComplete ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<strong>Emergency Contact</strong><span>{emergencyContactComplete ? `${patient.emergencyContact} · ${patient.emergencyContactPhone}` : 'Missing information'}</span></article>
          <article className={requiredUnsignedForms.length ? 'needs-attention' : ''}>{requiredUnsignedForms.length ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}<strong>Clinic Forms</strong><span>{forms.length ? `${signedCount} signed · ${requiredUnsignedForms.length} remaining` : 'No forms currently required'}</span></article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">Patient Safety</p><h2>Medical history</h2></div><HeartPulse size={20} /></div>
        <p className="muted-label">This is patient-submitted information for your dentist to review. It does not indicate medical clearance.</p>
        <div className="form-grid">
          <Textarea label="Allergies" value={medicalForm.allergies} disabled={medicalForm.confirmedNoAllergies} onChange={(event) => setMedicalForm({ ...medicalForm, allergies: event.target.value })} />
          <Textarea label="Current medications" value={medicalForm.currentMedications} onChange={(event) => setMedicalForm({ ...medicalForm, currentMedications: event.target.value })} />
          <Textarea label="Medical conditions" value={medicalForm.medicalConditions} onChange={(event) => setMedicalForm({ ...medicalForm, medicalConditions: event.target.value })} />
          <Textarea label="Previous surgeries / hospitalizations" value={medicalForm.previousSurgeries} onChange={(event) => setMedicalForm({ ...medicalForm, previousSurgeries: event.target.value })} />
        </div>
        <Textarea label="Other medical information your dentist should know" value={medicalForm.medicalNotes} onChange={(event) => setMedicalForm({ ...medicalForm, medicalNotes: event.target.value })} />
        <label className="intake-confirmation-row"><input type="checkbox" checked={medicalForm.confirmedNoAllergies} onChange={(event) => setMedicalForm({ ...medicalForm, confirmedNoAllergies: event.target.checked, allergies: event.target.checked ? '' : medicalForm.allergies })} /><span>I confirm that I currently have no allergies to record.</span></label>
        <div className="action-buttons"><Button onClick={() => void saveMedicalHistory()} disabled={saveState === 'saving'}><Save size={15} /> {saveState === 'saving' ? 'Saving...' : 'Save & Confirm Medical History'}</Button>{saveState === 'saved' && <span className="success-text"><CheckCircle2 size={15} /> Saved successfully</span>}</div>
        {previousMedicalHistory.length > 0 && (
          <section className="medical-history-revision-history" aria-labelledby="medical-history-history-title">
            <div className="medical-history-history-head">
              <div><p className="eyebrow">Revision history</p><h3 id="medical-history-history-title">Previous medical-history submissions</h3></div>
              <span>{previousMedicalHistory.length} previous</span>
            </div>
            <p className="muted-label">Current allergies, medications, and conditions remain above. Older submissions are retained here for traceability.</p>
            <div className="medical-history-revision-list" tabIndex={0}>
              {previousMedicalHistory.map((revision) => (
                <article key={revision.id} className="medical-history-revision-card">
                  <header><div><strong>{formatDateTime(revision.changedAt)}</strong><span>{statusLabel(revision.source)}</span></div>{revision.confirmedNoAllergies && <Badge tone="success">No allergies confirmed</Badge>}</header>
                  <dl>
                    <div><dt>Allergies</dt><dd>{revision.confirmedNoAllergies ? 'Patient confirmed no allergies.' : medicalValue(revision.allergies)}</dd></div>
                    <div><dt>Current medications</dt><dd>{medicalValue(revision.currentMedications)}</dd></div>
                    <div><dt>Medical conditions</dt><dd>{medicalValue(revision.medicalConditions)}</dd></div>
                    <div><dt>Previous surgeries / hospitalizations</dt><dd>{medicalValue(revision.previousSurgeries)}</dd></div>
                    <div><dt>Other medical information</dt><dd>{medicalValue(revision.medicalNotes)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        )}
      </section>

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">Forms & Consent</p><h2>Assigned clinic forms</h2></div><FileSignature size={20} /></div>
        {forms.length === 0 ? (
          <div className="empty-state-panel"><ShieldCheck size={22} /><h3>No forms currently required</h3><p>The clinic has not assigned any consent forms to this patient record.</p></div>
        ) : (
          <div className="intake-form-list">
            {forms.map((form) => (
              <button type="button" className="intake-form-row" key={form.assignmentId} onClick={() => void openForm(form)} disabled={['signed', 'declined', 'superseded'].includes(form.status)}>
                <div><strong>{form.title}</strong><span>{form.description || statusLabel(form.category)} · Version {form.versionNumber}</span></div>
                <Badge tone={form.status === 'signed' ? 'success' : form.status === 'declined' ? 'danger' : form.status === 'superseded' ? 'neutral' : 'warning'}>{statusLabel(form.status)}</Badge>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel intake-submit-panel">
        <div><h2>{intakeComplete ? 'Your intake is ready to submit' : 'Complete the remaining items'}</h2><p>{intakeComplete ? 'Submitting confirms the administrative intake is complete. It does not indicate medical clearance.' : 'Medical history, emergency contact, and assigned forms must be completed first.'}</p></div>
        <Button onClick={() => void submitIntake()} disabled={!intakeComplete || submitState === 'submitting' || intake.status === 'submitted'}>{submitState === 'submitting' ? 'Submitting...' : intake.status === 'submitted' ? 'Submitted' : 'Submit Intake'}</Button>
      </section>

      {selectedForm && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal intake-consent-modal" role="dialog" aria-modal="true" aria-labelledby="intake-form-title">
            <div className="modal-header"><div><p className="eyebrow">Version {selectedForm.versionNumber}</p><h2 id="intake-form-title">{selectedForm.title}</h2></div><Button variant="secondary" onClick={() => { setSelectedForm(null); setSignatureBlob(null) }}>Close</Button></div>
            <div className="intake-form-content" style={{ whiteSpace: 'pre-wrap' }}>{selectedForm.content}</div>

            {selectedForm.requiresSignature && selectedForm.signatureMethod === 'typed_acknowledgement' && (
              <>
                <Input label="Signer name" value={signerName} onChange={(event) => setSignerName(event.target.value)} />
                <p className="muted-label">This form is configured for typed-name acknowledgement. It is not displayed as a handwritten signature.</p>
              </>
            )}

            {selectedForm.requiresSignature && selectedForm.signatureMethod === 'drawn' && (
              <div className="page-stack">
                <Input label="Signer name" value={signerName} onChange={(event) => setSignerName(event.target.value)} />
                <div><strong>Draw your signature</strong><p className="muted-label">The drawing is stored privately for this submission only.</p></div>
                <SignaturePad onChange={setSignatureBlob} />
              </div>
            )}

            {(!selectedForm.requiresSignature || selectedForm.signatureMethod === 'none') && (
              <p className="muted-label">This version does not require a drawn signature. Submitting records your acknowledgement against this exact form version.</p>
            )}

            <p className="muted-label">Your submission is stored against this exact form version. Historical signed content cannot be rewritten by later template changes.</p>
            {formError && <div className="error-alert"><AlertCircle size={16} /> {formError}</div>}
            <div className="action-buttons">
              <Button variant="secondary" disabled={formSubmitting} onClick={() => void submitForm(true)}>Decline</Button>
              <Button disabled={!canSubmitSelectedForm} onClick={() => void submitForm(false)}>{formSubmitting ? 'Submitting...' : selectedForm.signatureMethod === 'drawn' ? 'Sign & Submit' : selectedForm.signatureMethod === 'typed_acknowledgement' ? 'Acknowledge & Submit' : 'Submit'}</Button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
