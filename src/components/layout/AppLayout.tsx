import '../../styles/internal-portal-blue-unification-v103.css'
import '../../styles/internal-portal-responsive-v105.css'
import '../../styles/internal-portal-shell-fix-v106.css'
import '../../styles/portal-shell-premium-v1.css'
import '../../styles/super-admin-branch-workspace-v119.css'
import { Menu, X } from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { roleLabels, usePermissions } from '../../features/auth/permissions'
import { useBranchContext } from '../../features/branches/BranchContext'
import { TopbarNotificationBell } from '../../features/notifications/TopbarNotificationBell'
import { getAvatarDisplayUrl, getInitials, loadOwnInternalProfile } from '../../features/profiles/profileStore'
import { clearModalScrollLocks } from '../../lib/modalScrollLock'
import { Button } from '../ui/Button'
import { BranchContextIndicator } from './BranchContextIndicator'
import { navigationGroups, navigationItems } from './navigation'
import { SuperAdminBranchCreateGuard } from './SuperAdminBranchCreateGuard'

function getPageClass(pathname: string) {
  if (pathname === '/app' || pathname === '/app/') return 'page-dashboard'
  const segment = pathname.replace(/^\/app\/?/, '').split('/')[0] || 'dashboard'
  return `page-${segment.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`
}

export function AppLayout() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [avatarPath, setAvatarPath] = useState('')
  const [avatarUpdatedAt, setAvatarUpdatedAt] = useState('')
  const [profileName, setProfileName] = useState('')
  const { user, signOut } = useAuth()
  const { canAny } = usePermissions()
  const { availableBranches } = useBranchContext()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    let active = true
    const refreshProfileChrome = (force = false) => {
      if (!user?.id || user.role === 'patient') {
        setAvatarPath('')
        setAvatarUpdatedAt('')
        setProfileName('')
        return
      }
      void loadOwnInternalProfile(user.id, { force })
        .then((profile) => {
          if (!active) return
          setAvatarPath(profile.avatarPath)
          setAvatarUpdatedAt(profile.updatedAt)
          setProfileName(profile.fullName)
        })
        .catch(() => {
          if (!active) return
          setAvatarPath('')
          setAvatarUpdatedAt('')
          setProfileName(user.name ?? '')
        })
    }

    refreshProfileChrome(false)
    const handleProfileUpdated = () => refreshProfileChrome(true)
    window.addEventListener('plamenco-profile-updated', handleProfileUpdated)
    return () => {
      active = false
      window.removeEventListener('plamenco-profile-updated', handleProfileUpdated)
    }
  }, [user?.id, user?.name, user?.role])

  useEffect(() => {
    document.body.classList.toggle('pv3-nav-lock', isMobileNavOpen)
    return () => document.body.classList.remove('pv3-nav-lock')
  }, [isMobileNavOpen])

  useEffect(() => {
    clearModalScrollLocks()
  }, [location.pathname])

  const currentPage =
    navigationItems.find(
      (item) =>
        location.pathname === item.path ||
        (item.path !== '/app' && location.pathname.startsWith(`${item.path}/`)) ||
        (item.path === '/app' && (location.pathname === '/app' || location.pathname === '/app/')),
    )?.label ?? (location.pathname.startsWith('/app/notifications') ? 'Notifications' : 'Workspace')

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.roles && (!user?.role || !item.roles.includes(user.role))) return false
        return !item.anyOf || canAny(item.anyOf)
      }),
    }))
    .filter((group) => group.items.length > 0)

  const workspaceEyebrow =
    user?.role === 'staff'
      ? 'Front desk operations'
      : user?.role === 'dentist' || user?.role === 'associate_dentist'
        ? 'Clinical workspace'
        : user?.role === 'super_admin'
          ? 'Executive administration'
          : 'Clinic workspace'

  const rawAvatarUrl = getAvatarDisplayUrl(avatarPath)
  const avatarUrl = rawAvatarUrl && avatarUpdatedAt
    ? `${rawAvatarUrl}${rawAvatarUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(avatarUpdatedAt)}`
    : rawAvatarUrl
  const avatarStyle = avatarUrl ? ({ '--profile-avatar-image': `url(${avatarUrl})` } as CSSProperties) : undefined
  const initials = getInitials(profileName || user?.name || '', user?.email ?? '')
  const showBranchSelector = user?.role === 'super_admin' || availableBranches.length > 1

  return (
    <div className={`app-shell role-${user?.role ?? 'guest'} ${getPageClass(location.pathname)}`}>
      <aside className={`sidebar ${isMobileNavOpen ? 'is-open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-lockup">
            <span className="brand-symbol">P</span>
            <span>
              <strong>Plamenco</strong>
              <small>Dental Co.</small>
            </span>
          </div>
          <button className="icon-button mobile-only" type="button" aria-label="Close navigation" onClick={() => setIsMobileNavOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {visibleGroups.map((group) => (
            <div key={group.title} className="nav-section">
              <p className="nav-section-label">{group.title}</p>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink key={item.path} to={item.path} end={item.path === '/app'} onClick={() => setIsMobileNavOpen(false)}>
                    <Icon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <NavLink className="internal-avatar-upload" title="Open profile" to="/app/profile">
              <span className="avatar" style={avatarStyle}>{!avatarUrl && initials}</span>
            </NavLink>
            <span>
              <strong>{profileName || user?.name || user?.email || 'Signed in user'}</strong>
              <small>{user?.role ? roleLabels[user.role] : 'User'}</small>
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { signOut(); navigate('/login', { replace: true }) }}>
            Sign out
          </Button>
        </div>
      </aside>

      {isMobileNavOpen && <button className="nav-backdrop" type="button" aria-label="Close navigation" onClick={() => setIsMobileNavOpen(false)} />}

      <div className="main-shell">
        <header className="topbar">
          <button className="icon-button mobile-only" type="button" aria-label="Open navigation" onClick={() => setIsMobileNavOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="topbar-copy">
            <p className="eyebrow">{workspaceEyebrow}</p>
            <h1>{currentPage}</h1>
          </div>
          {showBranchSelector && <BranchContextIndicator />}
          <div className="topbar-actions">
            <TopbarNotificationBell />
            <div className="topbar-account-pill" aria-label="Current account role">
              {user?.role ? roleLabels[user.role] : 'User'}
            </div>
          </div>
        </header>

        <main className="content-area"><Outlet /></main>
      </div>

      {user?.role === 'super_admin' && <SuperAdminBranchCreateGuard />}
    </div>
  )
}
