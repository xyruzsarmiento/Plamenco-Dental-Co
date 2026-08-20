import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { roleLabels, usePermissions } from '../../features/auth/permissions'
import { Button } from '../ui/Button'
import { navigationGroups, navigationItems } from './navigation'

function getPageClass(pathname: string) {
  if (pathname === '/app' || pathname === '/app/') return 'page-dashboard'
  const segment = pathname.replace(/^\/app\/?/, '').split('/')[0] || 'dashboard'
  return `page-${segment.replace(/[^a-z0-9-]/gi, '-').toLowerCase()}`
}

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
            <span className="avatar">{user?.name?.charAt(0)?.toUpperCase() ?? 'U'}</span>
            <span>
              <strong>{user?.name || user?.email || 'Signed in user'}</strong>
              <small>{user?.role ? roleLabels[user.role] : 'User'}</small>
            </span>
          </div>
          <Button
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
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            type="button"
            aria-label="Open navigation"
            onClick={() => setIsMobileNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="topbar-copy">
            <p className="eyebrow">{workspaceEyebrow}</p>
            <h1>{currentPage}</h1>
          </div>
          <div className="topbar-account-pill" aria-label="Current account role">
            {user?.role ? roleLabels[user.role] : 'User'}
          </div>
        </header>

        <main className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
