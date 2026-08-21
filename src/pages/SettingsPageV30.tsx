import { Building2, CheckCircle2, Clock3, History, LogOut, RefreshCw, Save, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { SettingsAuditActivityV56 } from '../components/settings/SettingsAuditActivityV56'
import { useAuth } from '../features/auth/AuthContext'
import { getStoredStaff } from '../features/auth/staffStore'
import { formatAuditAction, getRecentAuditLogs, recordAuditEntry } from '../features/security/auditLogStore'
import { getCurrentSessionUserName } from '../features/security/security'

const CLINIC_SETTINGS_KEY = 'plamenco.settings.clinic'

type SettingsTab = 'audit' | 'clinic' | 'security'
type ClinicSettings = { name: string; address: string; phone: string }

const defaultClinicSettings: ClinicSettings = { name: 'Plamenco Dental Co.', address: '', phone: '' }

function readClinicSettings(): ClinicSettings {
  try {
    const stored = window.localStorage.getItem(CLINIC_SETTINGS_KEY)
    return stored ? { ...defaultClinicSettings, ...JSON.parse(stored) } : defaultClinicSettings
  } catch {
    return defaultClinicSettings
  }
}

export function SettingsPageV30() {
  const { user, signOut } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('audit')
  const [auditAction, setAuditAction] = useState('all')
  const [auditSearch, setAuditSearch] = useState('')
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings>(() => readClinicSettings())
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [refreshKey, setRefreshKey] = useState(0)

  const staff = useMemo(() => getStoredStaff(), [refreshKey])
  const staffMap = useMemo(() => new Map(staff.map((member) => [member.id, member.name])), [staff])
  const logs = useMemo(() => getRecentAuditLogs(150), [refreshKey])
  const actionOptions = useMemo(() => [
    { value: 'all', label: 'All changes' },
    ...Array.from(new Set(logs.map((log) => log.action))).map((action) => ({ value: action, label: formatAuditAction(action).label })),
  ], [logs])

  const filteredLogs = useMemo(() => {
    const query = auditSearch.trim().toLowerCase()
    return logs.filter((log) => {
      const matchesAction = auditAction === 'all' || log.action === auditAction
      const staffName = staff.find((member) => [member.id, member.email, member.name].some((value) => value?.toLowerCase() === log.user.toLowerCase()))?.name
      const matchesSearch = !query || [staffName ?? '', log.user, log.entity, log.entityId, formatAuditAction(log.action).label, formatAuditAction(log.action).description]
        .join(' ')
        .toLowerCase()
        .includes(query)
      return matchesAction && matchesSearch
    })
  }, [auditAction, auditSearch, logs, staff])

  const uniqueActors = useMemo(() => new Set(logs.map((log) => staffMap.get(log.user) ?? log.user)).size, [logs, staffMap])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const todayCount = useMemo(() => logs.filter((log) => new Date(log.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) === today).length, [logs, today])

  function updateClinic<K extends keyof ClinicSettings>(key: K, value: ClinicSettings[K]) {
    setSaveState('idle')
    setClinicSettings((current) => ({ ...current, [key]: value }))
  }

  function saveClinicSettings() {
    try {
      if (!clinicSettings.name.trim()) throw new Error('Clinic name is required.')
      window.localStorage.setItem(CLINIC_SETTINGS_KEY, JSON.stringify({ ...clinicSettings, name: clinicSettings.name.trim() }))
      recordAuditEntry({
        user: getCurrentSessionUserName(), action: 'settings_changed', entity: 'clinic_settings', entityId: 'clinic-profile', metadata: { updatedFields: 'name,address,phone' },
      })
      setSaveState('saved')
      setRefreshKey((value) => value + 1)
    } catch {
      setSaveState('error')
    }
  }

  const tabs: Array<{ key: SettingsTab; label: string; description: string; icon: typeof Clock3 }> = [
    { key: 'audit', label: 'Change history', description: 'See who changed what across the clinic.', icon: History },
    { key: 'clinic', label: 'Clinic profile', description: 'Maintain the locally configured clinic identity fields.', icon: Building2 },
    { key: 'security', label: 'Security & session', description: 'Review access context and manage the current session.', icon: ShieldCheck },
  ]

  return (
    <section className="settings-v30 settings-v56">
      <header className="settings-v30-hero">
        <div>
          <span className="settings-v30-kicker">Administration controls</span>
          <h2>Settings</h2>
          <p>Govern clinic identity, review important changes, and manage your current session from one workspace.</p>
        </div>
        <div className="settings-v30-hero-actions">
          <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => setRefreshKey((value) => value + 1)}>Refresh</Button>
        </div>
      </header>

      <section className="settings-v30-metrics" aria-label="Settings summary">
        <article><span className="settings-v30-metric-icon"><History size={18} /></span><div><small>Recent changes</small><strong>{logs.length}</strong><p>Latest recorded clinic activity</p></div></article>
        <article><span className="settings-v30-metric-icon"><UserRound size={18} /></span><div><small>People involved</small><strong>{uniqueActors}</strong><p>Distinct people in change history</p></div></article>
        <article><span className="settings-v30-metric-icon"><Clock3 size={18} /></span><div><small>Changes today</small><strong>{todayCount}</strong><p>Asia/Manila business date</p></div></article>
        <article><span className="settings-v30-metric-icon"><Building2 size={18} /></span><div><small>Clinic profile</small><strong>{clinicSettings.name.trim() ? 'Configured' : 'Incomplete'}</strong><p>Clinic identity and contact details</p></div></article>
      </section>

      <div className="settings-v30-workspace">
        <aside className="settings-v30-nav" aria-label="Settings categories">
          <div className="settings-v30-nav-heading"><SlidersHorizontal size={17} /><span>Workspace</span></div>
          {tabs.map(({ key, label, description, icon: Icon }) => (
            <button key={key} type="button" className={activeTab === key ? 'is-active' : ''} onClick={() => setActiveTab(key)}>
              <span className="settings-v30-nav-icon"><Icon size={18} /></span>
              <span><strong>{label}</strong><small>{description}</small></span>
            </button>
          ))}
          <div className="settings-v30-session-card">
            <span>Signed in as</span>
            <strong>{user?.name || 'Clinic administrator'}</strong>
            <small>{user?.role?.replaceAll('_', ' ') || 'Authenticated account'}</small>
          </div>
        </aside>

        <main className="settings-v30-content">
          {activeTab === 'audit' && (
            <SettingsAuditActivityV56
              logs={filteredLogs}
              staff={staff}
              actionValue={auditAction}
              searchValue={auditSearch}
              actionOptions={actionOptions}
              onActionChange={setAuditAction}
              onSearchChange={setAuditSearch}
            />
          )}

          {activeTab === 'clinic' && (
            <section className="settings-v30-panel">
              <header className="settings-v30-panel-head">
                <div><span className="settings-v30-kicker">Clinic identity</span><h3>Profile & contact information</h3><p>Maintain the existing local clinic settings record without creating new branch or organization records.</p></div>
                {saveState === 'saved' && <Badge tone="success">Saved</Badge>}
                {saveState === 'error' && <Badge tone="danger">Save failed</Badge>}
              </header>

              <div className="settings-v30-profile-grid">
                <div className="settings-v30-brand-card"><span className="settings-v30-brand-mark">P</span><div><small>Clinic identity</small><strong>{clinicSettings.name || 'Unnamed clinic'}</strong><p>{clinicSettings.address || 'No clinic address configured'}</p></div></div>
                <div className="settings-v30-form-card">
                  <label><span>Clinic name</span><input value={clinicSettings.name} onChange={(event) => updateClinic('name', event.target.value)} placeholder="Clinic name" /></label>
                  <label><span>Phone</span><input type="tel" value={clinicSettings.phone} onChange={(event) => updateClinic('phone', event.target.value)} placeholder="Clinic phone" /></label>
                  <label className="is-wide"><span>Address</span><input value={clinicSettings.address} onChange={(event) => updateClinic('address', event.target.value)} placeholder="Clinic address" /></label>
                  <div className="settings-v30-save-row"><p>Changes are recorded in the existing local settings store and change history.</p><Button icon={<Save size={16} />} onClick={saveClinicSettings}>Save clinic profile</Button></div>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'security' && (
            <section className="settings-v30-panel">
              <header className="settings-v30-panel-head"><div><span className="settings-v30-kicker">Security & session</span><h3>Administrative access context</h3><p>This workspace reports only what the current client can truthfully know. It does not invent infrastructure, backup, encryption, or provider-security status.</p></div></header>

              <div className="settings-v30-security-grid">
                <article><span><ShieldCheck size={20} /></span><div><strong>Role & permission enforcement</strong><p>Access remains governed by the application&apos;s existing authentication and permission model.</p></div></article>
                <article><span><History size={20} /></span><div><strong>Change history</strong><p>Administrative and operational changes are reviewed through the owner-friendly history in this workspace.</p></div></article>
                <article><span><CheckCircle2 size={20} /></span><div><strong>Current session</strong><p>{user?.name ? `Authenticated as ${user.name}.` : 'An authenticated internal session is active.'}</p></div></article>
              </div>

              <div className="settings-v30-danger-zone">
                <div><span className="settings-v30-danger-icon"><LogOut size={19} /></span><div><strong>End current session</strong><p>Sign out of the application on this device. This does not modify the account itself.</p></div></div>
                <Button variant="danger" icon={<LogOut size={16} />} onClick={() => void signOut()}>Sign out</Button>
              </div>
            </section>
          )}
        </main>
      </div>
    </section>
  )
}
