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
import './styles/dentist-portal-card-parity-v131.css'

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
const BOOTSTRAP_WATCHDOG_MS = 10_000
const BACKGROUND_SYNC_TIMEOUT_MS = 20_000

type BootstrapPhase = 'idle' | 'loading' | 'ready'

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

function safeLoad(loader: () => Promise<unknown>) {
  return Promise.resolve().then(loader)
}

function DataBootstrap({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [dataRevision, setDataRevision] = useState(0)
  const [bootstrapPhase, setBootstrapPhase] = useState<BootstrapPhase>('idle')
  const [bootstrapIdentity, setBootstrapIdentity] = useState('')

  const identity = user?.id ? `${user.id}:${user.role}` : ''
  const scope = user?.id ? `user:${user.id}` : 'public'
  const bootstrapKey = `workspace-bootstrap:${user?.role ?? 'guest'}`
  const hasWarmBootstrap = Boolean(user?.id && readCachedQuery<boolean>(bootstrapKey, scope) === true)
  const identityIsCurrent = bootstrapIdentity === identity
  const shouldShowPortalSkeleton =
    !isLoading &&
    isAuthenticated &&
    Boolean(user?.id) &&
    !hasWarmBootstrap &&
    (!identityIsCurrent || bootstrapPhase !== 'ready')

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated || !user?.id) {
      setBootstrapPhase('idle')
      setBootstrapIdentity('')
      return
    }

    let cancelled = false
    const nextIdentity = `${user.id}:${user.role}`
    setBootstrapIdentity(nextIdentity)
    setBootstrapPhase('loading')

    const bootstrap = async () => {
      const commonLoaders = [
        safeLoad(() => loadBranchesFromSupabase()),
        safeLoad(() => loadProviderFoundationFromSupabase()),
        safeLoad(() => loadPatientsFromSupabase()),
        safeLoad(() => loadServicesFromSupabase()),
      ]

      if (user.role === 'patient') {
        clearPatientPortalCaches()
        const before = patientPortalSnapshot()
        await Promise.all(commonLoaders)
        await settleWithin(hydratePatientPortalFromDatabase(user.id), BOOTSTRAP_TIMEOUT_MS, 'patient portal bootstrap')
        const after = patientPortalSnapshot()
        if (!cancelled && before !== after) setDataRevision((value) => value + 1)
      } else {
        await Promise.all(commonLoaders)
        await settleWithin(syncSupabaseToLocalStorage(), BOOTSTRAP_TIMEOUT_MS, 'internal workspace bootstrap')
        if (!cancelled) setDataRevision((value) => value + 1)
      }

      if (!cancelled) {
        cachedQuery(bootstrapKey, async () => true, queryCachePolicy.medium, scope).catch(() => undefined)
        setBootstrapPhase('ready')
      }
    }

    void bootstrap()

    const watchdog = window.setTimeout(() => {
      if (!cancelled) setBootstrapPhase('ready')
    }, BOOTSTRAP_WATCHDOG_MS)

    return () => {
      cancelled = true
      window.clearTimeout(watchdog)
    }
  }, [bootstrapKey, isAuthenticated, isLoading, scope, user?.id, user?.role])

  useEffect(() => {
    if (!isAuthenticated || !user?.id || user.role === 'patient') return
    let cancelled = false
    const timer = window.setInterval(() => {
      void settleWithin(syncSupabaseToLocalStorage(), BACKGROUND_SYNC_TIMEOUT_MS, 'background clinic sync').then(() => {
        if (!cancelled) setDataRevision((value) => value + 1)
      })
    }, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isAuthenticated, user?.id, user?.role])

  if (shouldShowPortalSkeleton) return <PortalSkeleton />
  return <Fragment key={dataRevision}>{children}</Fragment>
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <OfflineStatusBanner />
        <WorkspaceAccountIsolationGuard>
          <DataBootstrap>
            <AppRouter />
            <PersistenceStatusNotice />
            <ModalAccessibilityManager />
            <AdaptivePaginationEnhancer />
            <AppointmentJourneyAvatarEnhancer />
            <ExpenseTrendEnhancer />
            <InternalUiActionsEnhancerV116 />
            <InventoryBranchScopeEnhancerV118 />
            <PatientDocumentLinkInterceptor />
          </DataBootstrap>
        </WorkspaceAccountIsolationGuard>
      </AuthProvider>
    </AppErrorBoundary>
  )
}
