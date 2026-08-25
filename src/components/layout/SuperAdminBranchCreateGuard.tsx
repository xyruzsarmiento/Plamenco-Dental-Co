import { Building2, ShieldAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/AuthContext'
import { useBranchContext } from '../../features/branches/BranchContext'

type BlockedAction = {
  label: string
}

type RouteRule = {
  prefix: string
  actions: Array<{ pattern: RegExp; label: string }>
}

const ROUTE_RULES: RouteRule[] = [
  {
    prefix: '/app/appointments',
    actions: [
      { pattern: /\b(create|new|add|book)\s+appointment\b/i, label: 'Create appointment' },
    ],
  },
  {
    prefix: '/app/billing',
    actions: [
      { pattern: /\brecord\s+payment\b/i, label: 'Record payment' },
      { pattern: /\b(add|new)\s+payment\b/i, label: 'Record payment' },
      { pattern: /\b(create|new)\s+invoice\b/i, label: 'Create invoice' },
      { pattern: /\b(issue|create|process)\s+refund\b/i, label: 'Issue refund' },
    ],
  },
  {
    prefix: '/app/expenses',
    actions: [
      { pattern: /\b(add|create|new)\s+expense\b/i, label: 'Add expense' },
      { pattern: /\bsmall\s+cash\s+purchase\b/i, label: 'Record small cash purchase' },
      { pattern: /\brecord\s+small\s+cash\b/i, label: 'Record small cash purchase' },
      { pattern: /\b(new|create|add)\s+(schedule|scheduled expense)\b/i, label: 'Create scheduled expense' },
      { pattern: /\bcreate\s+supplier\s+expense\b/i, label: 'Create supplier expense' },
    ],
  },
  {
    prefix: '/app/inventory',
    actions: [
      { pattern: /\bstock\s+in\b/i, label: 'Stock in' },
      { pattern: /\bstock\s+out\b/i, label: 'Stock out' },
      { pattern: /\badjust\s+(inventory|stock)\b/i, label: 'Adjust inventory' },
      { pattern: /\b(add|new)\s+inventory\b/i, label: 'Add inventory' },
      { pattern: /\b(create|new)\s+purchase\s+order\b/i, label: 'Create purchase order' },
      { pattern: /\bpurchase\s+order\b/i, label: 'Create purchase order' },
      { pattern: /\b(start|create|new)\s+stock\s+count\b/i, label: 'Start stock count' },
      { pattern: /\b(create|new|start)\s+(stock\s+)?transfer\b/i, label: 'Create stock transfer' },
      { pattern: /\breceive\s+transfer\b/i, label: 'Receive stock transfer' },
    ],
  },
  {
    prefix: '/app/documents',
    actions: [
      { pattern: /\b(upload|add|create)\s+(a\s+)?document\b/i, label: 'Upload operational document' },
    ],
  },
  {
    prefix: '/app/data-import',
    actions: [
      { pattern: /\b(start|run|confirm|continue)\s+import\b/i, label: 'Run data import' },
      { pattern: /\b(import|upload)\s+(data|file|records)\b/i, label: 'Run data import' },
      { pattern: /\b(choose|select)\s+file\b/i, label: 'Run data import' },
    ],
  },
]

function normalizedActionText(element: HTMLElement) {
  const explicit = element.closest<HTMLElement>('[data-branch-sensitive-create]')
  if (explicit) {
    return {
      text: explicit.dataset.branchActionLabel || explicit.getAttribute('aria-label') || explicit.textContent || 'Create operational record',
      explicit: true,
    }
  }

  return {
    text: [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.textContent,
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    explicit: false,
  }
}

function resolveBlockedAction(pathname: string, element: HTMLElement): BlockedAction | null {
  const candidate = normalizedActionText(element)
  if (candidate.explicit) return { label: candidate.text.trim() || 'Create operational record' }
  if (!candidate.text) return null

  const rule = ROUTE_RULES.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))
  if (!rule) return null
  const match = rule.actions.find((action) => action.pattern.test(candidate.text))
  return match ? { label: match.label } : null
}

export function SuperAdminBranchCreateGuard() {
  const { user } = useAuth()
  const {
    availableBranches,
    isAllBranchesMode,
    setActiveBranch,
  } = useBranchContext()
  const location = useLocation()
  const [blockedAction, setBlockedAction] = useState<BlockedAction | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (user?.role !== 'super_admin' || !isAllBranchesMode) return

    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('button, a, [role="button"], [data-branch-sensitive-create]')
        : null
      if (!target || target.closest('.branch-create-gate')) return

      const action = resolveBlockedAction(location.pathname, target)
      if (!action) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      restoreFocusRef.current = target
      setBlockedAction(action)
    }

    const handleFileChange = (event: Event) => {
      if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'file') return
      if (!(location.pathname === '/app/data-import' || location.pathname.startsWith('/app/data-import/'))) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      event.target.value = ''
      restoreFocusRef.current = event.target
      setBlockedAction({ label: 'Run data import' })
    }

    document.addEventListener('click', handleClick, true)
    document.addEventListener('change', handleFileChange, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('change', handleFileChange, true)
    }
  }, [isAllBranchesMode, location.pathname, user?.role])

  useEffect(() => {
    if (!blockedAction) return
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setBlockedAction(null)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [blockedAction])

  const close = () => {
    setBlockedAction(null)
    window.setTimeout(() => restoreFocusRef.current?.focus(), 0)
  }

  if (user?.role !== 'super_admin' || !blockedAction) return null

  return (
    <div className="branch-create-gate" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close()
    }}>
      <section className="branch-create-gate__dialog" role="dialog" aria-modal="true" aria-labelledby="branch-create-gate-title" aria-describedby="branch-create-gate-description">
        <header>
          <span className="branch-create-gate__icon" aria-hidden="true"><ShieldAlert size={20} /></span>
          <div>
            <small>ALL BRANCHES SAFETY</small>
            <h2 id="branch-create-gate-title">Choose a branch before {blockedAction.label.toLowerCase()}</h2>
          </div>
          <button ref={closeRef} type="button" className="branch-create-gate__close" onClick={close} aria-label="Close branch selection dialog">
            <X size={18} />
          </button>
        </header>

        <p id="branch-create-gate-description">
          All Branches is an executive overview. Branch-owned operational records need one deliberate branch workspace before the action can continue.
        </p>

        <div className="branch-create-gate__choices" role="group" aria-label="Choose branch workspace">
          {availableBranches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              onClick={() => {
                setActiveBranch(branch.id)
                setBlockedAction(null)
                window.dispatchEvent(new CustomEvent('plamenco-branch-workspace-changed', { detail: { branchId: branch.id, branchName: branch.name } }))
              }}
            >
              <Building2 size={18} aria-hidden="true" />
              <span><strong>{branch.name}</strong><small>Switch workspace and continue from this branch</small></span>
            </button>
          ))}
        </div>

        <footer>
          <span>Selection is workspace context only. Database authorization remains server-enforced.</span>
          <button type="button" onClick={close}>Stay in All Branches</button>
        </footer>
      </section>
    </div>
  )
}
