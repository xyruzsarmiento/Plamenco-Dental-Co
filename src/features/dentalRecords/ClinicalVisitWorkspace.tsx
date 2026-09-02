import { useState } from 'react'
import { AlertTriangle, ClipboardList, FileText, Pill, Plus, Save, ShieldCheck, X } from 'lucide-react'
import { Badge, StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import type { Appointment } from '../appointments/appointmentTypes'
import type { Branch } from '../branches/branchTypes'
import type { Provider } from '../dentists/dentistTypes'
import { createDocumentPersisted, getDocumentsByPatient, type PatientDocument } from '../documents/documentStore'
import { DocumentUploadPanel } from '../documents/DocumentUploadPanel'
import type { Patient } from '../patients/patientTypes'
import { createPrescriptionPersisted, getPrescriptionsByClinicalVisit, type Prescription } from '../prescriptions/prescriptionStore'
import type { Service } from '../services/serviceTypes'
import { createTreatment, getTreatmentsByClinicalVisit } from '../treatments/treatmentStore'
import type { Treatment, TreatmentFormValues } from '../treatments/treatmentTypes'
import { finalizeDentalRecord, updateDentalRecord } from './dentalRecordStore'
import { addClinicalRecordAmendmentPersisted } from './clinicalAmendmentPersistence'
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

const emptyPrescriptionItem = { medication: '', strength: '', dosage: '', frequency: '', duration: '', instructions: '' }
function servicePriceCents(service?: Service) { return service ? Math.round(Number(service.price || 0) * 100) : 0 }
function formatDate(value?: string) { if (!value) return 'Not scheduled'; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
function formatCurrency(cents: number) { return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(cents / 100) }
function buildForm(record: DentalRecord): DentalRecordFormValues {
  return { patientId: record.patientId, relatedAppointmentId: record.relatedAppointmentId, appointmentNumber: record.appointmentNumber, branchId: record.branchId, providerId: record.providerId, providerNameSnapshot: record.providerNameSnapshot, recordDate: record.recordDate, visitType: record.visitType, chiefComplaint: record.chiefComplaint, clinicalFindings: record.clinicalFindings, assessment: record.assessment, treatmentPerformed: record.treatmentPerformed, recommendations: record.recommendations, patientVisibleSummary: record.patientVisibleSummary, findings: record.findings, diagnosis: record.diagnosis, treatmentPlan: record.treatmentPlan, treatmentNotes: record.treatmentNotes, clinicalNotes: record.clinicalNotes, followUpRequired: record.followUpRequired, followUpDate: record.followUpDate, followUpNotes: record.followUpNotes, status: record.status, source: record.source, historicalProviderText: record.historicalProviderText, finalizedAt: record.finalizedAt, finalizedBy: record.finalizedBy, lastUpdatedBy: record.lastUpdatedBy, createdBy: record.createdBy }
}

export function ClinicalVisitWorkspace({ record, patient, appointment, branch, provider, services, actor, canEditDraft, canFinalize, canAmend, canCreateTreatment, canCreatePrescription, canUploadDocuments, onClose, onRecordChange }: ClinicalVisitWorkspaceProps) {
  const [form, setForm] = useState<DentalRecordFormValues>(() => buildForm(record))
  const [treatmentDraft, setTreatmentDraft] = useState<TreatmentFormValues>(() => ({ patientId: patient.patientId, dentalRecordId: record.id, appointmentId: appointment?.id, appointmentNumber: appointment?.appointmentNumber, branchId: branch?.id, providerId: provider?.id, providerNameSnapshot: provider?.displayName, serviceId: services[0]?.id ?? '', serviceNameSnapshot: services[0]?.name ?? '', toothNumber: undefined, description: '', cost: services[0]?.price ?? 0, priceSnapshotCents: servicePriceCents(services[0]), quantity: 1, status: 'completed', treatmentDate: record.recordDate, notes: '', performedBy: provider?.displayName ?? actor, createdBy: actor }))
  const [prescriptionItems, setPrescriptionItems] = useState([emptyPrescriptionItem])
  const [prescriptionNotes, setPrescriptionNotes] = useState('')
  const [amendment, setAmendment] = useState({ amendmentText: '', reason: '' })
  const [message, setMessage] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [isSavingClinical, setIsSavingClinical] = useState(false)
  const [related, setRelated] = useState<{ treatments: Treatment[]; prescriptions: Prescription[]; documents: PatientDocument[] }>(() => ({ treatments: getTreatmentsByClinicalVisit(record.id), prescriptions: getPrescriptionsByClinicalVisit(record.id), documents: getDocumentsByPatient(patient.patientId).filter((document) => document.clinicalVisitId === record.id) }))

  const alerts = [patient.allergies && { label: 'Allergy', value: patient.allergies }, patient.medicalConditions && { label: 'Medical condition', value: patient.medicalConditions }, patient.currentMedications && { label: 'Current medication', value: patient.currentMedications }].filter(Boolean) as Array<{ label: string; value: string }>
  function refreshRelated() { setRelated({ treatments: getTreatmentsByClinicalVisit(record.id), prescriptions: getPrescriptionsByClinicalVisit(record.id), documents: getDocumentsByPatient(patient.patientId).filter((document) => document.clinicalVisitId === record.id) }) }
  const { treatments, prescriptions, documents } = related
  const isFinal = record.status === 'finalized' || record.status === 'amended'
  const canWriteDraft = canEditDraft && !isFinal

  async function saveDraft() {
    if (isSavingClinical || !canWriteDraft) return
    setIsSavingClinical(true); setMutationError(null); setMessage(null)
    try { const updated = await updateDentalRecord(record.id, { ...form, findings: form.clinicalFindings, diagnosis: form.assessment, treatmentPlan: form.recommendations, treatmentNotes: form.treatmentPerformed, lastUpdatedBy: actor }); onRecordChange(updated); setForm(buildForm(updated)); setMessage('Draft saved.') }
    catch (cause) { setMutationError(cause instanceof Error ? cause.message : 'Clinical draft could not be saved.') }
    finally { setIsSavingClinical(false) }
  }

  async function finalizeRecord() {
    if (isSavingClinical || !canFinalize || isFinal) return
    if (!window.confirm('Finalize Clinical Record? Finalized documentation becomes part of permanent clinical history.')) return
    setIsSavingClinical(true); setMutationError(null); setMessage(null)
    try { const updated = await finalizeDentalRecord(record.id, actor); onRecordChange(updated); setForm(buildForm(updated)); setMessage('Clinical record finalized.') }
    catch (cause) { setMutationError(cause instanceof Error ? cause.message : 'Clinical record could not be finalized.') }
    finally { setIsSavingClinical(false) }
  }

  async function addTreatment() {
    if (isSavingClinical || !treatmentDraft.serviceId || !treatmentDraft.description.trim()) return
    const service = services.find((entry) => entry.id === treatmentDraft.serviceId)
    setIsSavingClinical(true); setMutationError(null); setMessage(null)
    try {
      const cents = treatmentDraft.priceSnapshotCents || servicePriceCents(service)
      await createTreatment({ ...treatmentDraft, serviceNameSnapshot: service?.name ?? treatmentDraft.serviceNameSnapshot, priceSnapshotCents: cents, cost: cents / 100 })
      setTreatmentDraft({ ...treatmentDraft, description: '', notes: '' }); refreshRelated(); setMessage('Treatment added.')
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : 'Treatment could not be saved.') }
    finally { setIsSavingClinical(false) }
  }

  async function addPrescription() {
    if (isSavingClinical) return
    setIsSavingClinical(true); setMutationError(null); setMessage(null)
    try {
      await createPrescriptionPersisted({ patientId: patient.patientId, dentalRecordId: record.id, appointmentId: appointment?.id, branchId: branch?.id ?? appointment?.branchId ?? record.branchId, providerId: provider?.id, providerNameSnapshot: provider?.displayName, items: prescriptionItems, notes: prescriptionNotes, prescribedBy: provider?.displayName ?? actor, prescriptionDate: record.recordDate })
      setPrescriptionItems([emptyPrescriptionItem]); setPrescriptionNotes(''); refreshRelated(); setMessage('Prescription saved.')
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : 'Prescription could not be saved.') }
    finally { setIsSavingClinical(false) }
  }

  async function submitAmendment() {
    if (isSavingClinical) return
    if (!amendment.reason.trim() || !amendment.amendmentText.trim()) { setMutationError('Amendment reason and text are required.'); return }
    setIsSavingClinical(true); setMutationError(null); setMessage(null)
    try {
      const added = await addClinicalRecordAmendmentPersisted({ dentalRecordId: record.id, amendmentText: amendment.amendmentText.trim(), reason: amendment.reason.trim(), providerId: provider?.id })
      onRecordChange({ ...record, status: 'amended', lastUpdatedBy: added.author, updatedAt: added.createdAt }); setAmendment({ amendmentText: '', reason: '' }); setMessage('Amendment added.')
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : 'Clinical amendment could not be saved.') }
    finally { setIsSavingClinical(false) }
  }

  return <div className="modal-backdrop" role="presentation"><section className="modal clinical-workspace-modal" role="dialog" aria-modal="true" aria-labelledby="clinical-workspace-title">
    <div className="modal-header"><div><p className="eyebrow">{appointment?.appointmentNumber ?? record.appointmentNumber ?? 'Clinical visit'}</p><h2 id="clinical-workspace-title">{patient.firstName} {patient.lastName}</h2></div><button className="icon-button" type="button" aria-label="Close clinical workspace" onClick={onClose} disabled={isSavingClinical}><X size={18}/></button></div>
    <div className="clinical-workspace-grid"><main className="clinical-workspace-main">
      {message && <div className="success-alert">{message}</div>}{mutationError && <div className="error-alert" role="alert">{mutationError}</div>}
      <section className="clinical-section"><div className="clinical-section-header"><h3>Clinical Documentation</h3><StatusBadge status={record.status} /></div>
        <div className="form-grid"><Input label="Chief complaint" value={form.chiefComplaint} onChange={(e)=>setForm({...form,chiefComplaint:e.target.value})} disabled={!canWriteDraft||isSavingClinical}/><Select label="Visit type" value={form.visitType} onChange={(e)=>setForm({...form,visitType:e.target.value as DentalRecordFormValues['visitType']})} disabled={!canWriteDraft||isSavingClinical} options={[{label:'Consultation',value:'consultation'},{label:'Cleaning',value:'cleaning'},{label:'Filling',value:'filling'},{label:'Extraction',value:'extraction'},{label:'Root canal',value:'root_canal'},{label:'Crown',value:'crown'},{label:'Follow-up',value:'follow_up'},{label:'Other',value:'other'}]}/></div>
        <Textarea label="Clinical findings" value={form.clinicalFindings} onChange={(e)=>setForm({...form,clinicalFindings:e.target.value})} disabled={!canWriteDraft||isSavingClinical}/><Textarea label="Assessment" value={form.assessment} onChange={(e)=>setForm({...form,assessment:e.target.value})} disabled={!canWriteDraft||isSavingClinical}/><Textarea label="Treatment performed" value={form.treatmentPerformed} onChange={(e)=>setForm({...form,treatmentPerformed:e.target.value})} disabled={!canWriteDraft||isSavingClinical}/><Textarea label="Clinical notes" value={form.clinicalNotes} onChange={(e)=>setForm({...form,clinicalNotes:e.target.value})} disabled={!canWriteDraft||isSavingClinical}/><Textarea label="Recommendations" value={form.recommendations} onChange={(e)=>setForm({...form,recommendations:e.target.value})} disabled={!canWriteDraft||isSavingClinical}/><Textarea label="Patient-visible summary" value={form.patientVisibleSummary} onChange={(e)=>setForm({...form,patientVisibleSummary:e.target.value})} disabled={!canWriteDraft||isSavingClinical}/>
        <div className="form-grid"><Select label="Follow-up required" value={form.followUpRequired?'yes':'no'} onChange={(e)=>setForm({...form,followUpRequired:e.target.value==='yes'})} disabled={!canWriteDraft||isSavingClinical} options={[{label:'No',value:'no'},{label:'Yes',value:'yes'}]}/><Input label="Follow-up date" type="date" value={form.followUpDate} onChange={(e)=>setForm({...form,followUpDate:e.target.value})} disabled={!canWriteDraft||isSavingClinical}/></div><Textarea label="Follow-up notes" value={form.followUpNotes} onChange={(e)=>setForm({...form,followUpNotes:e.target.value})} disabled={!canWriteDraft||isSavingClinical}/><div className="action-buttons"><Button variant="secondary" onClick={()=>void saveDraft()} disabled={!canWriteDraft||isSavingClinical}><Save size={14}/> {isSavingClinical?'Saving…':'Save Draft'}</Button><Button onClick={()=>void finalizeRecord()} disabled={!canFinalize||isFinal||isSavingClinical}><ShieldCheck size={14}/> {isSavingClinical?'Saving…':'Finalize Record'}</Button></div>
      </section>
      <section className="clinical-section"><div className="clinical-section-header"><h3>Treatment Performed</h3><Badge tone="info">{treatments.length}</Badge></div>{canCreateTreatment&&!isFinal&&<div className="clinical-inline-form"><Select label="Procedure" value={treatmentDraft.serviceId} onChange={(e)=>{const s=services.find(x=>x.id===e.target.value);const cents=servicePriceCents(s);setTreatmentDraft({...treatmentDraft,serviceId:e.target.value,serviceNameSnapshot:s?.name??'',priceSnapshotCents:cents,cost:cents/100})}} options={services.map(s=>({label:`${s.name} - ${formatCurrency(servicePriceCents(s))}`,value:s.id}))}/><Input label="Quantity" type="number" value={String(treatmentDraft.quantity)} onChange={(e)=>setTreatmentDraft({...treatmentDraft,quantity:Number(e.target.value)||1})}/><Input label="Price snapshot" type="number" value={String(treatmentDraft.priceSnapshotCents/100)} onChange={(e)=>{const cents=Math.round((Number(e.target.value)||0)*100);setTreatmentDraft({...treatmentDraft,priceSnapshotCents:cents,cost:cents/100})}}/><Textarea label="Clinical description" value={treatmentDraft.description} onChange={(e)=>setTreatmentDraft({...treatmentDraft,description:e.target.value})}/><Textarea label="Treatment notes" value={treatmentDraft.notes} onChange={(e)=>setTreatmentDraft({...treatmentDraft,notes:e.target.value})}/><Button onClick={()=>void addTreatment()} disabled={isSavingClinical}><Plus size={14}/> {isSavingClinical?'Saving…':'Add Treatment'}</Button></div>}<div className="clinical-linked-list">{treatments.map(t=><article key={t.id}><strong>{t.serviceNameSnapshot||t.description}</strong><span>{t.performedBy} - {formatCurrency(t.priceSnapshotCents)}</span><p>{t.description}</p></article>)}{!treatments.length&&<div className="empty-state-panel">No treatments recorded for this visit.</div>}</div></section>
      <section className="clinical-section"><div className="clinical-section-header"><h3>Prescriptions</h3><Pill size={16}/></div>{canCreatePrescription&&!isFinal&&<div className="clinical-inline-form">{prescriptionItems.map((item,index)=><div className="clinical-medication-grid" key={index}><Input label="Medication" value={item.medication} onChange={(e)=>setPrescriptionItems(c=>c.map((x,i)=>i===index?{...x,medication:e.target.value}:x))} disabled={isSavingClinical}/><Input label="Strength" value={item.strength} onChange={(e)=>setPrescriptionItems(c=>c.map((x,i)=>i===index?{...x,strength:e.target.value}:x))} disabled={isSavingClinical}/><Input label="Dosage" value={item.dosage} onChange={(e)=>setPrescriptionItems(c=>c.map((x,i)=>i===index?{...x,dosage:e.target.value}:x))} disabled={isSavingClinical}/><Input label="Frequency" value={item.frequency} onChange={(e)=>setPrescriptionItems(c=>c.map((x,i)=>i===index?{...x,frequency:e.target.value}:x))} disabled={isSavingClinical}/><Input label="Duration" value={item.duration} onChange={(e)=>setPrescriptionItems(c=>c.map((x,i)=>i===index?{...x,duration:e.target.value}:x))} disabled={isSavingClinical}/><Input label="Instructions" value={item.instructions} onChange={(e)=>setPrescriptionItems(c=>c.map((x,i)=>i===index?{...x,instructions:e.target.value}:x))} disabled={isSavingClinical}/></div>)}<Button variant="secondary" onClick={()=>setPrescriptionItems(c=>[...c,emptyPrescriptionItem])} disabled={isSavingClinical}>Add Medication</Button><Textarea label="Prescription notes" value={prescriptionNotes} onChange={(e)=>setPrescriptionNotes(e.target.value)} disabled={isSavingClinical}/><Button onClick={()=>void addPrescription()} disabled={isSavingClinical}>{isSavingClinical?'Saving…':'Save Prescription'}</Button></div>}<div className="clinical-linked-list">{prescriptions.map(p=><article key={p.id}><strong>{p.medication}</strong><span>{p.providerNameSnapshot||p.prescribedBy} - {formatDate(p.prescriptionDate)}</span></article>)}{!prescriptions.length&&<div className="empty-state-panel">No prescriptions recorded for this visit.</div>}</div></section>
      <section className="clinical-section"><div className="clinical-section-header"><h3>Documents</h3><FileText size={16}/></div>{canUploadDocuments&&<DocumentUploadPanel patientId={patient.patientId} uploadedBy={actor} defaultPatientVisible={true} onUpload={async(payload)=>{setMutationError(null);setMessage(null);const confirmed=await createDocumentPersisted({...payload,clinicalVisitId:record.id,uploadedBy:actor,patientVisible:payload.patientVisible??true});refreshRelated();setMessage('Document attached.');return confirmed}}/>}<div className="clinical-linked-list">{documents.map(d=><article key={d.id}><strong>{d.fileName}</strong><span>{d.category} - {d.uploadedBy}</span></article>)}{!documents.length&&<div className="empty-state-panel">No documents attached to this visit.</div>}</div></section>
      {isFinal&&canAmend&&<section className="clinical-section"><div className="clinical-section-header"><h3>Amendment</h3><ClipboardList size={16}/></div><Textarea label="Reason" value={amendment.reason} onChange={(e)=>setAmendment({...amendment,reason:e.target.value})} disabled={isSavingClinical}/><Textarea label="Amendment text" value={amendment.amendmentText} onChange={(e)=>setAmendment({...amendment,amendmentText:e.target.value})} disabled={isSavingClinical}/><Button onClick={()=>void submitAmendment()} disabled={isSavingClinical}>{isSavingClinical?'Saving…':'Add Amendment'}</Button></section>}
    </main><aside className="clinical-context-panel"><section><h3>Visit Header</h3><div className="clinical-context-list"><span>Patient: <strong>{patient.patientId}</strong></span><span>DOB: <strong>{formatDate(patient.dateOfBirth)}</strong></span><span>Branch: <strong>{branch?.name??'Not assigned'}</strong></span><span>Dentist: <strong>{provider?.displayName??record.providerNameSnapshot??actor}</strong></span><span>Date: <strong>{formatDate(record.recordDate)}</strong></span><span>Time: <strong>{appointment?`${appointment.startTime} - ${appointment.endTime}`:'Walk-in or historical'}</strong></span></div></section><section><h3>Patient Alerts</h3>{alerts.length?alerts.map(a=><div className="clinical-alert" key={a.label}><AlertTriangle size={15}/><span><strong>{a.label}</strong>{a.value}</span></div>):<p className="communication-muted">No allergies, conditions, or medications recorded.</p>}</section></aside></div>
  </section></div>
}
