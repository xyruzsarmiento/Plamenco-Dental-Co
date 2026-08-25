import { Fragment, useEffect, useState } from 'react'
import { AppRouter } from './app/AppRouter'
import { AppErrorBoundary } from './components/system/AppErrorBoundary'
import { AdaptivePaginationEnhancer } from './components/system/AdaptivePaginationEnhancer'
import { PersistenceStatusNotice } from './components/system/PersistenceStatusNotice'
import { ModalAccessibilityManager } from './components/ui/ModalAccessibilityManager'
import { useAuth } from './features/auth/AuthContext'
import { AuthProvider } from './features/auth/AuthProvider'
import { loadBranchesFromSupabase } from './features/branches/branchStore'
import { loadProviderFoundationFromSupabase } from './features/dentists/dentistStore'
import { loadPatientsFromSupabase } from './features/patients/patientPersistence'
import { OfflineStatusBanner } from './features/patientPortal/OfflineStatusBanner'
import { PatientDocumentLinkInterceptor } from './features/patientPortal/PatientDocumentLinkInterceptor'
import { hydratePatientPortalFromDatabase } from './features/patientPortal/patientPortalHydration'
import { loadServicesFromSupabase } from './features/services/serviceStore'
import { cachedQuery, queryCachePolicy, readCachedQuery } from './lib/queryCache'
import { syncSupabaseToLocalStorage } from './lib/supabaseSync'
import './styles/adaptive-pagination.css'
import './styles/public-auth-responsive-part7.css'
import './styles/internal-appointments-refinement-v2.css'

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

function DataBootstrap({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [ready, setReady] = useState(false)
  const [dataRevision, setDataRevision] = useState(0)

  useEffect(() => {
    let active = true
    let backgroundTimer: number | undefined
    let patientDataChanged = false

    if (isLoading) return () => { active = false }
    if (!isAuthenticated || !user?.id) {
      setReady(true)
      return () => { active = false }
    }

    const scope = `user:${user.id}`
    const bootstrapKey = `workspace-bootstrap:${user.role}`
    const hasWarmBootstrap = readCachedQuery<boolean>(bootstrapKey, scope) === true
    setReady(hasWarmBootstrap)

    const bootstrap = cachedQuery(
      bootstrapKey,
      async () => {
        const essentialLoads: Promise<unknown>[] = [
          loadBranchesFromSupabase({ strict: false }),
          loadProviderFoundationFromSupabase({ strict: false }),
          loadPatientsFromSupabase({ strict: false }),
          loadServicesFromSupabase({ strict: false }),
        ]

        if (user.role === 'patient') {
          if (!hasWarmBootstrap) clearPatientPortalCaches()
          const before = patientPortalSnapshot()
          essentialLoads.push(
            hydratePatientPortalFromDatabase().finally(() => {
              patientDataChanged = before !== patientPortalSnapshot()
            }),
          )
        }

        await Promise.allSettled(essentialLoads)
        return true
      },
      {
        ...(user.role === 'patient' ? queryCachePolicy.frequent : queryCachePolicy.moderate),
        tags: ['workspace-bootstrap', 'branches', 'providers', 'patients', 'services', user.role === 'patient' ? 'patient-portal' : 'internal-portal'],
        scope,
      },
    )

    void bootstrap.finally(() => {
      if (!active) return
      setReady(true)

      // Keep an already rendered patient workspace mounted when background
      // revalidation returns identical data. This avoids the visible mini-reload
      // users noticed after returning to the browser tab. Remount only when the
      // patient-scoped persisted snapshot actually changed.
      if (user.role === 'patient') {
        if (patientDataChanged) setDataRevision((value) => value + 1)
        return
      }

      backgroundTimer = window.setTimeout(() => {
        void cachedQuery(
          'internal-background-sync',
          async () => {
            await syncSupabaseToLocalStorage()
            return true
          },
          { ...queryCachePolicy.frequent, tags: ['internal-sync'], scope },
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

  if (isLoading || !ready) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', padding: 24 }}>
        <section style={{ display: 'grid', justifyItems: 'center', gap: 10, padding: '24px 28px', border: '1px solid #e2e8f0', borderRadius: 18, background: '#fff', boxShadow: '0 18px 52px rgba(15, 23, 42, .07)', textAlign: 'center' }}>
          <span style={{ width: 24, height: 24, border: '3px solid #dbeafe', borderTopColor: '#2563eb', borderRadius: '999px' }} />
          <strong style={{ color: '#0f172a', fontSize: 14 }}>Preparing clinic workspace</strong>
          <span style={{ color: '#64748b', fontSize: 12 }}>Loading essential clinic data.</span>
        </section>
      </main>
    )
  }

  return <Fragment key={`${user?.id ?? 'public'}:${dataRevision}`}>{children}</Fragment>
}

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <DataBootstrap>
          <ModalAccessibilityManager />
          <AdaptivePaginationEnhancer />
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
