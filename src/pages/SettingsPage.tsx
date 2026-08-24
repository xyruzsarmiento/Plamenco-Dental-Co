import { Building2, Clock3, LogOut, Save, Search, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Select } from '../components/ui/Select'
import { useAuth } from '../features/auth/AuthContext'
import { getStoredStaff } from '../features/auth/staffStore'
import { formatAuditAction, getRecentAuditLogs, recordAuditEntry } from '../features/security/auditLogStore'
import { getCurrentSessionUserName } from '../features/security/security'

const CLINIC_SETTINGS_KEY = 'plamenco.settings.clinic'

type SettingsTab = 'audit' | 'clinic' | 'security'
type ClinicSettings = {
  name: string
  address: string
  phone: string
}

const defaultClinicSettings: ClinicSettings = {
  name: 'Plamenco Dental Co.',
  address: '',
  phone: '',
}

function readClinicSettings(): ClinicSettings {
  try {
    const stored = window.localStorage.getItem(CLINIC_SETTINGS_KEY)
    return stored ? { ...defaultClinicSettings, ...JSON.parse(stored) } : defaultClinicSettings
  } catch {
    return defaultClinicSettings
  }
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
}

export function SettingsPage() {
  const { signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('audit')
  const [auditAction, setAuditAction] = useState('all')
  const [auditSearch, setAuditSearch] = useState('')
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings>(() => readClinicSettings())
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle')

  const logs = useMemo(() => getRecentAuditLogs(150), [])
  const staffMap = useMemo(() => new Map(getStoredStaff().map((staff) => [staff.id, staff.name])), [])
  const actionOptions = useMemo(() => [
    { value: 'all', label: 'All actions' },
    ...Array.from(new Set(logs.map((log) => log.action))).map((action) => ({
      value: action,
      label: formatAuditAction(action).label,
    })),
  ], [logs])

  const filteredLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase()
    return logs.filter((log) => {
      const matchesAction = auditAction === 'all' || log.action === auditAction
      const matchesSearch = !query || [
        staffMap.get(log.user) ?? log.user,
        log.user,
        log.entity,
        log.entityId,
        formatAuditAction(log.action).label,
      ].join(' ').toLowerCase().includes(query)
      return matchesAction && matchesSearch
    })
  }, [auditAction, auditSearch, logs, staffMap])

  function saveClinicSettings() {
    window.localStorage.setItem(CLINIC_SETTINGS_KEY, JSON.stringify(clinicSettings))
    recordAuditEntry({
      user: getCurrentSessionUserName(),
      action: 'settings_changed',
      entity: 'clinic_settings',
      entityId: 'clinic-profile',
      metadata: { updatedFields: 'name,address,phone' },
    })
    setSaveState('saved')
  }

  const tabs: Array<{ key: SettingsTab; label: string; description: string; icon: typeof Clock3 }> = [
    { key: 'audit', label: 'Audit activity', description: 'Review recorded administrative and operational changes.', icon: Clock3 },
    { key: 'clinic', label: 'Clinic profile', description: 'Maintain the locally configured clinic identity fields.', icon: Building2 },
    { key: 'security', label: 'Security & session', description: 'Review security scope and end the current session.', icon: ShieldCheck },
  ]

  return (
    <section className="page-stack settings-page-v6">
      <header className="section-header premium-section-header settings-header-v6">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>Settings</h2>
          <p>Configuration and governance controls organized by task instead of one oversized settings form.</p>
        </div>
      </header>

      <div className="settings-workspace-v6">
        <aside className="settings-rail-v6" aria-label="Settings categories">
          {tabs.map(({ key, label, description, icon: Icon }) => (
            <button key={key} type="button" className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>
              <span className="settings-rail-icon-v6"><Icon size={17} /></span>
              <span><strong>{label}</strong><small>{description}</small></span>
            </button>
          ))}
        </aside>

        <main className="settings-content-v6">
          {activeTab === 'audit' && (
            <section className="settings-panel-v6">
              <div className="settings-panel-header-v6">
                <div><p className="eyebrow">Audit activity</p><h3>Recorded system changes</h3><p>Search existing audit records by user, action, entity, or identifier.</p></div>
                <Badge tone="info">{filteredLogs.length} records</Badge>
              </div>

              <div className="settings-filterbar-v6">
                <label className="settings-search-v6"><Search size={16} /><input type="search" placeholder="Search audit activity" value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} /></label>
                <Select label="Action" value={auditAction} onChange={(event) => setAuditAction(event.target.value)} options={actionOptions} />
              </div>

              {filteredLogs.length === 0 ? (
                <div className="empty-state-panel"><Clock3 size={22} /><h3>No audit records match</h3><p>Change the search or action filter to review other recorded activity.</p></div>
              ) : (
                <div className="settings-table-wrap-v6">
                  <table>
                    <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Identifier</th></tr></thead>
                    <tbody>
                      {filteredLogs.map((log) => {
                        const action = formatAuditAction(log.action)
                        return (
                          <tr key={log.id}>
                            <td>{formatDateTime(log.timestamp)}</td>
                            <td><strong>{staffMap.get(log.user) ?? log.user}</strong></td>
                            <td><Badge tone="info">{action.label}</Badge></td>
                            <td>{log.entity}</td>
                            <td><code>{log.entityId}</code></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === 'clinic' && (
            <section className="settings-panel-v6 settings-form-panel-v6">
              <div className="settings-panel-header-v6">
                <div><p className="eyebrow">Clinic profile</p><h3>Identity & contact information</h3><p>These fields use the existing local settings store and do not create new branch or organization records.</p></div>
                {saveState === 'saved' && <Badge tone="success">Saved</Badge>}
              </div>

              <div className="settings-form-grid-v6">
                <label><span>Clinic name</span><input value={clinicSettings.name} onChange={(event) => { setSaveState('idle'); setClinicSettings((current) => ({ ...current, name: event.target.value })) }} /></label>
                <label><span>Phone</span><input type="tel" value={clinicSettings.phone} onChange={(event) => { setSaveState('idle'); setClinicSettings((current) => ({ ...current, phone: event.target.value })) }} placeholder="Clinic phone" /></label>
                <label className="settings-field-wide-v6"><span>Address</span><input value={clinicSettings.address} onChange={(event) => { setSaveState('idle'); setClinicSettings((current) => ({ ...current, address: event.target.value })) }} placeholder="Clinic address" /></label>
              </div>

              <div className="settings-actions-v6"><Button icon={<Save size={16} />} onClick={saveClinicSettings}>Save clinic profile</Button></div>
            </section>
          )}

          {activeTab === 'security' && (
            <section className="settings-panel-v6">
              <div className="settings-panel-header-v6">
                <div><p className="eyebrow">Security & session</p><h3>Current administrative session</h3><p>This page does not infer backup health, encryption health, provider verification, or integration security status.</p></div>
              </div>

              <div className="settings-security-grid-v6">
                <article><ShieldCheck size={18} /><div><strong>Role and permission enforcement</strong><p>Access remains governed by the application&apos;s existing authentication and permission model.</p></div></article>
                <article><Clock3 size={18} /><div><strong>Audit evidence</strong><p>Sensitive actions are reviewed through the recorded audit activity shown in this workspace.</p></div></article>
              </div>

              <div className="settings-danger-zone-v6">
                <div><strong>End current session</strong><p>Sign out of the application on this device.</p></div>
                <Button variant="danger" icon={<LogOut size={16} />} onClick={() => void signOut()}>Sign out</Button>
              </div>
            </section>
          )}
        </main>
      </div>
    </section>
  )
}
