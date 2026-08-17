import { useState } from 'react'
import { AlertTriangle, ClipboardList, FileText, Pill, Plus, Save, ShieldCheck, X } from 'lucide-react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import type { Appointment } from '../appointments/appointmentTypes'
import type { Branch } from '../branches/branchTypes'
import type { Provider } from '../dentists/dentistTypes'
import { createDocument, getDocumentsByPatient, type PatientDocument } from '../documents/documentStore'
import { DocumentUploadPanel } from '../documents/DocumentUploadPanel'
import type { Patient } from '../patients/patientTypes'
import { createPrescription, getPrescriptionsByClinicalVisit, type Prescription } from '../prescriptions/prescriptionStore'
import type { Service } from '../services/serviceTypes'
import { createTreatment, getTreatmentsByClinicalVisit } from '../treatments/treatmentStore'
import type { Treatment, TreatmentFormValues } from '../treatments/treatmentTypes'
import {
  addClinicalRecordAmendment,
  finalizeDentalRecord,
  updateDentalRecord,
} from './dentalRecordStore'
import type { DentalRecord, DentalRecordFormValues } from './dentalRecordTypes'

type ClinicalVisitWorkspaceProps = {
  record: DentalRecord
  patient: Patient
  appointment?: Appointment
  branch?: Branch
  provider?: Provider
  services: Service[]
  actor: string
  canEditDraft: boolean
  canFinalize: boolean
  canAmend: boolean
  canCreateTreatment: boolean
  canCreatePrescription: boolean
  canUploadDocuments: boolean
  onClose: () => void
  onRecordChange: (record: DentalRecord) => void
}

const emptyPrescriptionItem = {
  medication: '',
  strength: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
}

function formatDate(value?: string) {
  if (!value) return 'Not scheduled'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100)
}

function buildForm(record: DentalRecord): DentalRecordFormValues {
  return {
    patientId: record.patientId,
    relatedAppointmentId: record.relatedAppointmentId,
    appointmentNumber: record.appointmentNumber,
    branchId: record.branchId,
    providerId: record.providerId,
    providerNameSnapshot: record.providerNameSnapshot,
    recordDate: record.recordDate,
    visitType: record.visitType,
    chiefComplaint: record.chiefComplaint,
    clinicalFindings: record.clinicalFindings,
    assessment: record.assessment,
    treatmentPerformed: record.treatmentPerformed,
    recommendations: record.recommendations,
    patientVisibleSummary: record.patientVisibleSummary,
    findings: record.findings,
    diagnosis: record.diagnosis,
    treatmentPlan: record.treatmentPlan,
    treatmentNotes: record.treatmentNotes,
    clinicalNotes: record.clinicalNotes,
    followUpRequired: record.followUpRequired,
    followUpDate: record.followUpDate,
    followUpNotes: record.followUpNotes,
    status: record.status,
    source: record.source,
    historicalProviderText: record.historicalProviderText,
    finalizedAt: record.finalizedAt,
    finalizedBy: record.finalizedBy,
    lastUpdatedBy: record.lastUpdatedBy,
    createdBy: record.createdBy,
  }
}

export function ClinicalVisitWorkspace({
  record,
  patient,
  appointment,
  branch,
  provider,
  services,
  actor,
  canEditDraft,
  canFinalize,
  canAmend,
  canCreateTreatment,
  canCreatePrescription,
  canUploadDocuments,
  onClose,
  onRecordChange,
}: ClinicalVisitWorkspaceProps) {
  const [form, setForm] = useState<DentalRecordFormValues>(() => buildForm(record))
  const [treatmentDraft, setTreatmentDraft] = useState<TreatmentFormValues>(() => ({
    patientId: patient.patientId,
    dentalRecordId: record.id,
    appointmentId: appointment?.id,
    appointmentNumber: appointment?.appointmentNumber,
    branchId: branch?.id,
    providerId: provider?.id,
    providerNameSnapshot: provider?.displayName,
    serviceId: services[0]?.id ?? '',
    serviceNameSnapshot: services[0]?.name ?? '',
    toothNumber: undefined,
    description: '',
    cost: services[0]?.price ?? 0,
    priceSnapshotCents: services[0]?.price ?? 0,
    quantity: 1,
    status: 'completed',
    treatmentDate: record.recordDate,
    notes: '',
    performedBy: provider?.displayName ?? actor,
    createdBy: actor,
  }))
  const [prescriptionItems, setPrescriptionItems] = useState([emptyPrescriptionItem])
  const [prescriptionNotes, setPrescriptionNotes] = useState('')
  const [amendment, setAmendment] = useState({ amendmentText: '', reason: '' })
  const [message, setMessage] = useState<string | null>(null)
  const [related, setRelated] = useState<{
    treatments: Treatment[]
    prescriptions: Prescription[]
    documents: PatientDocument[]
  }>(() => ({
    treatments: getTreatmentsByClinicalVisit(record.id),
    prescriptions: getPrescriptionsByClinicalVisit(record.id),
    documents: getDocumentsByPatient(patient.patientId).filter((document) => document.clinicalVisitId === record.id),
  }))

  const alerts = [
    patient.allergies && { label: 'Allergy', value: patient.allergies },
    patient.medicalConditions && { label: 'Medical condition', value: patient.medicalConditions },
    patient.currentMedications && { label: 'Current medication', value: patient.currentMedications },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  function refreshRelated() {
    setRelated({
      treatments: getTreatmentsByClinicalVisit(record.id),
      prescriptions: getPrescriptionsByClinicalVisit(record.id),
      documents: getDocumentsByPatient(patient.patientId).filter((document) => document.clinicalVisitId === record.id),
    })
  }

  const { treatments, prescriptions, documents } = related
  const isFinal = record.status === 'finalized' || record.status === 'amended'
  const canWriteDraft = canEditDraft && !isFinal

  function saveDraft() {
    const updated = updateDentalRecord(record.id, {
      ...form,
      findings: form.clinicalFindings,
      diagnosis: form.assessment,
      treatmentPlan: form.recommendations,
      treatmentNotes: form.treatmentPerformed,
      lastUpdatedBy: actor,
    })
    if (updated) {
      onRecordChange(updated)
      setMessage('Draft saved.')
    }
  }

  function finalizeRecord() {
    if (!window.confirm('Finalize Clinical Record? Finalized documentation becomes part of permanent clinical history.')) return
    const updated = finalizeDentalRecord(record.id, actor)
    if (updated) {
      onRecordChange(updated)
      setMessage('Clinical record finalized.')
    }
  }

  function addTreatment() {
    if (!treatmentDraft.serviceId || !treatmentDraft.description.trim()) return
    const service = services.find((entry) => entry.id === treatmentDraft.serviceId)
    createTreatment({
      ...treatmentDraft,
      serviceNameSnapshot: service?.name ?? treatmentDraft.serviceNameSnapshot,
      priceSnapshotCents: treatmentDraft.priceSnapshotCents || service?.price || treatmentDraft.cost,
      cost: treatmentDraft.priceSnapshotCents || service?.price || treatmentDraft.cost,
    })
    setTreatmentDraft({ ...treatmentDraft, description: '', notes: '' })
    refreshRelated()
    setMessage('Treatment added.')
  }

  function addPrescription() {
    createPrescription({
      patientId: patient.patientId,
      dentalRecordId: record.id,
      appointmentId: appointment?.id,
      branchId: branch?.id,
      providerId: provider?.id,
      providerNameSnapshot: provider?.displayName,
      items: prescriptionItems,
      notes: prescriptionNotes,
      prescribedBy: provider?.displayName ?? actor,
      prescriptionDate: record.recordDate,
    })
    setPrescriptionItems([emptyPrescriptionItem])
    setPrescriptionNotes('')
    refreshRelated()
    setMessage('Prescription saved.')
  }

  function submitAmendment() {
    const added = addClinicalRecordAmendment(record.id, {
      amendmentText: amendment.amendmentText,
      reason: amendment.reason,
      author: actor,
      providerId: provider?.id,
    })
    if (added) {
      onRecordChange({ ...record, status: 'amended', lastUpdatedBy: actor, updatedAt: added.createdAt })
      setAmendment({ amendmentText: '', reason: '' })
      setMessage('Amendment added.')
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal clinical-workspace-modal" role="dialog" aria-modal="true" aria-labelledby="clinical-workspace-title">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{appointment?.appointmentNumber ?? record.appointmentNumber ?? 'Clinical visit'}</p>
            <h2 id="clinical-workspace-title">{patient.firstName} {patient.lastName}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close clinical workspace" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="clinical-workspace-grid">
          <main className="clinical-workspace-main">
            {message && <div className="success-alert">{message}</div>}

            <section className="clinical-section">
              <div className="clinical-section-header">
                <h3>Clinical Documentation</h3>
                <Badge tone={isFinal ? 'success' : 'warning'}>{record.status}</Badge>
              </div>
              <div className="form-grid">
                <Input label="Chief complaint" value={form.chiefComplaint} onChange={(event) => setForm({ ...form, chiefComplaint: event.target.value })} disabled={!canWriteDraft} />
                <Select
                  label="Visit type"
                  value={form.visitType}
                  onChange={(event) => setForm({ ...form, visitType: event.target.value as DentalRecordFormValues['visitType'] })}
                  disabled={!canWriteDraft}
                  options={[
                    { label: 'Consultation', value: 'consultation' },
                    { label: 'Cleaning', value: 'cleaning' },
                    { label: 'Filling', value: 'filling' },
                    { label: 'Extraction', value: 'extraction' },
                    { label: 'Root canal', value: 'root_canal' },
                    { label: 'Crown', value: 'crown' },
                    { label: 'Follow-up', value: 'follow_up' },
                    { label: 'Other', value: 'other' },
                  ]}
                />
              </div>
              <Textarea label="Clinical findings" value={form.clinicalFindings} onChange={(event) => setForm({ ...form, clinicalFindings: event.target.value })} disabled={!canWriteDraft} />
              <Textarea label="Assessment" value={form.assessment} onChange={(event) => setForm({ ...form, assessment: event.target.value })} disabled={!canWriteDraft} />
              <Textarea label="Treatment performed" value={form.treatmentPerformed} onChange={(event) => setForm({ ...form, treatmentPerformed: event.target.value })} disabled={!canWriteDraft} />
              <Textarea label="Clinical notes" value={form.clinicalNotes} onChange={(event) => setForm({ ...form, clinicalNotes: event.target.value })} disabled={!canWriteDraft} />
              <Textarea label="Recommendations" value={form.recommendations} onChange={(event) => setForm({ ...form, recommendations: event.target.value })} disabled={!canWriteDraft} />
              <Textarea label="Patient-visible summary" value={form.patientVisibleSummary} onChange={(event) => setForm({ ...form, patientVisibleSummary: event.target.value })} disabled={!canWriteDraft} />
              <div className="form-grid">
                <Select
                  label="Follow-up required"
                  value={form.followUpRequired ? 'yes' : 'no'}
                  onChange={(event) => setForm({ ...form, followUpRequired: event.target.value === 'yes' })}
                  disabled={!canWriteDraft}
                  options={[{ label: 'No', value: 'no' }, { label: 'Yes', value: 'yes' }]}
                />
                <Input label="Follow-up date" type="date" value={form.followUpDate} onChange={(event) => setForm({ ...form, followUpDate: event.target.value })} disabled={!canWriteDraft} />
              </div>
              <Textarea label="Follow-up notes" value={form.followUpNotes} onChange={(event) => setForm({ ...form, followUpNotes: event.target.value })} disabled={!canWriteDraft} />
              <div className="action-buttons">
                <Button variant="secondary" onClick={saveDraft} disabled={!canWriteDraft}><Save size={14} /> Save Draft</Button>
                <Button onClick={finalizeRecord} disabled={!canFinalize || isFinal}><ShieldCheck size={14} /> Finalize Record</Button>
              </div>
            </section>

            <section className="clinical-section">
              <div className="clinical-section-header"><h3>Treatment Performed</h3><Badge tone="info">{treatments.length}</Badge></div>
              {canCreateTreatment && !isFinal && (
                <div className="clinical-inline-form">
                  <Select
                    label="Procedure"
                    value={treatmentDraft.serviceId}
                    onChange={(event) => {
                      const service = services.find((entry) => entry.id === event.target.value)
                      setTreatmentDraft({
                        ...treatmentDraft,
                        serviceId: event.target.value,
                        serviceNameSnapshot: service?.name ?? '',
                        priceSnapshotCents: service?.price ?? 0,
                        cost: service?.price ?? 0,
                      })
                    }}
                    options={services.map((service) => ({ label: `${service.name} - ${formatCurrency(service.price)}`, value: service.id }))}
                  />
                  <Input label="Quantity" type="number" value={String(treatmentDraft.quantity)} onChange={(event) => setTreatmentDraft({ ...treatmentDraft, quantity: Number(event.target.value) || 1 })} />
                  <Input label="Price snapshot" type="number" value={String(treatmentDraft.priceSnapshotCents / 100)} onChange={(event) => setTreatmentDraft({ ...treatmentDraft, priceSnapshotCents: Math.round((Number(event.target.value) || 0) * 100) })} />
                  <Textarea label="Clinical description" value={treatmentDraft.description} onChange={(event) => setTreatmentDraft({ ...treatmentDraft, description: event.target.value })} />
                  <Textarea label="Treatment notes" value={treatmentDraft.notes} onChange={(event) => setTreatmentDraft({ ...treatmentDraft, notes: event.target.value })} />
                  <Button onClick={addTreatment}><Plus size={14} /> Add Treatment</Button>
                </div>
              )}
              <div className="clinical-linked-list">
                {treatments.map((treatment) => (
                  <article key={treatment.id}><strong>{treatment.serviceNameSnapshot || treatment.description}</strong><span>{treatment.performedBy} - {formatCurrency(treatment.priceSnapshotCents)}</span><p>{treatment.description}</p></article>
                ))}
                {!treatments.length && <div className="empty-state-panel">No treatments recorded for this visit.</div>}
              </div>
            </section>

            <section className="clinical-section">
              <div className="clinical-section-header"><h3>Prescriptions</h3><Pill size={16} /></div>
              {canCreatePrescription && !isFinal && (
                <div className="clinical-inline-form">
                  {prescriptionItems.map((item, index) => (
                    <div className="clinical-medication-grid" key={index}>
                      <Input label="Medication" value={item.medication} onChange={(event) => setPrescriptionItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, medication: event.target.value } : entry))} />
                      <Input label="Strength" value={item.strength} onChange={(event) => setPrescriptionItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, strength: event.target.value } : entry))} />
                      <Input label="Dosage" value={item.dosage} onChange={(event) => setPrescriptionItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, dosage: event.target.value } : entry))} />
                      <Input label="Frequency" value={item.frequency} onChange={(event) => setPrescriptionItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, frequency: event.target.value } : entry))} />
                      <Input label="Duration" value={item.duration} onChange={(event) => setPrescriptionItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, duration: event.target.value } : entry))} />
                      <Input label="Instructions" value={item.instructions} onChange={(event) => setPrescriptionItems((current) => current.map((entry, itemIndex) => itemIndex === index ? { ...entry, instructions: event.target.value } : entry))} />
                    </div>
                  ))}
                  <Button variant="secondary" onClick={() => setPrescriptionItems((current) => [...current, emptyPrescriptionItem])}>Add Medication</Button>
                  <Textarea label="Prescription notes" value={prescriptionNotes} onChange={(event) => setPrescriptionNotes(event.target.value)} />
                  <Button onClick={addPrescription}>Save Prescription</Button>
                </div>
              )}
              <div className="clinical-linked-list">
                {prescriptions.map((prescription) => (
                  <article key={prescription.id}><strong>{prescription.medication}</strong><span>{prescription.providerNameSnapshot || prescription.prescribedBy} - {formatDate(prescription.prescriptionDate)}</span></article>
                ))}
                {!prescriptions.length && <div className="empty-state-panel">No prescriptions recorded for this visit.</div>}
              </div>
            </section>

            <section className="clinical-section">
              <div className="clinical-section-header"><h3>Documents</h3><FileText size={16} /></div>
              {canUploadDocuments && (
                <DocumentUploadPanel
                  patientId={patient.patientId}
                  onUpload={(payload) => {
                    createDocument({ ...payload, clinicalVisitId: record.id, uploadedBy: actor })
                    refreshRelated()
                    setMessage('Document attached.')
                  }}
                />
              )}
              <div className="clinical-linked-list">
                {documents.map((document) => (
                  <article key={document.id}><strong>{document.fileName}</strong><span>{document.category} - {document.uploadedBy}</span></article>
                ))}
                {!documents.length && <div className="empty-state-panel">No documents attached to this visit.</div>}
              </div>
            </section>

            {isFinal && canAmend && (
              <section className="clinical-section">
                <div className="clinical-section-header"><h3>Amendment</h3><ClipboardList size={16} /></div>
                <Textarea label="Reason" value={amendment.reason} onChange={(event) => setAmendment({ ...amendment, reason: event.target.value })} />
                <Textarea label="Amendment text" value={amendment.amendmentText} onChange={(event) => setAmendment({ ...amendment, amendmentText: event.target.value })} />
                <Button onClick={submitAmendment}>Add Amendment</Button>
              </section>
            )}
          </main>

          <aside className="clinical-context-panel">
            <section>
              <h3>Visit Header</h3>
              <div className="clinical-context-list">
                <span>Patient: <strong>{patient.patientId}</strong></span>
                <span>DOB: <strong>{formatDate(patient.dateOfBirth)}</strong></span>
                <span>Branch: <strong>{branch?.name ?? 'Not assigned'}</strong></span>
                <span>Dentist: <strong>{provider?.displayName ?? record.providerNameSnapshot ?? actor}</strong></span>
                <span>Date: <strong>{formatDate(record.recordDate)}</strong></span>
                <span>Time: <strong>{appointment ? `${appointment.startTime} - ${appointment.endTime}` : 'Walk-in or historical'}</strong></span>
              </div>
            </section>
            <section>
              <h3>Patient Alerts</h3>
              {alerts.length ? alerts.map((alert) => (
                <div className="clinical-alert" key={alert.label}><AlertTriangle size={15} /><span><strong>{alert.label}</strong>{alert.value}</span></div>
              )) : <p className="communication-muted">No allergies, conditions, or medications recorded.</p>}
            </section>
          </aside>
        </div>
      </section>
    </div>
  )
}
