import { Activity, BellRing, Building2, ChevronRight, CreditCard, Database, FileText, Settings, ShieldCheck, Stethoscope, UsersRound, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getSystemAdminSnapshot } from '../features/admin/systemAdminStore'
import { getSystemHealthSnapshot } from '../features/admin/systemHealthStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredServices } from '../features/services/serviceStore'
import { SystemAdministrationPage } from './SystemAdministrationPage'

const ownerLinks = [
  { to: '/app/staff', label: 'Team & Access', description: 'Manage clinic staff, roles and account access.', icon: UsersRound },
  { to: '/app/branches', label: 'Branches', description: 'Review locations and branch-level configuration.', icon: Building2 },
  { to: '/app/services', label: 'Services', description: 'Manage treatment catalogue, availability and pricing.', icon: Stethoscope },
  { to: '/app/billing', label: 'Billing & Payments', description: 'Review payment methods, collections and receivables.', icon: CreditCard },
  { to: '/app/settings', label: 'Clinic Settings', description: 'Update clinic identity, booking and operational preferences.', icon: Settings },
  { to: '/app/notifications', label: 'Notifications', description: 'Review internal notification activity and delivery settings.', icon: BellRing },
]

export function SystemAdministrationPageV58() {
  const snapshot = getSystemAdminSnapshot()
  const health = getSystemHealthSnapshot()
  const branches = getStoredBranches()
  const providers = getStoredProviders()
  const patients = getStoredPatients()
  const services = getStoredServices()
  const warnings = snapshot.securityDiagnostics.filter((item) => item.status !== 'healthy').length + snapshot.dataIntegrityDiagnostics.filter((item) => item.status !== 'healthy').length
  const backupEvidence = health.backupRegistry.length

  return (
    <section className="sys58-page">
      <header className="sys58-hero">
        <div className="sys58-hero-copy">
          <span className="sys58-kicker">OWNER CONTROL CENTER</span>
          <h1>System Administration</h1>
          <p>Business-facing clinic administration first. Technical recovery, infrastructure and diagnostic tools are kept in a separate advanced area.</p>
        </div>
        <div className="sys58-hero-status">
          <span><ShieldCheck size={16} /> Super Admin</span>
          <strong>{warnings === 0 ? 'No owner-action warnings' : `${warnings} item${warnings === 1 ? '' : 's'} need attention`}</strong>
          <small>Use the cards below for normal clinic management.</small>
        </div>
      </header>

      <section className="sys58-owner-note">
        <div className="sys58-owner-note-icon"><Activity size={18} /></div>
        <div>
          <strong>Designed for the clinic owner</strong>
          <p>You should not need backup references, restore planning, infrastructure checks or integration diagnostics during normal clinic operations. Those tools remain available under Advanced system tools for technical support or an administrator.</p>
        </div>
      </section>

      <section className="sys58-kpis" aria-label="Clinic administration summary">
        <article><span>Patients</span><strong>{patients.length}</strong><small>{snapshot.patientAccounts} linked accounts</small></article>
        <article><span>Dentists</span><strong>{snapshot.activeDentists}</strong><small>{providers.length} provider profiles</small></article>
        <article><span>Branches</span><strong>{snapshot.activeBranches}</strong><small>{branches.length} configured locations</small></article>
        <article><span>Services</span><strong>{snapshot.activeServices}</strong><small>{services.length} catalogue entries</small></article>
      </section>

      <section className="sys58-section">
        <div className="sys58-section-head">
          <div><span>DAILY ADMINISTRATION</span><h2>Clinic management</h2><p>Open the dedicated workspace for the task you actually want to manage.</p></div>
        </div>
        <div className="sys58-owner-grid">
          {ownerLinks.map(({ to, label, description, icon: Icon }) => (
            <Link to={to} className="sys58-owner-card" key={to}>
              <span className="sys58-owner-icon"><Icon size={19} /></span>
              <span className="sys58-owner-copy"><strong>{label}</strong><small>{description}</small></span>
              <ChevronRight size={17} className="sys58-owner-arrow" />
            </Link>
          ))}
        </div>
      </section>

      <section className="sys58-section sys58-governance">
        <div className="sys58-section-head">
          <div><span>GOVERNANCE</span><h2>Owner-level oversight</h2><p>Only the information that helps you understand whether the clinic setup needs attention.</p></div>
        </div>
        <div className="sys58-governance-grid">
          <article><span className="sys58-governance-icon"><ShieldCheck size={18} /></span><div><strong>Security & data checks</strong><b>{warnings}</b><small>{warnings ? 'Review the advanced diagnostics with technical support.' : 'No current warnings in recorded diagnostics.'}</small></div></article>
          <article><span className="sys58-governance-icon"><FileText size={18} /></span><div><strong>Failed system operations</strong><b>{snapshot.failedSystemOperations}</b><small>Recorded administrative/system operation failures.</small></div></article>
          <article><span className="sys58-governance-icon"><Database size={18} /></span><div><strong>Backup evidence</strong><b>{backupEvidence}</b><small>Recorded evidence only; this does not create or verify a backup.</small></div></article>
        </div>
      </section>

      <details className="sys58-advanced">
        <summary>
          <span className="sys58-advanced-icon"><Wrench size={18} /></span>
          <span><strong>Advanced system tools</strong><small>For technical support, infrastructure work, audit, integrations, recovery and diagnostics.</small></span>
          <ChevronRight size={18} className="sys58-advanced-chevron" />
        </summary>
        <div className="sys58-advanced-warning"><strong>Technical area</strong><span>These controls are not part of normal daily clinic operation. Use them only when you understand the effect or when guided by technical support.</span></div>
        <div className="sys58-legacy-shell"><SystemAdministrationPage /></div>
      </details>
    </section>
  )
}
