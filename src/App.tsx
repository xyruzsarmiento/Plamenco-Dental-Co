import { Fragment, useEffect, useState } from 'react'
import { AppRouter } from './app/AppRouter'
import { AppErrorBoundary } from './components/system/AppErrorBoundary'
import { AdaptivePaginationEnhancer } from './components/system/AdaptivePaginationEnhancer'
import { AppointmentJourneyAvatarEnhancer } from './components/system/AppointmentJourneyAvatarEnhancer'
import { ExpenseTrendEnhancer } from './components/system/ExpenseTrendEnhancer'
import { InternalUiActionsEnhancerV116 } from './components/system/InternalUiActionsEnhancerV116'
import { InventoryBranchScopeEnhancerV118 } from './components/system/InventoryBranchScopeEnhancerV118'
import { PersistenceStatusNotice } from './components/system/PersistenceStatusNotice'
import { PortalSkeleton } from './components/ui/DesignSystem'
import { ModalAccessibilityManager } from './components/ui/ModalAccessibilityManager'
import { useAuth } from './features/auth/AuthContext'
import { AuthProvider } from './features/auth/AuthProvider'
import { loadBranchesFromSupabase } from './features/branches/branchStore'
import { loadProviderFoundationFromSupabase } from './features/dentists/dentistStore'
import { loadPatientsFromSupabase } from './features/patients/patientPersistence'
import { OfflineStatusBanner } from './features/patientPortal/OfflineStatusBanner'
import { PatientDocumentLinkInterceptor } from './features/patientPortal/PatientDocumentLinkInterceptor'
import { hydratePatientPortalFromDatabase } from './features/patientPortal/patientPortalHydration'
import { WorkspaceAccountIsolationGuard } from './features/security/WorkspaceIsolationGuard'
import { loadServicesFromSupabase } from './features/services/serviceStore'
import { cachedQuery, queryCachePolicy, readCachedQuery } from './lib/queryCache'
import { syncSupabaseToLocalStorage } from './lib/supabaseSync'
import './styles/adaptive-pagination.css'
import './styles/public-auth-responsive-part7.css'
import './styles/internal-appointments-refinement-v2.css'
import './styles/final-ui-refinements-v109.css'
import './styles/modal-stack-fixes-v110.css'
import './styles/appointments-compact-flow-v111.css'
import './styles/internal-appointments-spacing-v112.css'
import './styles/internal-appointments-role-unification-v113.css'
import './styles/internal-appointments-role-unification-v114.css'
import './styles/internal-expense-trend-and-card-cleanup-v115.css'
import './styles/clinic-ui-fixes-v116.css'
import './styles/internal-hero-cleanup-v117.css'
import './styles/inventory-compact-branch-v118.css'
import './styles/internal-expenses-branch-v122.css'
import './styles/internal-reports-branch-v124.css'
import './styles/branch-assignment-admin-v126.css'
import './styles/part11-documents-import-forms-v127.css'
import './styles/operational-workspace-parity-part1.css'

const PATIENT_PORTAL_CACHE_KEYS = [
  'plamenco.appointments',
  'plamenco.dentalRecords',
  'plamenco.treatments',
  'plamenco.treatmentPlans',
  'plamenco.prescriptions',
  'plamenco.invoices',
  'plamenco.payments',
  'plamenco.billing.receipts',
  'plamenco.documents',
]

const BOOTSTRAP_TIMEOUT_MS = 8_000
const BACKGROUND_SYNC_TIMEOUT_MS = 20_000

function clearPatientPortalCaches() {
  if (typeof window === 'undefined') return
  PATIENT_PORTAL_CACHE_KEYS.forEach((key) => window.localStorage.removeItem(key))
}

function patientPortalSnapshot() {
  if (typeof window === 'undefined') return ''
  return PATIENT_PORTAL_CACHE_KEYS
    .map((key) => `${key}:${window.localStorage.getItem(key) ?? ''}`)
    .join('|')
}

function settleWithin<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      console.warn(`[${label}] timed out after ${timeoutMs}ms; continuing with available data.`)
      resolve(undefined)
    }, timeoutMs)

    promise.then(
      (value) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        console.error(`[${label}] failed; continuing with available data.`, error)
        resolve(undefined)
      },
    )
  })
}

function DataBootstrap({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [dataRevision, setDataRevision] = useState(0)
  const [bootstrapRevision, setBootstrapRevision] = useState(0)

  const scope = user?.id ? `user:${user.id}` : 'public'
  const bootstrapKey = `workspace-bootstrap:${user?.role ?? 'guest'}`
  const hasWarmBootstrap = Boolean(user?.id && readCachedQuery<boolean>(bootstrapKey, scope) === true)
  const shouldShowPortalSkeleton = !isLoading && isAuthenticated && Boolean(user?.id) && !hasWarmBootstrap

  useEffect(() => {
    let active = true
    let backgroundTimer: number | undefined
    let patientDataChanged = false

    if (isLoading || !isAuthenticated || !user?.id) return () => { active = false }

    const currentScope = `user:${user.id}`
    const currentBootstrapKey = `workspace-bootstrap:${user.role}`
    const hadWarmBootstrap = readCachedQuery<boolean>(currentBootstrapKey, currentScope) === true

    const bootstrap = cachedQuery(
      currentBootstrapKey,
      async () => {
        const essentialLoads: Promise<unknown>[] = [
          loadBranchesFromSupabase({ strict: false }),
          loadProviderFoundationFromSupabase({ strict: false }),
          loadPatientsFromSupabase({ strict: false }),
          loadServicesFromSupabase({ strict: false }),
        ]

        if (user.role === 'patient') {
          if (!hadWarmBootstrap) clearPatientPortalCaches()
          const before = patientPortalSnapshot()
          essentialLoads.push(
            hydratePatientPortalFromDatabase().finally(() => {
              patientDataChanged = before !== patientPortalSnapshot()
            }),
          )
        }

        // Never allow a slow or hanging Supabase request to trap the whole app
        // behind the portal skeleton. Individual pages retain their own loaders
        // while any late data finishes hydrating.
        await settleWithin(
          Promise.allSettled(essentialLoads).then(() => undefined),
          BOOTSTRAP_TIMEOUT_MS,
          'workspace bootstrap',
        )
        return true
      },
      {
        ...(user.role === 'patient' ? queryCachePolicy.frequent : queryCachePolicy.moderate),
        tags: ['workspace-bootstrap', 'branches', 'providers', 'patients', 'services', user.role === 'patient' ? 'patient-portal' : 'internal-portal'],
        scope: currentScope,
      },
    )

    void bootstrap.finally(() => {
      if (!active) return
      setBootstrapRevision((value) => value + 1)

      if (user.role === 'patient') {
        if (patientDataChanged) setDataRevision((value) => value + 1)
        return
      }

      // Full operational synchronization is intentionally non-blocking. The
      // sync touches many tables sequentially, so it must never control whether
      // the application shell is allowed to render.
      backgroundTimer = window.setTimeout(() => {
        void cachedQuery(
          'internal-background-sync',
          async () => {
            await settleWithin(
              syncSupabaseToLocalStorage(),
              BACKGROUND_SYNC_TIMEOUT_MS,
              'internal background sync',
            )
            if (active) setDataRevision((value) => value + 1)
            return true
          },
          { ...queryCachePolicy.frequent, tags: ['internal-sync'], scope: currentScope, force: !hadWarmBootstrap },
        ).catch((error) => {
          console.error('[background clinic sync failed]', error)
        })
      }, 0)
    })

    return () => {
      active = false
      if (backgroundTimer !== undefined) window.clearTimeout(backgroundTimer)
    }
  }, [isAuthenticated, isLoading, user?.id, user?.role])

  void bootstrapRevision

  if (shouldShowPortalSkeleton) {
    return (
      <PortalSkeleton
        variant={user?.role === 'patient' ? 'patient' : 'internal'}
        message={user?.role === 'patient' ? 'Loading your patient portal' : 'Loading clinic workspace'}
      />
    )
  }

  return <Fragment key={`${user?.id ?? 'public'}:${dataRevision}`}>{children}</Fragment>
}

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <WorkspaceAccountIsolationGuard />
        <DataBootstrap>
          <ModalAccessibilityManager />
          <AdaptivePaginationEnhancer />
          <AppointmentJourneyAvatarEnhancer />
          <ExpenseTrendEnhancer />
          <InternalUiActionsEnhancerV116 />
          <InventoryBranchScopeEnhancerV118 />
          <OfflineStatusBanner />
          <PersistenceStatusNotice />
          <PatientDocumentLinkInterceptor />
          <AppRouter />
        </DataBootstrap>
      </AuthProvider>
    </AppErrorBoundary>
  )
}

export default App