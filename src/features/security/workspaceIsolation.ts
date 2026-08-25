import { clearAllQueryCache } from '../../lib/queryCache'

const SENSITIVE_EXACT_KEYS = new Set([
  'plamenco.patients',
  'plamenco.appointments',
  'plamenco.dentalRecords',
  'plamenco.treatments',
  'plamenco.treatmentPlans',
  'plamenco.prescriptions',
  'plamenco.invoices',
  'plamenco.payments',
  'plamenco.documents',
  'plamenco.auditLogs',
])

const SENSITIVE_PREFIXES = [
  'plamenco.billing.',
  'plamenco.inventory.',
  'plamenco.expense.',
  'plamenco.expenses',
  'plamenco.reports.',
  'plamenco.admin.',
  'plamenco.staff.',
]

const BRANCH_SCOPE_PREFIX = 'plamenco.branch-scope.'

function matchingWorkspaceKeys(includeBranchScope: boolean) {
  if (typeof window === 'undefined') return [] as string[]
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key) continue
    if (SENSITIVE_EXACT_KEYS.has(key) || SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix)) || (includeBranchScope && key.startsWith(BRANCH_SCOPE_PREFIX))) {
      keys.push(key)
    }
  }
  return keys
}

export function clearBranchSensitiveWorkspaceCache() {
  clearAllQueryCache()
  if (typeof window === 'undefined') return
  matchingWorkspaceKeys(false).forEach((key) => window.localStorage.removeItem(key))
  window.dispatchEvent(new CustomEvent('plamenco:workspace-cache-cleared', { detail: { reason: 'branch-access-change' } }))
}

export function clearAuthenticatedWorkspaceState() {
  clearAllQueryCache()
  if (typeof window === 'undefined') return
  matchingWorkspaceKeys(true).forEach((key) => window.localStorage.removeItem(key))
  window.dispatchEvent(new CustomEvent('plamenco:workspace-cache-cleared', { detail: { reason: 'account-boundary' } }))
}

export function notifyBranchContextChanged(branchId: string | null, mode: 'branch' | 'all') {
  clearAllQueryCache()
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('plamenco:branch-context-changed', { detail: { branchId, mode } }))
}
