import { Clock, Eye, LogOut, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { getRecentAuditLogs, type AuditAction } from '../features/security/auditLogStore'
import { getStoredStaff } from '../features/auth/staffStore'

const auditActionLabels: Record<AuditAction, string> = {
  patient_created: 'Patient Created',
  patient_updated: 'Patient Updated',
  dental_record_created: 'Dental Record Created',
  dental_record_updated: 'Dental Record Updated',
  treatment_created: 'Treatment Created',
  invoice_created: 'Invoice Created',
  payment_recorded: 'Payment Recorded',
  staff_account_changed: 'Staff Account Changed',
  settings_changed: 'Settings Changed',
}

const auditActionTones: Record<AuditAction, 'info' | 'success' | 'warning' | 'danger'> = {
  patient_created: 'info',
  patient_updated: 'info',
  dental_record_created: 'success',
  dental_record_updated: 'success',
  treatment_created: 'success',
  invoice_created: 'warning',
  payment_recorded: 'success',
  staff_account_changed: 'warning',
  settings_changed: 'danger',
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(isoString: string) {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'audit' | 'clinic' | 'security'>('audit')
  const [auditFilter, setAuditFilter] = useState<'all' | AuditAction>('all')
  const [auditSearchEntity, setAuditSearchEntity] = useState<string>('')

  const allLogs = useMemo(() => getRecentAuditLogs(100), [])

  const filteredLogs = useMemo(() => {
    let filtered = allLogs

    if (auditFilter !== 'all') {
      filtered = filtered.filter((log) => log.action === auditFilter)
    }

    if (auditSearchEntity.trim()) {
      const query = auditSearchEntity.toLowerCase()
      filtered = filtered.filter(
        (log) =>
          log.entity.toLowerCase().includes(query) || log.entityId.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [allLogs, auditFilter, auditSearchEntity])

  const staffMap = useMemo(() => {
    const map = new Map<string, string>()
    getStoredStaff().forEach((staff) => {
      map.set(staff.id, staff.name)
    })
    return map
  }, [])

  return (
    <section className="page-stack">
      <div className="section-header">
        <div>
          <Badge tone="warning">Admin only</Badge>
          <h2>Settings</h2>
          <p>Clinic configuration, audit logs, and security management.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '16px' }}>
        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--surface)',
            padding: '8px',
            width: 'fit-content',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            style={{
              border: 0,
              borderRadius: 'var(--radius-md)',
              background: activeTab === 'audit' ? 'var(--primary-soft)' : 'transparent',
              color: activeTab === 'audit' ? 'var(--primary-strong)' : 'var(--text-muted)',
              padding: '8px 16px',
              fontWeight: activeTab === 'audit' ? 700 : 600,
              cursor: 'pointer',
              fontSize: '0.92rem',
              transition: 'all 160ms ease',
            }}
          >
            <Clock size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Audit Logs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('clinic')}
            style={{
              border: 0,
              borderRadius: 'var(--radius-md)',
              background: activeTab === 'clinic' ? 'var(--primary-soft)' : 'transparent',
              color: activeTab === 'clinic' ? 'var(--primary-strong)' : 'var(--text-muted)',
              padding: '8px 16px',
              fontWeight: activeTab === 'clinic' ? 700 : 600,
              cursor: 'pointer',
              fontSize: '0.92rem',
              transition: 'all 160ms ease',
            }}
          >
            <Settings size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Clinic Profile
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('security')}
            style={{
              border: 0,
              borderRadius: 'var(--radius-md)',
              background: activeTab === 'security' ? 'var(--primary-soft)' : 'transparent',
              color: activeTab === 'security' ? 'var(--primary-strong)' : 'var(--text-muted)',
              padding: '8px 16px',
              fontWeight: activeTab === 'security' ? 700 : 600,
              cursor: 'pointer',
              fontSize: '0.92rem',
              transition: 'all 160ms ease',
            }}
          >
            <Eye size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Security
          </button>
        </div>

        {/* Audit Logs Tab */}
        {activeTab === 'audit' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.5fr) 220px 220px',
                gap: '12px',
                alignItems: 'end',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--surface)',
                padding: '14px',
              }}
            >
              <input
                type="search"
                placeholder="Search by entity or ID..."
                value={auditSearchEntity}
                onChange={(e) => setAuditSearchEntity(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '42px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  padding: '0 12px',
                  fontSize: '0.92rem',
                }}
              />
              <Select
                label="Filter by action"
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value as typeof auditFilter)}
                options={[
                  { label: 'All actions', value: 'all' },
                  { label: 'Patient actions', value: 'patient_updated' },
                  { label: 'Dental records', value: 'dental_record_created' },
                  { label: 'Treatments', value: 'treatment_created' },
                  { label: 'Billing', value: 'payment_recorded' },
                  { label: 'Staff changes', value: 'staff_account_changed' },
                ]}
              />
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {filteredLogs.length} entries
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface)',
                  padding: '42px 24px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <p>No audit logs found.</p>
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface)',
                  overflow: 'hidden',
                }}
              >
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                    }}
                  >
                    <thead>
                      <tr style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)' }}>
                        <th
                          style={{
                            padding: '12px 14px',
                            textAlign: 'left',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Timestamp
                        </th>
                        <th
                          style={{
                            padding: '12px 14px',
                            textAlign: 'left',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                          }}
                        >
                          User
                        </th>
                        <th
                          style={{
                            padding: '12px 14px',
                            textAlign: 'left',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Action
                        </th>
                        <th
                          style={{
                            padding: '12px 14px',
                            textAlign: 'left',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Entity
                        </th>
                        <th
                          style={{
                            padding: '12px 14px',
                            textAlign: 'left',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                          }}
                        >
                          ID
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log) => (
                        <tr
                          key={log.id}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            transition: 'background-color 160ms ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--surface-muted)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          <td
                            style={{
                              padding: '12px 14px',
                              fontSize: '0.84rem',
                              color: 'var(--text)',
                            }}
                          >
                            <div>{formatDate(log.timestamp)}</div>
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                              {formatTime(log.timestamp)}
                            </div>
                          </td>
                          <td
                            style={{
                              padding: '12px 14px',
                              fontSize: '0.92rem',
                              fontWeight: 600,
                              color: 'var(--text)',
                            }}
                          >
                            {staffMap.get(log.user) || log.user}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <Badge tone={auditActionTones[log.action]}>
                              {auditActionLabels[log.action]}
                            </Badge>
                          </td>
                          <td
                            style={{
                              padding: '12px 14px',
                              fontSize: '0.84rem',
                              color: 'var(--text)',
                              textTransform: 'capitalize',
                            }}
                          >
                            {log.entity}
                          </td>
                          <td
                            style={{
                              padding: '12px 14px',
                              fontSize: '0.84rem',
                              color: 'var(--text-muted)',
                              fontFamily: 'monospace',
                            }}
                          >
                            {log.entityId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: '16px',
                color: 'var(--text-muted)',
                fontSize: '0.84rem',
              }}
            >
              <strong>Note:</strong> This audit log captures all sensitive actions in the clinic system including patient records, billing, and staff management changes. Logs are retained for system integrity and compliance.
            </div>
          </div>
        )}

        {/* Clinic Profile Tab */}
        {activeTab === 'clinic' && (
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface)',
              padding: '28px',
            }}
          >
            <div style={{ maxWidth: '620px' }}>
              <h3 style={{ marginBottom: '18px' }}>Clinic Information</h3>
              <div style={{ display: 'grid', gap: '16px' }}>
                <div style={{ display: 'grid', gap: '7px' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>Clinic Name</label>
                  <input
                    type="text"
                    placeholder="Plamenco Dental Clinic"
                    defaultValue="Plamenco Dental Clinic"
                    style={{
                      width: '100%',
                      minHeight: '42px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      padding: '0 12px',
                      transition: 'border-color 200ms ease, box-shadow 200ms ease',
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gap: '7px' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>Address</label>
                  <input
                    type="text"
                    placeholder="Clinic address"
                    defaultValue="Metro Manila, Philippines"
                    style={{
                      width: '100%',
                      minHeight: '42px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      padding: '0 12px',
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gap: '7px' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.9rem' }}>Phone</label>
                  <input
                    type="tel"
                    placeholder="+63 900 000 1000"
                    defaultValue="+63 900 000 1000"
                    style={{
                      width: '100%',
                      minHeight: '42px',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      padding: '0 12px',
                    }}
                  />
                </div>
                <div style={{ marginTop: '12px' }}>
                  <Button>Save Changes</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div style={{ display: 'grid', gap: '16px' }}>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--surface)',
                padding: '20px',
              }}
            >
              <h3 style={{ marginBottom: '16px', marginTop: 0 }}>Security Settings</h3>
              <div style={{ display: 'grid', gap: '12px', color: 'var(--text-muted)' }}>
                <div style={{ padding: '12px', borderLeft: '3px solid var(--info)', background: 'var(--info-soft)' }}>
                  <strong style={{ color: 'var(--info)' }}>Data Storage</strong>
                  <p style={{ margin: '8px 0 0 0' }}>
                    Patient records, billing data, and audit logs are stored securely in browser local storage.
                    This system is designed for small clinic use (3-5 staff).
                  </p>
                </div>
                <div style={{ padding: '12px', borderLeft: '3px solid var(--warning)', background: 'var(--warning-soft)' }}>
                  <strong style={{ color: 'var(--warning)' }}>Production Deployment</strong>
                  <p style={{ margin: '8px 0 0 0' }}>
                    For production use, implement a backend database with proper encryption, access controls, and regular backups.
                  </p>
                </div>
                <div style={{ padding: '12px', borderLeft: '3px solid var(--success)', background: 'var(--success-soft)' }}>
                  <strong style={{ color: 'var(--success)' }}>Access Control</strong>
                  <p style={{ margin: '8px 0 0 0' }}>
                    Role-based access control is enforced at the UI level. Admins have access to staff management, settings, and audit logs.
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--surface)',
                padding: '20px',
              }}
            >
              <h3 style={{ marginBottom: '16px', marginTop: 0 }}>Session Management</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                  Your current session is stored securely. Sign out to end your session.
                </p>
                <div>
                  <Button variant="danger" icon={<LogOut size={16} />}>
                    Sign Out
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
