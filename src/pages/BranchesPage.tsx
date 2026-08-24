import { Building2, Clock3, MapPin, PencilLine, Phone, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge, StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { loadBranchesFromSupabase, updateBranch } from '../features/branches/branchStore'
import type { Branch, BranchFormValues } from '../features/branches/branchTypes'
import { usePermissions } from '../features/auth/permissions'
import { recordAuditEntry } from '../features/security/auditLogStore'
import { getCurrentSessionUserName } from '../features/security/security'

function formatTime(value: string) {
  const [hour = 0, minute = 0] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hour, minute, 0, 0)
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function toFormValues(branch: Branch): BranchFormValues {
  return {
    name: branch.name,
    address: branch.address,
    city: branch.city,
    province: branch.province,
    phone: branch.phone,
    email: branch.email,
    openingTime: branch.openingTime,
    closingTime: branch.closingTime,
    status: branch.status,
  }
}

export function BranchesPage() {
  const { can } = usePermissions()
  const canManage = can('branches.manage')
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<BranchFormValues | null>(null)

  useEffect(() => {
    let mounted = true
    void loadBranchesFromSupabase().then((loadedBranches) => {
      if (!mounted) return
      setBranches(loadedBranches)
      setSelectedBranchId((current) => current || loadedBranches[0]?.id || '')
    })

    return () => {
      mounted = false
    }
  }, [])

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) ?? branches[0] ?? null,
    [branches, selectedBranchId],
  )

  function startEditing(branch: Branch) {
    setForm(toFormValues(branch))
    setIsEditing(true)
  }

  function saveBranch() {
    if (!selectedBranch || !form) return

    const updated = updateBranch(selectedBranch.id, form)
    if (!updated) return

    setBranches((current) => current.map((branch) => (branch.id === updated.id ? updated : branch)))
    setIsEditing(false)
    recordAuditEntry({
      user: getCurrentSessionUserName(),
      action: 'branch_updated',
      entity: 'branch',
      entityId: updated.id,
      metadata: { code: updated.code, status: updated.status },
    })
  }

  return (
    <section className="page-stack branch-management-page">
      <div className="section-header premium-section-header">
        <div>
          <Badge tone="info">Clinic</Badge>
          <h2>Branches</h2>
          <p>Manage Plamenco Dental Co. clinic locations.</p>
        </div>
      </div>

      {branches.length === 0 ? (
        <EmptyState title="No branches configured" message="Clinic branches will appear here after the branch migration is applied." />
      ) : (
        <div className="branch-workspace-grid">
          <div className="branch-directory">
            {branches.map((branch) => (
              <button
                className={`branch-entry ${selectedBranch?.id === branch.id ? 'is-selected' : ''}`}
                key={branch.id}
                type="button"
                onClick={() => {
                  setSelectedBranchId(branch.id)
                  setIsEditing(false)
                }}
              >
                <span className="branch-entry-icon"><Building2 size={18} /></span>
                <span>
                  <strong>{branch.name}</strong>
                  <small>{branch.city}, {branch.province}</small>
                </span>
                <StatusBadge status={branch.status} variant="compact" />
              </button>
            ))}
          </div>

          {selectedBranch && (
            <article className="panel branch-detail-panel">
              <div className="branch-detail-header">
                <div>
                  <p className="eyebrow">Branch workspace</p>
                  <h3>{selectedBranch.name}</h3>
                </div>
                <StatusBadge status={selectedBranch.status} />
              </div>

              {!isEditing ? (
                <>
                  <div className="branch-info-grid">
                    <div><MapPin size={16} /><span>{selectedBranch.address}</span></div>
                    <div><Phone size={16} /><span>{selectedBranch.phone || 'No phone on file'}</span></div>
                    <div><Clock3 size={16} /><span>{formatTime(selectedBranch.openingTime)} - {formatTime(selectedBranch.closingTime)}</span></div>
                  </div>
                  {canManage && (
                    <Button variant="secondary" icon={<PencilLine size={16} />} onClick={() => startEditing(selectedBranch)}>
                      Edit branch
                    </Button>
                  )}
                </>
              ) : form && (
                <div className="form-stack">
                  <div className="form-grid">
                    <Input label="Branch name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                    <Input label="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
                    <Input label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                    <Input label="Address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
                    <Input label="City" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
                    <Input label="Province" value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} />
                    <Input label="Opening time" type="time" value={form.openingTime} onChange={(event) => setForm({ ...form, openingTime: event.target.value })} />
                    <Input label="Closing time" type="time" value={form.closingTime} onChange={(event) => setForm({ ...form, closingTime: event.target.value })} />
                    <Select
                      label="Status"
                      value={form.status}
                      onChange={(event) => setForm({ ...form, status: event.target.value as BranchFormValues['status'] })}
                      options={[
                        { label: 'Active', value: 'active' },
                        { label: 'Inactive', value: 'inactive' },
                      ]}
                    />
                  </div>
                  <div className="modal-actions">
                    <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                    <Button icon={<Save size={16} />} onClick={saveBranch}>Save branch</Button>
                  </div>
                </div>
              )}
            </article>
          )}
        </div>
      )}
    </section>
  )
}
