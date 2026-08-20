import { Clock, Eye, LogOut, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { getRecentAuditLogs, recordAuditEntry, type AuditAction } from '../features/security/auditLogStore'
import { getStoredStaff } from '../features/auth/staffStore'
import { useAuth } from '../features/auth/AuthContext'
import { getCurrentSessionUserName } from '../features/security/security'

const auditActionLabels: Record<AuditAction, string> = {
  patient_created: 'Patient Created',
  patient_updated: 'Patient Updated',
  patient_import_completed: 'Patient Import Completed',
  patient_import_rolled_back: 'Patient Import Rolled Back',
  appointment_status_changed: 'Appointment Status Changed',
  communication_preference_changed: 'Communication Preference Changed',
  communication_template_updated: 'Communication Template Updated',
  communication_manual_resend: 'Communication Resend Triggered',
  communication_settings_changed: 'Communication Settings Changed',
  clinical_record_created: 'Clinical Record Created',
  clinical_record_draft_updated: 'Clinical Draft Updated',
  clinical_record_finalized: 'Clinical Record Finalized',
  clinical_record_amendment_added: 'Clinical Amendment Added',
  prescription_created: 'Prescription Created',
  clinical_document_uploaded: 'Clinical Document Uploaded',
  dental_record_created: 'Dental Record Created',
  dental_record_updated: 'Dental Record Updated',
  treatment_created: 'Treatment Created',
  charge_added: 'Charge Added',
  invoice_created: 'Invoice Created',
  invoice_voided: 'Invoice Voided',
  discount_applied: 'Discount Applied',
  payment_submitted: 'Payment Submitted',
  payment_recorded: 'Payment Recorded',
  payment_approved: 'Payment Approved',
  payment_rejected: 'Payment Rejected',
  payment_gateway_event_processed: 'Gateway Event Processed',
  refund_completed: 'Refund Completed',
  inventory_item_created: 'Inventory Item Created',
  inventory_item_updated: 'Inventory Item Updated',
  stock_movement_posted: 'Stock Movement Posted',
  stock_transfer_initiated: 'Stock Transfer Initiated',
  stock_transfer_received: 'Stock Transfer Received',
  purchase_order_created: 'Purchase Order Created',
  purchase_order_approved: 'Purchase Order Approved',
  purchase_received: 'Purchase Received',
  supplier_changed: 'Supplier Changed',
  expense_created: 'Expense Created',
  expense_updated: 'Expense Updated',
  expense_approved: 'Expense Approved',
  expense_paid: 'Expense Paid',
  expense_partial_payment_recorded: 'Expense Partial Payment',
  expense_attachment_uploaded: 'Expense Attachment Uploaded',
  expense_voided: 'Expense Voided',
  expense_recurring_template_created: 'Recurring Expense Created',
  expense_recurring_template_changed: 'Recurring Expense Changed',
  expense_vendor_changed: 'Expense Vendor Changed',
  purchase_linked_expense_generated: 'Purchase Expense Generated',
  cashier_session_opened: 'Cashier Session Opened',
  cashier_session_closed: 'Cashier Session Closed',
  cash_movement_recorded: 'Cash Movement Recorded',
  petty_cash_disbursed: 'Petty Cash Disbursed',
  report_exported: 'Report Exported',
  report_view_saved: 'Report View Saved',
  backup_evidence_recorded: 'Backup Evidence Recorded',
  backup_verification_recorded: 'Backup Verification Recorded',
  restore_plan_created: 'Restore Plan Created',
  restore_plan_approved: 'Restore Plan Approved',
  staff_account_changed: 'Staff Account Changed',
  staff_shift_planned: 'Staff Shift Planned',
  staff_attendance_recorded: 'Staff Attendance Recorded',
  provider_created: 'Dentist Account Created',
  provider_updated: 'Dentist Account Updated',
  provider_branch_assignment_changed: 'Dentist Branch Assignment Updated',
  provider_schedule_updated: 'Dentist Schedule Updated',
  provider_availability_changed: 'Dentist Availability Updated',
  provider_compensation_rule_changed: 'Provider Compensation Changed',
  provider_payout_created: 'Provider Payout Created',
  provider_payout_processed: 'Provider Payout Processed',
  branch_updated: 'Branch Information Updated',
  settings_changed: 'Settings Changed',
}

const auditActionTones: Record<AuditAction, 'info' | 'success' | 'warning' | 'danger'> = {
  patient_created: 'info',
  patient_updated: 'info',
  patient_import_completed: 'info',
  patient_import_rolled_back: 'warning',
  appointment_status_changed: 'info',
  communication_preference_changed: 'info',
  communication_template_updated: 'warning',
  communication_manual_resend: 'warning',
  communication_settings_changed: 'danger',
  clinical_record_created: 'success',
  clinical_record_draft_updated: 'info',
  clinical_record_finalized: 'warning',
  clinical_record_amendment_added: 'warning',
  prescription_created: 'success',
  clinical_document_uploaded: 'info',
  dental_record_created: 'success',
  dental_record_updated: 'success',
  treatment_created: 'success',
  charge_added: 'warning',
  invoice_created: 'warning',
  invoice_voided: 'danger',
  discount_applied: 'warning',
  payment_submitted: 'info',
  payment_recorded: 'success',
  payment_approved: 'success',
  payment_rejected: 'danger',
  payment_gateway_event_processed: 'info',
  refund_completed: 'warning',
  inventory_item_created: 'success',
  inventory_item_updated: 'info',
  stock_movement_posted: 'info',
  stock_transfer_initiated: 'warning',
  stock_transfer_received: 'success',
  purchase_order_created: 'warning',
  purchase_order_approved: 'success',
  purchase_received: 'success',
  supplier_changed: 'info',
  expense_created: 'warning',
  expense_updated: 'info',
  expense_approved: 'success',
  expense_paid: 'success',
  expense_partial_payment_recorded: 'warning',
  expense_attachment_uploaded: 'info',
  expense_voided: 'danger',
  expense_recurring_template_created: 'warning',
  expense_recurring_template_changed: 'info',
  expense_vendor_changed: 'info',
  purchase_linked_expense_generated: 'warning',
  cashier_session_opened: 'info',
  cashier_session_closed: 'success',
  cash_movement_recorded: 'warning',
  petty_cash_disbursed: 'warning',
  report_exported: 'info',
  report_view_saved: 'success',
  backup_evidence_recorded: 'warning',
  backup_verification_recorded: 'warning',
  restore_plan_created: 'danger',
  restore_plan_approved: 'danger',
  staff_account_changed: 'warning',
  staff_shift_planned: 'info',
  staff_attendance_recorded: 'success',
  provider_created: 'success',
  provider_updated: 'info',
  provider_branch_assignment_changed: 'info',
  provider_schedule_updated: 'info',
  provider_availability_changed: 'warning',
  provider_compensation_rule_changed: 'warning',
  provider_payout_created: 'warning',
  provider_payout_processed: 'success',
  branch_updated: 'info',
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

const CLINIC_SETTINGS_KEY = 'plamenco.settings.clinic'

type ClinicSettings = {
  name: string
  address: string
  phone: string
}

const defaultClinicSettings: ClinicSettings = {
  name: 'Plamenco Dental Clinic',
  address: 'Metro Manila, Philippines',
  phone: '+63 900 000 1000',
}

function readClinicSettings(): ClinicSettings {
  try {
    const stored = window.localStorage.getItem(CLINIC_SETTINGS_KEY)
    return stored ? { ...defaultClinicSettings, ...JSON.parse(stored) } : defaultClinicSettings
  } catch {
    return defaultClinicSettings
  }
}

export function SettingsPage() {
  const { signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<'audit' | 'clinic' | 'security'>('audit')
  const [auditFilter, setAuditFilter] = useState<'all' | AuditAction>('all')
  const [auditSearchEntity, setAuditSearchEntity] = useState<string>('')
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings>(() => readClinicSettings())

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

  function saveClinicSettings() {
    window.localStorage.setItem(CLINIC_SETTINGS_KEY, JSON.stringify(clinicSettings))
    recordAuditEntry({
      user: getCurrentSessionUserName(),
      action: 'settings_changed',
      entity: 'clinic_settings',
      entityId: 'clinic-profile',
      metadata: { updatedFields: 'name,address,phone' },
    })
  }

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
                    value={clinicSettings.name}
                    onChange={(event) => setClinicSettings((current) => ({ ...current, name: event.target.value }))}
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
                    value={clinicSettings.address}
                    onChange={(event) => setClinicSettings((current) => ({ ...current, address: event.target.value }))}
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
                    value={clinicSettings.phone}
                    onChange={(event) => setClinicSettings((current) => ({ ...current, phone: event.target.value }))}
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
                  <Button onClick={saveClinicSettings}>Save Changes</Button>
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
                  <Button variant="danger" icon={<LogOut size={16} />} onClick={() => void signOut()}>
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
