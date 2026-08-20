import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { roleLabels, usePermissions } from '../../features/auth/permissions'
import { Button } from '../ui/Button'
import { navigationGroups, navigationItems } from './navigation'

export function AppLayout() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const { user, signOut } = useAuth()
  const { canAny } = usePermissions()
  const location = useLocation()
  const navigate = useNavigate()

  const currentPage =
    navigationItems.find(
      (item) =>
        location.pathname === item.path ||
        (item.path !== '/app' && location.pathname.startsWith(`${item.path}/`)) ||
        (item.path === '/app' && (location.pathname === '/app' || location.pathname === '/app/')),
    )?.label ?? 'Workspace'

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (user?.role === 'admin' && item.path === '/app/system-admin') return false
        return !item.anyOf || canAny(item.anyOf)
      }),
    }))
    .filter((group) => group.items.length > 0)

  const workspaceEyebrow =
    user?.role === 'staff'
      ? 'Front desk operations'
      : user?.role === 'dentist' || user?.role === 'associate_dentist'
        ? 'Clinical workspace'
        : user?.role === 'admin'
          ? 'Clinic operations'
          : user?.role === 'super_admin'
            ? 'Executive administration'
            : 'Clinic workspace'

  const roleLabel = user?.role ? roleLabels[user.role] : 'User'
  const initial = user?.name?.trim().charAt(0).toUpperCase() || 'U'

  return (
    <div className={`app-shell role-${user?.role ?? 'guest'}`}>
      <aside className={`sidebar ${isMobileNavOpen ? 'is-open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-lockup-modern">
            <span className="brand-mark-modern" aria-hidden="true">P</span>
            <span className="brand-copy-modern">
              <strong>Plamenco Dental Co.</strong>
              <small>{workspaceEyebrow}</small>
            </span>
          </div>
          <button
            className="icon-button mobile-only"
            type="button"
            aria-label="Close navigation"
            onClick={() => setIsMobileNavOpen(false)}
          >
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
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/app'}
                    onClick={() => setIsMobileNavOpen(false)}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-profile-modern">
            <span className="avatar" aria-hidden="true">{initial}</span>
            <span className="sidebar-profile-copy">
              <strong>{user?.name || user?.email || 'Signed in user'}</strong>
              <small>{roleLabel}</small>
            </span>
          </div>
          <Button
            className="sidebar-signout-modern"
            variant="secondary"
            size="sm"
            onClick={() => {
              signOut()
              navigate('/login', { replace: true })
            }}
          >
            Sign out
          </Button>
        </div>
      </aside>

      {isMobileNavOpen && (
        <button
          className="nav-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

      <div className="main-shell">
        <header className="topbar topbar-modern">
          <button
            className="icon-button mobile-only"
            type="button"
            aria-label="Open navigation"
            onClick={() => setIsMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>

          <div className="topbar-heading-modern">
            <p className="eyebrow">{workspaceEyebrow}</p>
            <h1>{currentPage}</h1>
          </div>

          <div className="topbar-meta-modern" aria-label="Current account role">
            <span className="role-chip-modern">
              <span className="role-chip-dot" aria-hidden="true" />
              {roleLabel}
            </span>
          </div>
        </header>

        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
