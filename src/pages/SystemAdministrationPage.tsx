import {
  Activity,
  BellRing,
  Building2,
  CalendarClock,
  CreditCard,
  Database,
  FileText,
  HardDrive,
  KeyRound,
  LockKeyhole,
  Mail,
  RotateCcw,
  ServerCog,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import {
  createClinicClosure,
  getAccountInvitations,
  getBookingConfiguration,
  getClinicConfiguration,
  getRolePermissionMatrix,
  getSystemAdminSnapshot,
  inviteInternalAccount,
  saveBookingConfiguration,
  saveClinicConfiguration,
  updateInternalAccountStatus,
  type AdminSection,
} from '../features/admin/systemAdminStore'
import {
  approveRestorePlan,
  createRestorePlan,
  getSystemHealthSnapshot,
  recordBackupEvidence,
  updateBackupVerification,
  type OperationalState,
} from '../features/admin/systemHealthStore'
import { useAuth } from '../features/auth/AuthContext'
import { getStoredStaff } from '../features/auth/staffStore'
import type { UserRole } from '../features/auth/authTypes'
import { roleLabels } from '../features/auth/permissions'
import { getStoredBranches } from '../features/branches/branchStore'
import { getPaymentMethods, updatePaymentMethodConfig, type PaymentMethod } from '../features/billing/billingStore'
import { getCommunicationSettings, saveCommunicationSettings } from '../features/communications/communicationStore'
import { getStoredCommunicationTemplates, renderCommunicationTemplate } from '../features/communications/communicationTemplates'
import type { CommunicationChannel } from '../features/communications/communicationTypes'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { getRecentAuditLogs, formatAuditAction } from '../features/security/auditLogStore'
import { getStoredServices } from '../features/services/serviceStore'
import { isSupabaseConfigured } from '../lib/supabase'

const sections: Array<{ key: AdminSection; label: string; icon: typeof Activity }> = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'accounts', label: 'Users & Accounts', icon: UsersRound },
  { key: 'roles', label: 'Roles & Permissions', icon: ShieldCheck },
  { key: 'branches', label: 'Branches', icon: Building2 },
  { key: 'clinic', label: 'Clinic Configuration', icon: Settings },
  { key: 'services', label: 'Services', icon: Stethoscope },
  { key: 'scheduling', label: 'Scheduling', icon: CalendarClock },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'notifications', label: 'Notifications', icon: BellRing },
  { key: 'integrations', label: 'Integrations', icon: ServerCog },
  { key: 'audit', label: 'Audit Logs', icon: FileText },
  { key: 'security', label: 'Security', icon: LockKeyhole },
  { key: 'health', label: 'System Health', icon: Database },
]

const internalRoles: Array<Exclude<UserRole, 'patient'>> = ['super_admin', 'admin', 'dentist', 'associate_dentist', 'staff']

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function toneFor(status: 'healthy' | 'warning' | 'attention') {
  if (status === 'healthy') return 'success'
  if (status === 'warning') return 'warning'
  return 'danger'
}

function operationalTone(status: OperationalState): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (status === 'operational') return 'success'
  if (status === 'degraded') return 'warning'
  if (status === 'unavailable') return 'danger'
  if (status === 'not_configured') return 'neutral'
  return 'info'
}

function labelize(value: string) {
  return value.replaceAll('_', ' ')
}

function boolLabel(value: boolean) {
  return value ? 'Enabled' : 'Disabled'
}

function formatBytes(value?: number) {
  if (!value) return 'Size not recorded'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function SystemAdministrationPage() {
  const { user, signOut } = useAuth()
  const actor = user?.email ?? 'system-admin'
  const [activeSection, setActiveSection] = useState<AdminSection>('overview')
  const [refreshKey, setRefreshKey] = useState(0)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Exclude<UserRole, 'patient'>>('staff')
  const [inviteBranchId, setInviteBranchId] = useState('all')
  const [inviteMessage, setInviteMessage] = useState('')
  const [clinicConfig, setClinicConfig] = useState(() => getClinicConfiguration())
  const [bookingConfig, setBookingConfig] = useState(() => getBookingConfiguration())
  const [closureDate, setClosureDate] = useState('')
  const [closureBranchId, setClosureBranchId] = useState('all')
  const [closureReason, setClosureReason] = useState('')
  const [templateIndex, setTemplateIndex] = useState(0)
  const [auditQuery, setAuditQuery] = useState('')
  const [auditAction, setAuditAction] = useState('all')

  void refreshKey
  const snapshot = getSystemAdminSnapshot()
  const systemHealth = getSystemHealthSnapshot()
  const staff = getStoredStaff()
  const invitations = getAccountInvitations()
  const branches = getStoredBranches()
  const providers = getStoredProviders()
  const patientCount = getStoredPatients().length
  const services = getStoredServices()
  const paymentMethods = getPaymentMethods()
  const communicationSettings = getCommunicationSettings()
  const templates = getStoredCommunicationTemplates()
  const roleMatrix = getRolePermissionMatrix()
  const auditLogs = getRecentAuditLogs(150)
  const selectedTemplate = templates[templateIndex] ?? templates[0]
  const preview = selectedTemplate ? renderCommunicationTemplate(selectedTemplate, {
    first_name: 'Patient',
    appointment_number: 'APT-000001',
    appointment_date: 'Aug 18, 2026',
    appointment_time: '9:00 AM',
    branch_name: 'Plamenco Dental Co. - Pulilan',
    dentist_name: 'Assigned dentist',
    service_name: 'Dental service',
    clinic_name: clinicConfig.clinicName,
    estimated_price: 'PHP 0.00',
    portal_guidance: 'Use the authenticated patient portal for changes.',
  }) : null

  const filteredAuditLogs = auditLogs.filter((log) => {
    const matchesAction = auditAction === 'all' || log.action === auditAction
    const query = auditQuery.trim().toLowerCase()
    const matchesQuery = !query || [log.user, log.entity, log.entityId, formatAuditAction(log.action).label].join(' ').toLowerCase().includes(query)
    return matchesAction && matchesQuery
  })
  const auditActionOptions = [
    { value: 'all', label: 'All actions' },
    ...Array.from(new Set(auditLogs.map((log) => log.action))).map((action) => ({ value: action, label: formatAuditAction(action).label })),
  ]

  async function submitInvitation() {
    try {
      const branchIds = inviteBranchId === 'all' ? branches.map((branch) => branch.id) : [inviteBranchId]
      const invitation = await inviteInternalAccount({ email: inviteEmail, name: inviteName, role: inviteRole, branchIds, invitedBy: actor })
      setInviteMessage(invitation.status === 'failed' ? `Invitation request saved, Edge Function failed: ${invitation.errorMessage}` : `Invitation ${invitation.status}.`)
      setInviteName('')
      setInviteEmail('')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setInviteMessage(error instanceof Error ? error.message : 'Could not create invitation.')
    }
  }

  function saveClinic() {
    setClinicConfig(saveClinicConfiguration(clinicConfig, actor))
    setRefreshKey((value) => value + 1)
  }

  function saveBooking() {
    setBookingConfig(saveBookingConfiguration(bookingConfig, actor))
    setRefreshKey((value) => value + 1)
  }

  function addClosure() {
    try {
      createClinicClosure({
        date: closureDate,
        branchId: closureBranchId === 'all' ? undefined : closureBranchId,
        reason: closureReason,
        type: 'special_closure',
        createdBy: actor,
      })
      setClosureDate('')
      setClosureReason('')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setClosureReason(error instanceof Error ? error.message : 'Closure could not be saved.')
    }
  }

  function toggleAccount(staffId: string, status: 'active' | 'inactive') {
    try {
      updateInternalAccountStatus(staffId, status, actor)
      setRefreshKey((value) => value + 1)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Account status could not be changed.')
    }
  }

  function togglePayment(methodId: PaymentMethod, key: 'active' | 'requiresReference' | 'requiresVerification' | 'isOnline', value: boolean) {
    updatePaymentMethodConfig(methodId, { [key]: value })
    setRefreshKey((entry) => entry + 1)
  }

  function toggleChannel(channel: CommunicationChannel, configured: boolean) {
    const next = { ...communicationSettings, updatedAt: new Date().toISOString(), updatedBy: actor }
    if (channel === 'sms') next.smsConfigured = configured
    if (channel === 'email') next.emailConfigured = configured
    if (channel === 'messenger') next.messengerConfigured = configured
    saveCommunicationSettings(next)
    setRefreshKey((entry) => entry + 1)
  }

  function recordManualBackupEvidence() {
    try {
      recordBackupEvidence({
        kind: 'pre_migration_snapshot',
        environment: isSupabaseConfigured ? 'production' : 'development',
        status: 'completed',
        completedAt: new Date().toISOString(),
        location: window.prompt('Enter the Supabase backup/export reference or storage location. Do not enter secrets.') ?? '',
        retentionPolicy: 'Clinic decision required',
        notes: 'Operator-recorded evidence. This does not create a backup.',
      })
      setRefreshKey((entry) => entry + 1)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Backup evidence could not be recorded.')
    }
  }

  function markLatestBackupVerified() {
    const backup = systemHealth.backupRegistry[0]
    if (!backup) {
      window.alert('No backup registry entry is available to verify.')
      return
    }
    const note = window.prompt(`Verification notes for ${backup.id}. Confirm restore rehearsal/checksum/count review details.`)
    if (note === null) return
    updateBackupVerification(backup.id, 'verified', actor, note)
    setRefreshKey((entry) => entry + 1)
  }

  function draftRestorePlan() {
    const backup = systemHealth.backupRegistry.find((entry) => entry.verificationStatus === 'verified') ?? systemHealth.backupRegistry[0]
    if (!backup) {
      window.alert('Record a backup or recovery point before drafting a restore plan.')
      return
    }
    const reason = window.prompt('Why is a restore being considered?')
    if (!reason) return
    const impact = window.prompt('Describe the expected impact and records at risk. This will not restore data.') ?? ''
    if (!impact) return
    createRestorePlan({
      backupId: backup.id,
      targetEnvironment: isSupabaseConfigured ? 'test environment preferred; production only with explicit approval' : 'development',
      dataScope: 'To be approved by Super Admin and infrastructure administrator',
      reason,
      impact,
      requestedBy: actor,
    })
    setRefreshKey((entry) => entry + 1)
  }

  return (
    <section className="page-stack">
      <div className="section-header premium-section-header">
        <div>
          <Badge tone="danger">Super Admin</Badge>
          <h2>System Administration</h2>
          <p>Control clinic configuration, access, security, integrations, and production readiness from one management area.</p>
        </div>
        <Button variant="secondary" icon={<Activity size={16} />} onClick={() => setRefreshKey((value) => value + 1)}>Refresh</Button>
      </div>

      <div className="reports-filter-panel panel">
        <div className="reports-filter-grid">
          {sections.map((section) => {
            const Icon = section.icon
            return (
              <button key={section.key} className="icon-button" type="button" title={section.label} aria-label={section.label} onClick={() => setActiveSection(section.key)} style={{ width: '100%', justifyContent: 'center', background: activeSection === section.key ? 'var(--primary-soft)' : undefined }}>
                <Icon size={17} />
              </button>
            )
          })}
        </div>
      </div>

      {activeSection === 'overview' && (
        <>
          <div className="report-summary-grid">
            <article className="summary-kpi"><span>Active users</span><strong>{snapshot.activeUsers}</strong><small>{snapshot.patientAccounts} linked of {patientCount} patients</small></article>
            <article className="summary-kpi"><span>Active dentists</span><strong>{snapshot.activeDentists}</strong><small>{providers.length} provider profiles</small></article>
            <article className="summary-kpi"><span>Active staff</span><strong>{snapshot.activeStaff}</strong><small>{staff.length} internal records</small></article>
            <article className="summary-kpi"><span>Branches</span><strong>{snapshot.activeBranches}</strong><small>{branches.length} configured</small></article>
            <article className="summary-kpi"><span>Services</span><strong>{snapshot.activeServices}</strong><small>{services.length} catalog entries</small></article>
            <article className="summary-kpi"><span>Warnings</span><strong>{snapshot.securityDiagnostics.filter((item) => item.status !== 'healthy').length + snapshot.dataIntegrityDiagnostics.filter((item) => item.status !== 'healthy').length}</strong><small>{snapshot.failedSystemOperations} failed operations</small></article>
          </div>
          <div className="analytics-grid">
            <section className="panel table-panel">
              <div className="chart-header"><div><span className="chart-kicker">System status</span><h3>Configuration checks</h3></div><ServerCog size={18} /></div>
              <div className="table-scroll"><table className="table"><tbody>{[...snapshot.integrationDiagnostics, ...snapshot.securityDiagnostics].map((item) => <tr key={item.id}><td><strong>{item.label}</strong><span>{item.detail}</span></td><td><Badge tone={toneFor(item.status)}>{item.status}</Badge></td></tr>)}</tbody></table></div>
            </section>
            <section className="panel table-panel">
              <div className="chart-header"><div><span className="chart-kicker">Administrative changes</span><h3>Recent activity</h3></div><FileText size={18} /></div>
              <div className="table-scroll"><table className="table"><tbody>{snapshot.recentAdministrativeChanges.slice(0, 8).map((log) => <tr key={log.id}><td><strong>{formatAuditAction(log.action).label}</strong><span>{log.entity} - {log.entityId}</span></td><td>{formatDate(log.timestamp)}</td></tr>)}</tbody></table></div>
            </section>
          </div>
        </>
      )}

      {activeSection === 'accounts' && (
        <div className="analytics-grid">
          <section className="panel table-panel">
            <div className="chart-header"><div><span className="chart-kicker">Internal accounts</span><h3>Users and access status</h3></div><UsersRound size={18} /></div>
            <div className="table-scroll"><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Contact</th><th>Action</th></tr></thead><tbody>
              {staff.map((member) => <tr key={member.id}><td><strong>{member.name}</strong><span>Created {member.createdAt.slice(0, 10)}</span></td><td>{roleLabels[member.role]}</td><td><Badge tone={member.status === 'active' ? 'success' : 'neutral'}>{member.status}</Badge></td><td>{member.email}<span>{member.phone}</span></td><td><Button size="sm" variant="secondary" onClick={() => toggleAccount(member.id, member.status === 'active' ? 'inactive' : 'active')}>{member.status === 'active' ? 'Deactivate' : 'Activate'}</Button></td></tr>)}
              {invitations.map((invite) => <tr key={invite.id}><td><strong>{invite.name}</strong><span>{invite.email}</span></td><td>{roleLabels[invite.role]}</td><td><Badge tone={invite.status === 'failed' ? 'danger' : invite.status === 'sent' ? 'success' : 'warning'}>{invite.status}</Badge></td><td>{invite.branchIds.length} branch assignment(s)</td><td>Invitation metadata</td></tr>)}
            </tbody></table></div>
          </section>
          <section className="panel">
            <div className="chart-header"><div><span className="chart-kicker">Secure invitation</span><h3>Create internal account request</h3></div><UserPlus size={18} /></div>
            <div className="reports-filter-grid">
              <label className="report-control"><span>Name</span><input value={inviteName} onChange={(event) => setInviteName(event.target.value)} /></label>
              <label className="report-control"><span>Email</span><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></label>
              <Select label="Role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Exclude<UserRole, 'patient'>)} options={internalRoles.map((role) => ({ value: role, label: roleLabels[role] }))} />
              <Select label="Branch" value={inviteBranchId} onChange={(event) => setInviteBranchId(event.target.value)} options={[{ value: 'all', label: 'All branches' }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]} />
            </div>
            <p className="muted">Invitations call the `invite-internal-account` Edge Function when Supabase is configured. No service-role key or temporary password is exposed in the browser.</p>
            {inviteMessage && <Badge tone={inviteMessage.includes('failed') ? 'warning' : 'info'}>{inviteMessage}</Badge>}
            <div style={{ marginTop: 12 }}><Button icon={<Mail size={16} />} onClick={() => void submitInvitation()}>Send invitation request</Button></div>
          </section>
        </div>
      )}

      {activeSection === 'roles' && (
        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Permission matrix</span><h3>Role-based access control</h3></div><ShieldCheck size={18} /></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Permission</th>{Object.keys(roleLabels).map((role) => <th key={role}>{roleLabels[role as UserRole]}</th>)}</tr></thead><tbody>
            {roleMatrix.flatMap((group) => [
              <tr key={group.label}><td colSpan={6}><strong>{group.label}</strong></td></tr>,
              ...group.permissions.map((permission) => <tr key={permission.key}><td><strong>{permission.label}</strong><span>{permission.key}</span></td>{(Object.keys(roleLabels) as UserRole[]).map((role) => <td key={role}><Badge tone={permission.grants[role] ? 'success' : 'neutral'}>{permission.grants[role] ? 'Allowed' : 'Blocked'}</Badge></td>)}</tr>),
            ])}
          </tbody></table></div>
        </section>
      )}

      {activeSection === 'branches' && (
        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Branch configuration</span><h3>Pulilan and Plaridel foundation</h3></div><Building2 size={18} /></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Branch</th><th>Code</th><th>Contact</th><th>Hours</th><th>Status</th></tr></thead><tbody>
            {branches.map((branch) => <tr key={branch.id}><td><strong>{branch.name}</strong><span>{branch.address}</span></td><td>{branch.code}</td><td>{branch.phone || 'No phone'}<span>{branch.email || 'No email'}</span></td><td>{branch.openingTime} - {branch.closingTime}</td><td><Badge tone={branch.status === 'active' ? 'success' : 'neutral'}>{branch.status}</Badge></td></tr>)}
          </tbody></table></div>
        </section>
      )}

      {activeSection === 'clinic' && (
        <section className="panel">
          <div className="chart-header"><div><span className="chart-kicker">Clinic information</span><h3>Public and operational profile</h3></div><Settings size={18} /></div>
          <div className="reports-filter-grid">
            <label className="report-control"><span>Clinic name</span><input value={clinicConfig.clinicName} onChange={(event) => setClinicConfig({ ...clinicConfig, clinicName: event.target.value })} /></label>
            <label className="report-control"><span>Email</span><input value={clinicConfig.primaryEmail} onChange={(event) => setClinicConfig({ ...clinicConfig, primaryEmail: event.target.value })} /></label>
            <label className="report-control"><span>Phone</span><input value={clinicConfig.primaryPhone} onChange={(event) => setClinicConfig({ ...clinicConfig, primaryPhone: event.target.value })} /></label>
            <label className="report-control"><span>Website</span><input value={clinicConfig.website} onChange={(event) => setClinicConfig({ ...clinicConfig, website: event.target.value })} /></label>
            <label className="report-control"><span>Facebook page</span><input value={clinicConfig.facebookPage} onChange={(event) => setClinicConfig({ ...clinicConfig, facebookPage: event.target.value })} /></label>
            <label className="report-control"><span>Business hours</span><input value={clinicConfig.businessHours} onChange={(event) => setClinicConfig({ ...clinicConfig, businessHours: event.target.value })} /></label>
          </div>
          <div style={{ marginTop: 12 }}><Button onClick={saveClinic}>Save clinic configuration</Button></div>
        </section>
      )}

      {activeSection === 'services' && (
        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Service configuration</span><h3>Current service catalog</h3></div><Stethoscope size={18} /></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Service</th><th>Category</th><th>Duration</th><th>Price</th><th>Status</th></tr></thead><tbody>
            {services.map((service) => <tr key={service.id}><td><strong>{service.name}</strong><span>{service.description || 'No description'}</span></td><td>{service.category}</td><td>{service.duration} min</td><td>{new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(service.price / 100)}</td><td><Badge tone={service.status === 'active' ? 'success' : 'neutral'}>{service.status}</Badge></td></tr>)}
          </tbody></table></div>
          <p className="muted">Current service prices are administrative settings. Historical treatments, charges, and invoices keep their existing price snapshots.</p>
        </section>
      )}

      {activeSection === 'scheduling' && (
        <div className="analytics-grid">
          <section className="panel">
            <div className="chart-header"><div><span className="chart-kicker">Booking rules</span><h3>Appointment configuration</h3></div><CalendarClock size={18} /></div>
            <div className="reports-filter-grid">
              <label className="report-control"><span>Online booking</span><select value={bookingConfig.onlineBookingEnabled ? 'yes' : 'no'} onChange={(event) => setBookingConfig({ ...bookingConfig, onlineBookingEnabled: event.target.value === 'yes' })}><option value="yes">Enabled</option><option value="no">Disabled</option></select></label>
              <label className="report-control"><span>Slot minutes</span><input type="number" value={bookingConfig.defaultSlotMinutes} onChange={(event) => setBookingConfig({ ...bookingConfig, defaultSlotMinutes: Number(event.target.value) })} /></label>
              <label className="report-control"><span>Lead hours</span><input type="number" value={bookingConfig.minimumLeadHours} onChange={(event) => setBookingConfig({ ...bookingConfig, minimumLeadHours: Number(event.target.value) })} /></label>
              <label className="report-control"><span>Advance days</span><input type="number" value={bookingConfig.maximumAdvanceDays} onChange={(event) => setBookingConfig({ ...bookingConfig, maximumAdvanceDays: Number(event.target.value) })} /></label>
              <label className="report-control"><span>Cancel cutoff hours</span><input type="number" value={bookingConfig.cancellationCutoffHours} onChange={(event) => setBookingConfig({ ...bookingConfig, cancellationCutoffHours: Number(event.target.value) })} /></label>
              <label className="report-control"><span>Reschedule cutoff hours</span><input type="number" value={bookingConfig.rescheduleCutoffHours} onChange={(event) => setBookingConfig({ ...bookingConfig, rescheduleCutoffHours: Number(event.target.value) })} /></label>
            </div>
            <div style={{ marginTop: 12 }}><Button onClick={saveBooking}>Save booking rules</Button></div>
          </section>
          <section className="panel">
            <div className="chart-header"><div><span className="chart-kicker">Closed dates</span><h3>Clinic closures</h3></div><CalendarClock size={18} /></div>
            <div className="reports-filter-grid">
              <label className="report-control"><span>Date</span><input type="date" value={closureDate} onChange={(event) => setClosureDate(event.target.value)} /></label>
              <Select label="Branch" value={closureBranchId} onChange={(event) => setClosureBranchId(event.target.value)} options={[{ value: 'all', label: 'All branches' }, ...branches.map((branch) => ({ value: branch.id, label: branch.name }))]} />
              <label className="report-control"><span>Reason</span><input value={closureReason} onChange={(event) => setClosureReason(event.target.value)} /></label>
            </div>
            <div style={{ marginTop: 12 }}><Button onClick={addClosure}>Add closure</Button></div>
            <div className="table-scroll"><table className="table"><tbody>{snapshot.closures.map((closure) => <tr key={closure.id}><td><strong>{closure.date}</strong><span>{closure.reason}</span></td><td>{closure.branchId ? branches.find((branch) => branch.id === closure.branchId)?.name : 'All branches'}</td></tr>)}</tbody></table></div>
          </section>
        </div>
      )}

      {activeSection === 'payments' && (
        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Payment methods</span><h3>Patient and front-desk payment configuration</h3></div><CreditCard size={18} /></div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Method</th><th>Active</th><th>Online</th><th>Reference</th><th>Verification</th></tr></thead><tbody>
            {paymentMethods.map((method) => <tr key={method.id}><td><strong>{method.label}</strong><span>{method.id}</span></td>{(['active', 'isOnline', 'requiresReference', 'requiresVerification'] as const).map((key) => <td key={key}><button className="icon-button" type="button" aria-label={`${method.label} ${key}`} onClick={() => togglePayment(method.id, key, !method[key])}><Badge tone={method[key] ? 'success' : 'neutral'}>{boolLabel(method[key])}</Badge></button></td>)}</tr>)}
          </tbody></table></div>
          <p className="muted">Gateway secrets are not shown here. Online payment credentials must stay in Supabase or another server-side environment.</p>
        </section>
      )}

      {activeSection === 'notifications' && (
        <div className="analytics-grid">
          <section className="panel table-panel">
            <div className="chart-header"><div><span className="chart-kicker">Channel status</span><h3>Communication configuration</h3></div><BellRing size={18} /></div>
            <div className="table-scroll"><table className="table"><tbody>
              {(['sms', 'email', 'messenger'] as CommunicationChannel[]).map((channel) => {
                const configured = channel === 'sms' ? communicationSettings.smsConfigured : channel === 'email' ? communicationSettings.emailConfigured : communicationSettings.messengerConfigured
                return <tr key={channel}><td><strong>{labelize(channel)}</strong><span>Configured status only; secrets hidden</span></td><td><button className="icon-button" type="button" onClick={() => toggleChannel(channel, !configured)}><Badge tone={configured ? 'success' : 'warning'}>{configured ? 'Configured' : 'Not configured'}</Badge></button></td></tr>
              })}
            </tbody></table></div>
          </section>
          <section className="panel">
            <div className="chart-header"><div><span className="chart-kicker">Template preview</span><h3>Safe placeholder rendering</h3></div><Mail size={18} /></div>
            <Select label="Template" value={String(templateIndex)} onChange={(event) => setTemplateIndex(Number(event.target.value))} options={templates.map((template, index) => ({ value: String(index), label: `${labelize(template.key)} - ${template.channel}` }))} />
            {preview && <div className="empty-state-panel"><strong>{preview.subject || preview.title}</strong><p>{preview.body}</p></div>}
          </section>
        </div>
      )}

      {activeSection === 'integrations' && (
        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Integrations</span><h3>Safe configuration status</h3></div><ServerCog size={18} /></div>
          <div className="table-scroll"><table className="table"><tbody>{snapshot.integrationDiagnostics.map((item) => <tr key={item.id}><td><strong>{item.label}</strong><span>{item.detail}</span></td><td><Badge tone={toneFor(item.status)}>{item.status}</Badge></td></tr>)}</tbody></table></div>
          <p className="muted">Integration tests should be executed by server-side functions with rate limits and approved recipients.</p>
        </section>
      )}

      {activeSection === 'audit' && (
        <section className="panel table-panel">
          <div className="chart-header"><div><span className="chart-kicker">Audit viewer</span><h3>Immutable administrative activity</h3></div><FileText size={18} /></div>
          <div className="reports-filter-grid">
            <label className="report-control"><span>Search</span><input value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} /></label>
            <Select label="Action" value={auditAction} onChange={(event) => setAuditAction(event.target.value)} options={auditActionOptions} />
          </div>
          <div className="table-scroll"><table className="table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Identifier</th></tr></thead><tbody>
            {filteredAuditLogs.map((log) => <tr key={log.id}><td>{formatDate(log.timestamp)}</td><td>{log.user}</td><td><strong>{formatAuditAction(log.action).label}</strong><span>{formatAuditAction(log.action).description}</span></td><td>{log.entity}</td><td>{log.entityId}</td></tr>)}
          </tbody></table></div>
        </section>
      )}

      {activeSection === 'security' && (
        <div className="analytics-grid">
          <section className="panel table-panel"><div className="chart-header"><div><span className="chart-kicker">Security center</span><h3>Account and session checks</h3></div><KeyRound size={18} /></div><div className="table-scroll"><table className="table"><tbody>{snapshot.securityDiagnostics.map((item) => <tr key={item.id}><td><strong>{item.label}</strong><span>{item.detail}</span></td><td><Badge tone={toneFor(item.status)}>{item.status}</Badge></td></tr>)}</tbody></table></div><div style={{ marginTop: 12 }}><Button variant="danger" onClick={signOut}>Sign out current session</Button></div></section>
          <section className="panel table-panel"><div className="chart-header"><div><span className="chart-kicker">Profile integrity</span><h3>Auth linkage diagnostics</h3></div><ShieldCheck size={18} /></div><div className="table-scroll"><table className="table"><tbody>{snapshot.dataIntegrityDiagnostics.map((item) => <tr key={item.id}><td><strong>{item.label}</strong><span>{item.detail}</span></td><td><Badge tone={toneFor(item.status)}>{item.status}</Badge></td></tr>)}</tbody></table></div></section>
        </div>
      )}

      {activeSection === 'health' && (
        <div className="page-stack">
          <div className="report-summary-grid">
            <article className="summary-kpi"><span>Overall state</span><strong>{labelize(systemHealth.overallState)}</strong><small>Generated {formatDate(systemHealth.generatedAt)}</small></article>
            <article className="summary-kpi"><span>Verified recovery point</span><strong>{systemHealth.disasterRecovery.latestVerifiedRecoveryPoint ? 'Recorded' : 'Unknown'}</strong><small>{systemHealth.disasterRecovery.latestVerifiedRecoveryPoint?.completedAt ?? 'No verified backup evidence'}</small></article>
            <article className="summary-kpi"><span>Recent failures</span><strong>{systemHealth.recentFailures.length}</strong><small>Communications and payment warnings</small></article>
            <article className="summary-kpi"><span>Job runs</span><strong>{systemHealth.jobRuns.length}</strong><small>Registry plus inferred queue signals</small></article>
          </div>

          <div className="analytics-grid">
            <section className="panel table-panel">
              <div className="chart-header"><div><span className="chart-kicker">Health overview</span><h3>Operational checks</h3></div><Database size={18} /></div>
              <div className="table-scroll"><table className="table"><thead><tr><th>Area</th><th>Check</th><th>State</th></tr></thead><tbody>
                {systemHealth.checks.map((check) => (
                  <tr key={check.id}>
                    <td><strong>{check.area}</strong><span>{check.source}</span></td>
                    <td><strong>{check.name}</strong><span>{check.detail}</span></td>
                    <td><Badge tone={operationalTone(check.state)}>{labelize(check.state)}</Badge></td>
                  </tr>
                ))}
              </tbody></table></div>
            </section>

            <section className="panel table-panel">
              <div className="chart-header"><div><span className="chart-kicker">Background processing</span><h3>Jobs and stale work</h3></div><ServerCog size={18} /></div>
              <div className="table-scroll"><table className="table"><thead><tr><th>Job</th><th>Last run</th><th>Outcome</th></tr></thead><tbody>
                {systemHealth.jobRuns.map((job) => (
                  <tr key={job.id}>
                    <td><strong>{job.jobName}</strong><span>{job.nextScheduledRun ?? 'Next run unknown'}</span></td>
                    <td>{formatDate(job.startedAt)}<span>{job.finishedAt ? `Finished ${formatDate(job.finishedAt)}` : 'Finish time unavailable'}</span></td>
                    <td><Badge tone={job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'danger' : job.status === 'partial' ? 'warning' : 'neutral'}>{job.status}</Badge><span>{job.processed} processed, {job.failed} failed</span></td>
                  </tr>
                ))}
              </tbody></table></div>
            </section>
          </div>

          <div className="analytics-grid">
            <section className="panel table-panel">
              <div className="chart-header">
                <div><span className="chart-kicker">Backup registry</span><h3>Evidence and verification</h3></div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="secondary" icon={<HardDrive size={15} />} onClick={recordManualBackupEvidence}>Record evidence</Button>
                  <Button size="sm" variant="secondary" icon={<ShieldCheck size={15} />} onClick={markLatestBackupVerified}>Mark latest verified</Button>
                </div>
              </div>
              <p className="muted">These records do not create backups. They document platform backups, storage backups, exports, snapshots, checksums, and restore verification evidence.</p>
              <div className="table-scroll"><table className="table"><thead><tr><th>Type</th><th>Reference</th><th>Status</th><th>Verification</th></tr></thead><tbody>
                {systemHealth.backupRegistry.map((backup) => (
                  <tr key={backup.id}>
                    <td><strong>{labelize(backup.kind)}</strong><span>{backup.environment} - {formatBytes(backup.sizeBytes)}</span></td>
                    <td><strong>{backup.location}</strong><span>{backup.checksum ? `Checksum ${backup.checksum}` : backup.retentionPolicy ?? 'Retention not recorded'}</span></td>
                    <td><Badge tone={backup.status === 'completed' ? 'success' : backup.status === 'failed' ? 'danger' : 'warning'}>{backup.status}</Badge><span>{backup.completedAt ? formatDate(backup.completedAt) : formatDate(backup.startedAt)}</span></td>
                    <td><Badge tone={backup.verificationStatus === 'verified' ? 'success' : backup.verificationStatus === 'verification_failed' ? 'danger' : 'warning'}>{labelize(backup.verificationStatus)}</Badge></td>
                  </tr>
                ))}
                {systemHealth.backupRegistry.length === 0 && <tr><td colSpan={4}>No backup evidence recorded. Confirm Supabase backup capabilities before production migration or import.</td></tr>}
              </tbody></table></div>
            </section>

            <section className="panel table-panel">
              <div className="chart-header">
                <div><span className="chart-kicker">Restore control</span><h3>Recovery planning only</h3></div>
                <Button size="sm" variant="secondary" icon={<RotateCcw size={15} />} onClick={draftRestorePlan}>Draft plan</Button>
              </div>
              <p className="muted">No restore-now control is available here. Production recovery requires explicit Super Admin and infrastructure approval with a verified backup and documented impact.</p>
              <div className="table-scroll"><table className="table"><thead><tr><th>Plan</th><th>Target</th><th>Status</th><th>Approval</th></tr></thead><tbody>
                {systemHealth.restorePlans.map((plan) => (
                  <tr key={plan.id}>
                    <td><strong>{plan.reason}</strong><span>{plan.impact}</span></td>
                    <td>{plan.targetEnvironment}<span>{plan.dataScope}</span></td>
                    <td><Badge tone={plan.status === 'approved' ? 'warning' : plan.status === 'completed' ? 'success' : plan.status === 'cancelled' ? 'neutral' : 'info'}>{plan.status}</Badge></td>
                    <td>{plan.status === 'draft' ? <Button size="sm" variant="secondary" onClick={() => { approveRestorePlan(plan.id, actor); setRefreshKey((entry) => entry + 1) }}>Approve plan</Button> : plan.approvedBy ?? 'Not approved'}</td>
                  </tr>
                ))}
                {systemHealth.restorePlans.length === 0 && <tr><td colSpan={4}>No restore plans drafted.</td></tr>}
              </tbody></table></div>
            </section>
          </div>

          <div className="analytics-grid">
            <section className="panel table-panel">
              <div className="chart-header"><div><span className="chart-kicker">Migration safety</span><h3>Before imports or schema changes</h3></div><FileText size={18} /></div>
              <div className="table-scroll"><table className="table"><tbody>
                <tr><td><strong>Database environment</strong><span>{systemHealth.migrationSafety.environment}</span></td><td><Badge tone={isSupabaseConfigured ? 'success' : 'warning'}>{isSupabaseConfigured ? 'Configured' : 'Local only'}</Badge></td></tr>
                <tr><td><strong>Latest verified recovery point</strong><span>{systemHealth.migrationSafety.latestVerifiedRecoveryPoint ?? 'None recorded'}</span></td><td><Badge tone={systemHealth.migrationSafety.latestVerifiedRecoveryPoint ? 'success' : 'danger'}>{systemHealth.migrationSafety.latestVerifiedRecoveryPoint ? 'Available' : 'Required'}</Badge></td></tr>
                <tr><td><strong>Import history</strong><span>{systemHealth.migrationSafety.importRowsStored} stored import row outcome(s)</span></td><td>{systemHealth.migrationSafety.latestImportBatch ?? 'No completed batch'}</td></tr>
                {systemHealth.migrationSafety.warnings.map((warning) => <tr key={warning}><td><strong>Warning</strong><span>{warning}</span></td><td><Badge tone="warning">Review</Badge></td></tr>)}
              </tbody></table></div>
            </section>

            <section className="panel table-panel">
              <div className="chart-header"><div><span className="chart-kicker">Disaster recovery</span><h3>RPO, RTO, and outage response</h3></div><ShieldCheck size={18} /></div>
              <div className="table-scroll"><table className="table"><tbody>
                <tr><td><strong>Recovery Point Objective</strong><span>Clinic owner decision still required. Do not promise zero data loss.</span></td><td><Badge tone="warning">Decision required</Badge></td></tr>
                <tr><td><strong>Recovery Time Objective</strong><span>Clinic owner decision still required. Depends on Supabase plan, backup size, storage, DNS, and admins.</span></td><td><Badge tone="warning">Decision required</Badge></td></tr>
                {systemHealth.disasterRecovery.guidance.map((line) => <tr key={line}><td colSpan={2}>{line}</td></tr>)}
              </tbody></table></div>
            </section>
          </div>

          {systemHealth.recentFailures.length > 0 && (
            <section className="panel table-panel">
              <div className="chart-header"><div><span className="chart-kicker">Recent failures</span><h3>Operational warnings</h3></div><BellRing size={18} /></div>
              <div className="table-scroll"><table className="table"><tbody>
                {systemHealth.recentFailures.map((failure) => <tr key={failure.id}><td><strong>{failure.area}</strong><span>{failure.detail}</span></td><td>{formatDate(failure.occurredAt)}</td></tr>)}
              </tbody></table></div>
            </section>
          )}
        </div>
      )}

      <div className="panel">
        <strong>Administration boundary</strong>
        <p className="muted">System Administration reads existing source data from accounts, providers, branches, services, appointments, billing, inventory, expenses, communication, and audit stores. It does not duplicate operational records for administration.</p>
      </div>
    </section>
  )
}
