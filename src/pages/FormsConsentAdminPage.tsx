import { useEffect, useMemo, useState } from 'react'
import { Archive, CheckCircle2, ClipboardSignature, FilePlus2, History, Plus, Send, ShieldCheck } from 'lucide-react'
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
  { value: 'manual', label: 'Manual' },
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

function labelize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value?: string) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' })
}

export function FormsConsentAdminPage() {
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
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [createForm, setCreateForm] = useState({
    title: '', description: '', category: 'general_consent' as FormCategory,
    appliesTo: 'manual' as FormAppliesTo, content: '', requiresSignature: false,
    signatureMethod: 'none' as SignatureMethod, effectiveDate: '', branchId: '',
  })
  const [draftForm, setDraftForm] = useState({ content: '', requiresSignature: false, signatureMethod: 'none' as SignatureMethod, effectiveDate: '' })
  const [assignForm, setAssignForm] = useState({ patientId: '', versionId: '', branchId: '', appointmentId: '', clinicalVisitId: '', treatmentPlanId: '', treatmentId: '' })

  const selectedTemplate = templates.find((entry) => entry.id === selectedTemplateId) ?? null
  const selectedVersion = versions.find((entry) => entry.id === selectedVersionId) ?? versions[0] ?? null
  const selectedDraft = versions.find((entry) => entry.versionStatus === 'draft') ?? null

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

  useEffect(() => {
    void loadTemplates()
  }, [])

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
    setDraftForm({
      content: selectedDraft.content,
      requiresSignature: selectedDraft.requiresSignature,
      signatureMethod: selectedDraft.signatureMethod,
      effectiveDate: selectedDraft.effectiveDate ?? '',
    })
  }, [selectedDraft?.id])

  const filteredTemplates = templates.filter((template) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || [template.title, template.description, template.category].join(' ').toLowerCase().includes(query)
    const matchesStatus = statusFilter === 'all' || template.status === statusFilter
    return matchesSearch && matchesStatus
  })

  async function handleCreate() {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const result = await createFormTemplateDraft(createForm)
      setCreateForm({ title: '', description: '', category: 'general_consent', appliesTo: 'manual', content: '', requiresSignature: false, signatureMethod: 'none', effectiveDate: '', branchId: '' })
      setShowCreate(false)
      setMessage(`Draft version ${result.versionNumber} created. It is not visible or assignable to patients yet.`)
      await loadTemplates(result.templateId)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Draft could not be created.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveDraft() {
    if (!selectedDraft) return
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await updateDraftVersion({ versionId: selectedDraft.id, ...draftForm })
      setMessage(`Draft version ${selectedDraft.versionNumber} saved.`)
      await loadTemplates(selectedTemplateId ?? undefined)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Draft could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePublish() {
    if (!selectedDraft) return
    if (!window.confirm(`Publish version ${selectedDraft.versionNumber}? Previous signed versions will remain unchanged.`)) return
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await publishVersion(selectedDraft.id)
      setMessage(`Version ${selectedDraft.versionNumber} published successfully.`)
      await loadTemplates(selectedTemplateId ?? undefined)
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Form version could not be published.')
    } finally {
      setBusy(false)
    }
  }

  async function handleNewVersion() {
    if (!selectedTemplate) return
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const next = await createNextDraftVersion(selectedTemplate.id)
      setMessage(`Draft version ${next.versionNumber} created from the latest version.`)
      await loadTemplates(selectedTemplate.id)
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : 'New draft version could not be created.')
    } finally {
      setBusy(false)
    }
  }

  async function handleArchive() {
    if (!selectedTemplate) return
    if (!window.confirm('Archive this form? New assignments will stop, but signed history will remain available.')) return
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      await archiveTemplate(selectedTemplate.id)
      setMessage('Form archived. Historical assignments and submissions were preserved.')
      await loadTemplates(selectedTemplate.id)
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'Form could not be archived.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAssign() {
    setBusy(true)
    setMessage(null)
    setError(null)
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
      setMessage('Published form assigned successfully.')
      setAssignmentCount((count) => count + 1)
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : 'Assignment could not be created.')
    } finally {
      setBusy(false)
    }
  }

  const publishedVersionOptions = versions.filter((version) => version.versionStatus === 'published')

  return (
    <PageScaffold title="Forms & Consent" description="Manage clinic-provided form templates, immutable versions, assignments, and consent status.">
      <div className="page-stack">
        <section className="panel">
          <div className="panel-header">
            <div><p className="eyebrow">Administration</p><h2>Consent record control</h2><p>Published and signed history is preserved. This workspace does not generate legal wording or medical clearance.</p></div>
            <div className="action-buttons">
              <Button variant="secondary" onClick={() => setShowAssign(true)}><Send size={15} /> Assign form</Button>
              <Button onClick={() => setShowCreate(true)}><FilePlus2 size={15} /> New form</Button>
            </div>
          </div>
          <div className="stat-grid">
            <article className="stat-card"><ClipboardSignature size={18} /><strong>{templates.length}</strong><span>Templates</span></article>
            <article className="stat-card"><CheckCircle2 size={18} /><strong>{templates.filter((entry) => entry.status === 'published').length}</strong><span>Published</span></article>
            <article className="stat-card"><History size={18} /><strong>{assignmentCount}</strong><span>Recent assignment records loaded</span></article>
          </div>
        </section>

        {message && <div className="success-alert"><CheckCircle2 size={16} /> {message}</div>}
        {error && <div className="error-alert">{error}</div>}

        <section className="panel">
          <div className="treatment-filter-grid">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search form name or category" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
            </select>
          </div>
        </section>

        <div className="settings-layout">
          <section className="panel">
            <div className="panel-header"><div><p className="eyebrow">Templates</p><h2>Forms</h2></div><Badge tone="info">{filteredTemplates.length}</Badge></div>
            {loading ? <p>Loading forms...</p> : filteredTemplates.length === 0 ? <div className="empty-state-panel"><ShieldCheck size={22} /><h3>No forms created yet</h3><p>Create a draft using clinic-provided wording.</p></div> : (
              <div className="list-stack">
                {filteredTemplates.map((template) => (
                  <button key={template.id} type="button" className={`settings-list-item ${selectedTemplateId === template.id ? 'is-active' : ''}`} onClick={() => setSelectedTemplateId(template.id)}>
                    <div><strong>{template.title}</strong><span>{labelize(template.category)} · {template.currentVersionNumber ? `v${template.currentVersionNumber}` : 'No published version'}</span></div>
                    <Badge tone={template.status === 'published' ? 'success' : template.status === 'archived' ? 'neutral' : 'warning'}>{labelize(template.status)}</Badge>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            {!selectedTemplate ? <div className="empty-state-panel"><ClipboardSignature size={22} /><h3>Select a form</h3><p>Choose a template to review its versions and publishing state.</p></div> : (
              <>
                <div className="panel-header">
                  <div><p className="eyebrow">{labelize(selectedTemplate.category)}</p><h2>{selectedTemplate.title}</h2><p>{selectedTemplate.description || 'No description provided.'}</p></div>
                  <Badge tone={selectedTemplate.status === 'published' ? 'success' : selectedTemplate.status === 'archived' ? 'neutral' : 'warning'}>{labelize(selectedTemplate.status)}</Badge>
                </div>
                <div className="detail-grid">
                  <div><span>Applies to</span><strong>{labelize(selectedTemplate.appliesTo)}</strong></div>
                  <div><span>Current version</span><strong>{selectedTemplate.currentVersionNumber ? `v${selectedTemplate.currentVersionNumber}` : 'Not published'}</strong></div>
                  <div><span>Effective date</span><strong>{formatDate(selectedTemplate.effectiveDate)}</strong></div>
                  <div><span>Signature</span><strong>{selectedTemplate.signatureMethod ? labelize(selectedTemplate.signatureMethod) : 'Not published'}</strong></div>
                </div>

                <div className="action-buttons">
                  {selectedTemplate.status !== 'archived' && !selectedDraft && <Button variant="secondary" onClick={() => void handleNewVersion()} disabled={busy}><Plus size={15} /> New version</Button>}
                  {selectedTemplate.status !== 'archived' && <Button variant="secondary" onClick={() => void handleArchive()} disabled={busy}><Archive size={15} /> Archive</Button>}
                </div>

                <div className="panel-divider" />
                <div className="panel-header"><div><p className="eyebrow">Version History</p><h3>{versions.length} version{versions.length === 1 ? '' : 's'}</h3></div></div>
                <div className="list-stack">
                  {versions.map((version) => (
                    <button type="button" key={version.id} className={`settings-list-item ${selectedVersionId === version.id ? 'is-active' : ''}`} onClick={() => setSelectedVersionId(version.id)}>
                      <div><strong>Version {version.versionNumber}</strong><span>{version.publishedAt ? `Published ${formatDate(version.publishedAt)}` : 'Unpublished draft'}</span></div>
                      <Badge tone={version.versionStatus === 'published' ? 'success' : 'warning'}>{labelize(version.versionStatus)}</Badge>
                    </button>
                  ))}
                </div>

                {selectedDraft && (
                  <div className="panel nested-panel">
                    <div className="panel-header"><div><p className="eyebrow">Editable Draft</p><h3>Version {selectedDraft.versionNumber}</h3></div></div>
                    <label className="field-label">Form content<textarea rows={12} value={draftForm.content} onChange={(event) => setDraftForm({ ...draftForm, content: event.target.value })} /></label>
                    <div className="form-grid">
                      <label className="field-label">Effective date<input type="date" value={draftForm.effectiveDate} onChange={(event) => setDraftForm({ ...draftForm, effectiveDate: event.target.value })} /></label>
                      <label className="field-label">Signature method<select value={draftForm.signatureMethod} disabled={!draftForm.requiresSignature} onChange={(event) => setDraftForm({ ...draftForm, signatureMethod: event.target.value as SignatureMethod })}>{signatureMethods.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    </div>
                    <label className="intake-confirmation-row"><input type="checkbox" checked={draftForm.requiresSignature} onChange={(event) => setDraftForm({ ...draftForm, requiresSignature: event.target.checked, signatureMethod: event.target.checked ? (draftForm.signatureMethod === 'none' ? 'typed_acknowledgement' : draftForm.signatureMethod) : 'none' })} /><span>This version requires a configured signature method.</span></label>
                    <div className="action-buttons"><Button variant="secondary" onClick={() => void handleSaveDraft()} disabled={busy}>Save draft</Button><Button onClick={() => void handlePublish()} disabled={busy || !draftForm.content.trim()}>Publish version {selectedDraft.versionNumber}</Button></div>
                  </div>
                )}

                {selectedVersion && selectedVersion.versionStatus === 'published' && (
                  <div className="panel nested-panel">
                    <div className="panel-header"><div><p className="eyebrow">Patient Preview</p><h3>Version {selectedVersion.versionNumber}</h3></div><Badge tone="success">Immutable published version</Badge></div>
                    <div className="intake-form-content" style={{ whiteSpace: 'pre-wrap' }}>{sanitizeFormPreview(selectedVersion.content)}</div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>

      {showCreate && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-form-title">
            <div className="modal-header"><div><p className="eyebrow">Draft Only</p><h2 id="create-form-title">Create clinic form</h2></div><Button variant="secondary" onClick={() => setShowCreate(false)}>Close</Button></div>
            <div className="form-grid">
              <label className="field-label">Title<input value={createForm.title} onChange={(event) => setCreateForm({ ...createForm, title: event.target.value })} /></label>
              <label className="field-label">Category<select value={createForm.category} onChange={(event) => setCreateForm({ ...createForm, category: event.target.value as FormCategory })}>{categories.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="field-label">Applies to<select value={createForm.appliesTo} onChange={(event) => setCreateForm({ ...createForm, appliesTo: event.target.value as FormAppliesTo })}>{appliesToOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="field-label">Branch<select value={createForm.branchId} onChange={(event) => setCreateForm({ ...createForm, branchId: event.target.value })}><option value="">Clinic-wide / not branch-specific</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            </div>
            <label className="field-label">Description<input value={createForm.description} onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })} /></label>
            <label className="field-label">Clinic-provided content<textarea rows={10} value={createForm.content} onChange={(event) => setCreateForm({ ...createForm, content: event.target.value })} /></label>
            <label className="intake-confirmation-row"><input type="checkbox" checked={createForm.requiresSignature} onChange={(event) => setCreateForm({ ...createForm, requiresSignature: event.target.checked, signatureMethod: event.target.checked ? 'typed_acknowledgement' : 'none' })} /><span>Requires signature/acknowledgement method</span></label>
            {createForm.requiresSignature && <label className="field-label">Signature method<select value={createForm.signatureMethod} onChange={(event) => setCreateForm({ ...createForm, signatureMethod: event.target.value as SignatureMethod })}>{signatureMethods.filter((option) => option.value !== 'none').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
            <p className="muted-label">The system does not generate or certify legal wording. Publishing is a separate action.</p>
            <div className="action-buttons"><Button onClick={() => void handleCreate()} disabled={busy || !createForm.title.trim() || !createForm.content.trim()}>{busy ? 'Creating...' : 'Create Draft'}</Button></div>
          </section>
        </div>
      )}

      {showAssign && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="assign-form-title">
            <div className="modal-header"><div><p className="eyebrow">Manual Assignment</p><h2 id="assign-form-title">Assign published form</h2></div><Button variant="secondary" onClick={() => setShowAssign(false)}>Close</Button></div>
            <label className="field-label">Patient<select value={assignForm.patientId} onChange={(event) => setAssignForm({ ...assignForm, patientId: event.target.value })}><option value="">Select patient</option>{patients.map((patient) => <option key={patient.patientId} value={patient.patientId}>{patient.firstName} {patient.lastName} · {patient.patientId}</option>)}</select></label>
            <label className="field-label">Published version<select value={assignForm.versionId} onChange={(event) => setAssignForm({ ...assignForm, versionId: event.target.value })}><option value="">Select version</option>{publishedVersionOptions.map((version) => <option key={version.id} value={version.id}>{selectedTemplate?.title ?? 'Selected form'} · v{version.versionNumber}</option>)}</select></label>
            <div className="form-grid">
              <label className="field-label">Branch<select value={assignForm.branchId} onChange={(event) => setAssignForm({ ...assignForm, branchId: event.target.value })}><option value="">No branch linkage</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
              <label className="field-label">Appointment ID<input value={assignForm.appointmentId} onChange={(event) => setAssignForm({ ...assignForm, appointmentId: event.target.value })} placeholder="Optional" /></label>
              <label className="field-label">Clinical visit ID<input value={assignForm.clinicalVisitId} onChange={(event) => setAssignForm({ ...assignForm, clinicalVisitId: event.target.value })} placeholder="Optional" /></label>
              <label className="field-label">Treatment plan ID<input value={assignForm.treatmentPlanId} onChange={(event) => setAssignForm({ ...assignForm, treatmentPlanId: event.target.value })} placeholder="Optional" /></label>
            </div>
            <p className="muted-label">Only published versions are assignable. Repeated assignment of the same patient/version/context is idempotent.</p>
            <div className="action-buttons"><Button onClick={() => void handleAssign()} disabled={busy || !assignForm.patientId || !assignForm.versionId}>{busy ? 'Assigning...' : 'Assign Form'}</Button></div>
          </section>
        </div>
      )}
    </PageScaffold>
  )
}
