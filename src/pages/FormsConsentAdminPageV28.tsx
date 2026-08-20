import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  CheckCircle2,
  ClipboardSignature,
  FilePlus2,
  FileText,
  History,
  LockKeyhole,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { PageScaffold } from '../components/ui/PageScaffold'
import { getStoredBranches } from '../features/branches/branchStore'
import {
  archiveTemplate,
  assignPublishedForm,
  createFormTemplateDraft,
  createNextDraftVersion,
  listAssignments,
  listFormTemplates,
  listFormVersions,
  publishVersion,
  sanitizeFormPreview,
  updateDraftVersion,
  type FormAppliesTo,
  type FormCategory,
  type FormTemplateAdminRow,
  type FormVersionAdminRow,
  type SignatureMethod,
} from '../features/intake/formAdminStore'
import { getStoredPatients } from '../features/patients/patientStore'

const categories: Array<{ value: FormCategory; label: string }> = [
  { value: 'patient_registration', label: 'Patient Registration' },
  { value: 'medical_history', label: 'Medical History' },
  { value: 'general_consent', label: 'General Consent' },
  { value: 'data_privacy', label: 'Data Privacy' },
  { value: 'treatment_specific', label: 'Treatment-Specific' },
  { value: 'photo_image', label: 'Photo / Image' },
  { value: 'other', label: 'Other' },
]

const appliesToOptions: Array<{ value: FormAppliesTo; label: string }> = [
  { value: 'manual', label: 'Manual Assignment' },
  { value: 'new_patient', label: 'New Patient' },
  { value: 'clinic_wide', label: 'Clinic-Wide' },
  { value: 'appointment', label: 'Specific Appointment' },
  { value: 'treatment', label: 'Specific Treatment' },
]

const signatureMethods: Array<{ value: SignatureMethod; label: string }> = [
  { value: 'none', label: 'No signature / acknowledgement only' },
  { value: 'typed_acknowledgement', label: 'Typed name acknowledgement' },
  { value: 'drawn', label: 'Drawn signature' },
]

const blankCreate = {
  title: '', description: '', category: 'general_consent' as FormCategory,
  appliesTo: 'manual' as FormAppliesTo, content: '', requiresSignature: false,
  signatureMethod: 'none' as SignatureMethod, effectiveDate: '', branchId: '',
}

const blankAssign = { patientId: '', versionId: '', branchId: '', appointmentId: '', clinicalVisitId: '', treatmentPlanId: '', treatmentId: '' }

type ConfirmAction = 'publish' | 'archive' | null

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value?: string) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' })
}

function templateTone(status: string) {
  if (status === 'published') return 'success' as const
  if (status === 'archived') return 'neutral' as const
  return 'warning' as const
}

export function FormsConsentAdminPageV28() {
  const patients = useMemo(() => getStoredPatients(), [])
  const branches = useMemo(() => getStoredBranches(), [])
  const [templates, setTemplates] = useState<FormTemplateAdminRow[]>([])
  const [versions, setVersions] = useState<FormVersionAdminRow[]>([])
  const [assignmentCount, setAssignmentCount] = useState(0)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [createForm, setCreateForm] = useState(blankCreate)
  const [draftForm, setDraftForm] = useState({ content: '', requiresSignature: false, signatureMethod: 'none' as SignatureMethod, effectiveDate: '' })
  const [assignForm, setAssignForm] = useState(blankAssign)

  const selectedTemplate = templates.find((entry) => entry.id === selectedTemplateId) ?? null
  const selectedVersion = versions.find((entry) => entry.id === selectedVersionId) ?? versions[0] ?? null
  const selectedDraft = versions.find((entry) => entry.versionStatus === 'draft') ?? null
  const publishedVersionOptions = versions.filter((version) => version.versionStatus === 'published')
  const filteredTemplates = templates.filter((template) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || [template.title, template.description, template.category].join(' ').toLowerCase().includes(query)
    return matchesSearch && (statusFilter === 'all' || template.status === statusFilter)
  })

  const metrics = {
    templates: templates.length,
    published: templates.filter((entry) => entry.status === 'published').length,
    signatureRequired: templates.filter((entry) => entry.requiresSignature).length,
    assignments: assignmentCount,
  }

  async function loadTemplates(preferredId?: string) {
    setLoading(true)
    setError(null)
    try {
      const [rows, assignments] = await Promise.all([listFormTemplates(), listAssignments(500)])
      setTemplates(rows)
      setAssignmentCount(assignments.length)
      const nextId = preferredId ?? selectedTemplateId ?? rows[0]?.id ?? null
      setSelectedTemplateId(nextId)
      if (nextId) {
        const versionRows = await listFormVersions(nextId)
        setVersions(versionRows)
        setSelectedVersionId(versionRows[0]?.id ?? null)
      } else {
        setVersions([])
        setSelectedVersionId(null)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load forms.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadTemplates() }, [])

  useEffect(() => {
    if (!selectedTemplateId) return
    let active = true
    void listFormVersions(selectedTemplateId)
      .then((rows) => {
        if (!active) return
        setVersions(rows)
        setSelectedVersionId(rows[0]?.id ?? null)
      })
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : 'Could not load form versions.'))
    return () => { active = false }
  }, [selectedTemplateId])

  useEffect(() => {
    if (!selectedDraft) return
    setDraftForm({ content: selectedDraft.content, requiresSignature: selectedDraft.requiresSignature, signatureMethod: selectedDraft.signatureMethod, effectiveDate: selectedDraft.effectiveDate ?? '' })
  }, [selectedDraft?.id])

  function openAssign() {
    setAssignForm({ ...blankAssign, versionId: publishedVersionOptions[0]?.id ?? '' })
    setShowAssign(true)
  }

  async function handleCreate() {
    setBusy(true); setMessage(null); setError(null)
    try {
      const result = await createFormTemplateDraft(createForm)
      setCreateForm(blankCreate)
      setShowCreate(false)
      setMessage(`Draft version ${result.versionNumber} created. It is not visible or assignable to patients yet.`)
      await loadTemplates(result.templateId)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Draft could not be created.')
    } finally { setBusy(false) }
  }

  async function handleSaveDraft() {
    if (!selectedDraft) return
    setBusy(true); setMessage(null); setError(null)
    try {
      await updateDraftVersion({ versionId: selectedDraft.id, ...draftForm })
      setMessage(`Draft version ${selectedDraft.versionNumber} saved.`)
      await loadTemplates(selectedTemplateId ?? undefined)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Draft could not be saved.')
    } finally { setBusy(false) }
  }

  async function handlePublish() {
    if (!selectedDraft) return
    setBusy(true); setMessage(null); setError(null)
    try {
      await publishVersion(selectedDraft.id)
      setConfirmAction(null)
      setMessage(`Version ${selectedDraft.versionNumber} published successfully.`)
      await loadTemplates(selectedTemplateId ?? undefined)
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Form version could not be published.')
    } finally { setBusy(false) }
  }

  async function handleNewVersion() {
    if (!selectedTemplate) return
    setBusy(true); setMessage(null); setError(null)
    try {
      const next = await createNextDraftVersion(selectedTemplate.id)
      setMessage(`Draft version ${next.versionNumber} created from the latest version.`)
      await loadTemplates(selectedTemplate.id)
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : 'New draft version could not be created.')
    } finally { setBusy(false) }
  }

  async function handleArchive() {
    if (!selectedTemplate) return
    setBusy(true); setMessage(null); setError(null)
    try {
      await archiveTemplate(selectedTemplate.id)
      setConfirmAction(null)
      setMessage('Form archived. Historical assignments and submissions were preserved.')
      await loadTemplates(selectedTemplate.id)
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Form could not be archived.')
    } finally { setBusy(false) }
  }

  async function handleAssign() {
    setBusy(true); setMessage(null); setError(null)
    try {
      if (!assignForm.patientId || !assignForm.versionId) throw new Error('Select a patient and published form version.')
      await assignPublishedForm({
        patientId: assignForm.patientId,
        templateVersionId: assignForm.versionId,
        branchId: assignForm.branchId || undefined,
        appointmentId: assignForm.appointmentId || undefined,
        clinicalVisitId: assignForm.clinicalVisitId || undefined,
        treatmentPlanId: assignForm.treatmentPlanId || undefined,
        treatmentId: assignForm.treatmentId || undefined,
      })
      setShowAssign(false)
      setAssignForm(blankAssign)
      setMessage('Published form assigned successfully.')
      setAssignmentCount((count) => count + 1)
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Assignment could not be created.')
    } finally { setBusy(false) }
  }

  return (
    <PageScaffold title="Forms & Consent" description="Manage clinic-provided form templates, immutable versions, patient assignments and consent status.">
      <div className="forms-v28">
        <section className="forms-v28-hero">
          <div>
            <span className="forms-v28-kicker">Clinical documentation governance</span>
            <h2>Forms & Consent Control Center</h2>
            <p>Build clinic-authored forms, control version publishing, and assign only immutable published versions to patients.</p>
          </div>
          <div className="forms-v28-hero-actions">
            <Button variant="secondary" onClick={openAssign} disabled={!selectedTemplate || publishedVersionOptions.length === 0}><Send size={16} /> Assign form</Button>
            <Button onClick={() => setShowCreate(true)}><FilePlus2 size={16} /> New form</Button>
          </div>
        </section>

        <section className="forms-v28-truth">
          <ShieldCheck size={19} />
          <div><strong>Versioned consent records</strong><span>Published and signed history remains immutable. The system stores clinic-provided wording; it does not generate legal wording or medical clearance.</span></div>
        </section>

        <section className="forms-v28-metrics">
          <article><span><FileText size={17} /> Templates</span><strong>{metrics.templates}</strong><small>All form templates</small></article>
          <article><span><CheckCircle2 size={17} /> Published</span><strong>{metrics.published}</strong><small>Assignable templates</small></article>
          <article><span><ClipboardSignature size={17} /> Signature required</span><strong>{metrics.signatureRequired}</strong><small>Current published settings</small></article>
          <article><span><UsersRound size={17} /> Assignments</span><strong>{metrics.assignments}</strong><small>Recent records loaded</small></article>
        </section>

        {message && <div className="forms-v28-alert success"><CheckCircle2 size={16} /> {message}</div>}
        {error && <div className="forms-v28-alert error">{error}</div>}

        <section className="forms-v28-command">
          <label className="forms-v28-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, description or category" /></label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter forms by status">
            <option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
          </select>
        </section>

        <div className="forms-v28-workspace">
          <section className="forms-v28-library">
            <header><div><span>Template library</span><h3>{filteredTemplates.length} forms</h3></div><Badge tone="info">Governed</Badge></header>
            {loading ? <div className="forms-v28-skeleton"><i /><i /><i /></div> : filteredTemplates.length === 0 ? (
              <div className="forms-v28-empty"><ClipboardSignature size={30} /><h3>No forms found</h3><p>Create a new clinic-authored draft or adjust the current filters.</p></div>
            ) : (
              <div className="forms-v28-template-list">
                {filteredTemplates.map((template) => (
                  <button key={template.id} type="button" className={`forms-v28-template ${selectedTemplateId === template.id ? 'active' : ''}`} onClick={() => setSelectedTemplateId(template.id)}>
                    <span className="forms-v28-template-icon"><FileText size={18} /></span>
                    <span className="forms-v28-template-copy"><strong>{template.title}</strong><small>{labelize(template.category)} · {template.currentVersionNumber ? `v${template.currentVersionNumber}` : 'No published version'}</small><em>{labelize(template.appliesTo)}</em></span>
                    <Badge tone={templateTone(template.status)}>{labelize(template.status)}</Badge>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="forms-v28-detail">
            {!selectedTemplate ? (
              <div className="forms-v28-empty tall"><Sparkles size={32} /><h3>Select a form</h3><p>Choose a template to review governance, versions, draft content and patient preview.</p></div>
            ) : (
              <div className="forms-v28-detail-stack">
                <header className="forms-v28-detail-head">
                  <div><span>{labelize(selectedTemplate.category)}</span><h3>{selectedTemplate.title}</h3><p>{selectedTemplate.description || 'No description provided.'}</p></div>
                  <Badge tone={templateTone(selectedTemplate.status)}>{labelize(selectedTemplate.status)}</Badge>
                </header>

                <div className="forms-v28-meta-grid">
                  <article><span>Applies to</span><strong>{labelize(selectedTemplate.appliesTo)}</strong></article>
                  <article><span>Current version</span><strong>{selectedTemplate.currentVersionNumber ? `v${selectedTemplate.currentVersionNumber}` : 'Not published'}</strong></article>
                  <article><span>Effective date</span><strong>{formatDate(selectedTemplate.effectiveDate)}</strong></article>
                  <article><span>Signature</span><strong>{selectedTemplate.signatureMethod ? labelize(selectedTemplate.signatureMethod) : 'Not published'}</strong></article>
                </div>

                <div className="forms-v28-actions">
                  {selectedTemplate.status !== 'archived' && !selectedDraft && <Button variant="secondary" onClick={() => void handleNewVersion()} disabled={busy}><Plus size={15} /> New version</Button>}
                  {selectedTemplate.status !== 'archived' && <Button variant="secondary" onClick={() => setConfirmAction('archive')} disabled={busy}><Archive size={15} /> Archive</Button>}
                </div>

                <section className="forms-v28-version-card">
                  <header><div><span>Version history</span><h4>{versions.length} version{versions.length === 1 ? '' : 's'}</h4></div><History size={18} /></header>
                  {versions.length === 0 ? <div className="forms-v28-mini-empty">No versions recorded.</div> : versions.map((version) => (
                    <button type="button" key={version.id} className={`forms-v28-version ${selectedVersionId === version.id ? 'active' : ''}`} onClick={() => setSelectedVersionId(version.id)}>
                      <div><strong>Version {version.versionNumber}</strong><span>{version.publishedAt ? `Published ${formatDate(version.publishedAt)}` : 'Unpublished draft'}</span></div>
                      <Badge tone={version.versionStatus === 'published' ? 'success' : 'warning'}>{labelize(version.versionStatus)}</Badge>
                    </button>
                  ))}
                </section>

                {selectedDraft && (
                  <section className="forms-v28-editor">
                    <header><div><span>Editable draft</span><h4>Version {selectedDraft.versionNumber}</h4></div><LockKeyhole size={18} /></header>
                    <label>Clinic-provided content<textarea rows={12} value={draftForm.content} onChange={(event) => setDraftForm({ ...draftForm, content: event.target.value })} /></label>
                    <div className="forms-v28-form-grid">
                      <label>Effective date<input type="date" value={draftForm.effectiveDate} onChange={(event) => setDraftForm({ ...draftForm, effectiveDate: event.target.value })} /></label>
                      <label>Signature method<select value={draftForm.signatureMethod} disabled={!draftForm.requiresSignature} onChange={(event) => setDraftForm({ ...draftForm, signatureMethod: event.target.value as SignatureMethod })}>{signatureMethods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    </div>
                    <label className="forms-v28-check"><input type="checkbox" checked={draftForm.requiresSignature} onChange={(event) => setDraftForm({ ...draftForm, requiresSignature: event.target.checked, signatureMethod: event.target.checked ? (draftForm.signatureMethod === 'none' ? 'typed_acknowledgement' : draftForm.signatureMethod) : 'none' })} /><span>This version requires a configured signature method.</span></label>
                    <div className="forms-v28-actions end"><Button variant="secondary" onClick={() => void handleSaveDraft()} disabled={busy}>Save draft</Button><Button onClick={() => setConfirmAction('publish')} disabled={busy || !draftForm.content.trim()}>Publish version {selectedDraft.versionNumber}</Button></div>
                  </section>
                )}

                {selectedVersion?.versionStatus === 'published' && (
                  <section className="forms-v28-preview">
                    <header><div><span>Patient preview</span><h4>Version {selectedVersion.versionNumber}</h4></div><Badge tone="success">Immutable published version</Badge></header>
                    <div>{sanitizeFormPreview(selectedVersion.content)}</div>
                  </section>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {showCreate && (
        <div className="forms-v28-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setShowCreate(false)}>
          <section className="forms-v28-modal large" role="dialog" aria-modal="true" aria-labelledby="forms-v28-create-title">
            <header><div><span>New clinic form</span><h2 id="forms-v28-create-title">Create governed draft</h2><p>Start with clinic-approved wording. Publishing remains a separate controlled action.</p></div><button type="button" aria-label="Close new form modal" onClick={() => !busy && setShowCreate(false)}><X size={19} /></button></header>
            <div className="forms-v28-modal-body">
              <section className="forms-v28-form-section"><div className="forms-v28-section-title"><span>01</span><div><h3>Form identity</h3><p>Define how this form is classified and where it applies.</p></div></div><div className="forms-v28-form-grid"><label>Title<input value={createForm.title} onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })} placeholder="e.g. General Treatment Consent" /></label><label>Category<select value={createForm.category} onChange={(event) => setCreateForm({ ...createForm, category: event.target.value as FormCategory })}>{categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Applies to<select value={createForm.appliesTo} onChange={(event) => setCreateForm({ ...createForm, appliesTo: event.target.value as FormAppliesTo })}>{appliesToOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Branch<select value={createForm.branchId} onChange={(event) => setCreateForm({ ...createForm, branchId: event.target.value })}><option value="">Clinic-wide / not branch-specific</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div><label>Description<input value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} placeholder="Short operational description" /></label></section>
              <section className="forms-v28-form-section"><div className="forms-v28-section-title"><span>02</span><div><h3>Clinic-provided content</h3><p>The application stores your wording but does not certify legal or clinical sufficiency.</p></div></div><label>Form content<textarea rows={11} value={createForm.content} onChange={(event) => setCreateForm({ ...createForm, content: event.target.value })} placeholder="Enter clinic-approved content..." /></label></section>
              <section className="forms-v28-form-section"><div className="forms-v28-section-title"><span>03</span><div><h3>Signature & effective date</h3><p>Configure acknowledgement requirements before publishing.</p></div></div><div className="forms-v28-form-grid"><label>Effective date<input type="date" value={createForm.effectiveDate} onChange={(event) => setCreateForm({ ...createForm, effectiveDate: event.target.value })} /></label>{createForm.requiresSignature && <label>Signature method<select value={createForm.signatureMethod} onChange={(event) => setCreateForm({ ...createForm, signatureMethod: event.target.value as SignatureMethod })}>{signatureMethods.filter((option) => option.value !== 'none').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}</div><label className="forms-v28-check"><input type="checkbox" checked={createForm.requiresSignature} onChange={(event) => setCreateForm({ ...createForm, requiresSignature: event.target.checked, signatureMethod: event.target.checked ? 'typed_acknowledgement' : 'none' })} /><span>Requires patient signature / acknowledgement</span></label></section>
            </div>
            <footer><Button variant="secondary" type="button" onClick={() => setShowCreate(false)} disabled={busy}>Cancel</Button><Button onClick={() => void handleCreate()} disabled={busy || !createForm.title.trim() || !createForm.content.trim()}>{busy ? 'Creating draft...' : 'Create draft'}</Button></footer>
          </section>
        </div>
      )}

      {showAssign && (
        <div className="forms-v28-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setShowAssign(false)}>
          <section className="forms-v28-modal" role="dialog" aria-modal="true" aria-labelledby="forms-v28-assign-title">
            <header><div><span>Patient assignment</span><h2 id="forms-v28-assign-title">Assign published form</h2><p>Only immutable published versions can be assigned.</p></div><button type="button" aria-label="Close assignment modal" onClick={() => !busy && setShowAssign(false)}><X size={19} /></button></header>
            <div className="forms-v28-modal-body">
              <section className="forms-v28-form-section"><div className="forms-v28-section-title"><span>01</span><div><h3>Recipient</h3><p>Select the patient and published version.</p></div></div><label>Patient<select value={assignForm.patientId} onChange={(event) => setAssignForm({ ...assignForm, patientId: event.target.value })}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.firstName} {patient.lastName} · {patient.patientId}</option>)}</select></label><label>Published version<select value={assignForm.versionId} onChange={(event) => setAssignForm({ ...assignForm, versionId: event.target.value })}><option value="">Select published version</option>{publishedVersionOptions.map((version) => <option key={version.id} value={version.id}>{selectedTemplate?.title ?? 'Selected form'} · v{version.versionNumber}</option>)}</select></label></section>
              <section className="forms-v28-form-section"><div className="forms-v28-section-title"><span>02</span><div><h3>Clinical context</h3><p>Optional linkage preserves the source context for this assignment.</p></div></div><div className="forms-v28-form-grid"><label>Branch<select value={assignForm.branchId} onChange={(event) => setAssignForm({ ...assignForm, branchId: event.target.value })}><option value="">No branch linkage</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Appointment ID<input value={assignForm.appointmentId} onChange={(event) => setAssignForm({ ...assignForm, appointmentId: event.target.value })} placeholder="Optional" /></label><label>Clinical visit ID<input value={assignForm.clinicalVisitId} onChange={(event) => setAssignForm({ ...assignForm, clinicalVisitId: event.target.value })} placeholder="Optional" /></label><label>Treatment plan ID<input value={assignForm.treatmentPlanId} onChange={(event) => setAssignForm({ ...assignForm, treatmentPlanId: event.target.value })} placeholder="Optional" /></label><label>Treatment ID<input value={assignForm.treatmentId} onChange={(event) => setAssignForm({ ...assignForm, treatmentId: event.target.value })} placeholder="Optional" /></label></div></section>
              <div className="forms-v28-modal-note"><ShieldCheck size={17} /><span>Repeated assignment of the same patient, version and context remains idempotent in the existing assignment workflow.</span></div>
            </div>
            <footer><Button variant="secondary" type="button" onClick={() => setShowAssign(false)} disabled={busy}>Cancel</Button><Button onClick={() => void handleAssign()} disabled={busy || !assignForm.patientId || !assignForm.versionId}>{busy ? 'Assigning...' : 'Assign form'}</Button></footer>
          </section>
        </div>
      )}

      {confirmAction && (
        <div className="forms-v28-modal-backdrop" role="presentation">
          <section className="forms-v28-modal compact" role="dialog" aria-modal="true" aria-labelledby="forms-v28-confirm-title">
            <header><div><span>Confirm action</span><h2 id="forms-v28-confirm-title">{confirmAction === 'publish' ? 'Publish this version?' : 'Archive this form?'}</h2></div><button type="button" onClick={() => !busy && setConfirmAction(null)} aria-label="Close confirmation"><X size={19} /></button></header>
            <div className="forms-v28-modal-body"><div className="forms-v28-modal-note"><ShieldCheck size={18} /><span>{confirmAction === 'publish' ? 'Publishing makes this version immutable and available for patient assignment. Existing signed versions remain unchanged.' : 'Archiving stops new assignments while preserving historical assignments and submissions.'}</span></div></div>
            <footer><Button variant="secondary" onClick={() => setConfirmAction(null)} disabled={busy}>Cancel</Button><Button onClick={() => void (confirmAction === 'publish' ? handlePublish() : handleArchive())} disabled={busy}>{busy ? 'Working...' : confirmAction === 'publish' ? 'Publish version' : 'Archive form'}</Button></footer>
          </section>
        </div>
      )}
    </PageScaffold>
  )
}
