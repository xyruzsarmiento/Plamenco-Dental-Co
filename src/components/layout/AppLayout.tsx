import { Menu, Search, X } from 'lucide-react'
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

  const visibleGroups = navigationGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (user?.role === 'admin' && item.path === '/app/system-admin') return false
      return !item.anyOf || canAny(item.anyOf)
    }),
  })).filter((group) => group.items.length > 0)

  const workspaceEyebrow =
    user?.role === 'staff'
      ? 'Front desk operations'
      : user?.role === 'dentist' || user?.role === 'associate_dentist'
        ? 'Clinical workspace'
        : user?.role === 'admin'
          ? 'Clinic operations'
          : user?.role === 'super_admin'
            ? 'System administration'
            : 'Clinic management'

  return (
    <div className={`app-shell role-${user?.role ?? 'guest'}`}>
      <aside className={`sidebar ${isMobileNavOpen ? 'is-open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-lockup">
            <span className="brand-symbol">P</span>
            <span>
              <strong>Plamenco</strong>
              <small>Dental Co</small>
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
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <span className="avatar">{user?.name.charAt(0) ?? 'U'}</span>
            <span>
              <strong>{user?.name}</strong>
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
          <div className="topbar-actions">
            <label className="search-field">
              <Search size={16} />
              <input type="search" placeholder="Search patients, invoices, visits" />
            </label>
            <span className="topbar-status">
              <span className="status-dot" />
              Clinic online
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
