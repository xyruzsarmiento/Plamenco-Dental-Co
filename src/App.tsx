import { useEffect, useState } from 'react'
import { AppRouter } from './app/AppRouter'
import { AppErrorBoundary } from './components/system/AppErrorBoundary'
import { PersistenceStatusNotice } from './components/system/PersistenceStatusNotice'
import { ModalAccessibilityManager } from './components/ui/ModalAccessibilityManager'
import { useAuth } from './features/auth/AuthContext'
import { AuthProvider } from './features/auth/AuthProvider'
import { loadBranchesFromSupabase } from './features/branches/branchStore'
import { loadPatientVisibleDentalRecords } from './features/dentalRecords/patientVisibleDentalRecordPersistence'
import { loadProviderFoundationFromSupabase } from './features/dentists/dentistStore'
import { loadPatientsFromSupabase } from './features/patients/patientPersistence'
import { OfflineStatusBanner } from './features/patientPortal/OfflineStatusBanner'
import { loadServicesFromSupabase } from './features/services/serviceStore'
import { syncSupabaseToLocalStorage } from './lib/supabaseSync'

function DataBootstrap({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    let backgroundTimer: number | undefined

    if (isLoading) return () => { active = false }
    if (!isAuthenticated) {
      setReady(true)
      return () => { active = false }
    }

    setReady(false)

    const essentialLoads: Promise<unknown>[] = [
      loadBranchesFromSupabase({ strict: false }),
      loadProviderFoundationFromSupabase({ strict: false }),
      loadPatientsFromSupabase({ strict: false }),
      loadServicesFromSupabase({ strict: false }),
    ]

    // Patient sessions must never hydrate raw dental_records rows. The dedicated
    // RPC returns only finalized/amended patient-visible summaries and blanks
    // internal clinical fields before the portal renders.
    if (user?.role === 'patient') {
      essentialLoads.push(loadPatientVisibleDentalRecords())
    }

    void Promise.allSettled(essentialLoads).finally(() => {
      if (!active) return
      setReady(true)
      backgroundTimer = window.setTimeout(() => {
        void syncSupabaseToLocalStorage()
          .then(async () => {
            // Broad cache hydration cannot read raw clinical rows for patients
            // after the RLS hardening. Restore the sanitized cache after sync.
            if (user?.role === 'patient') {
              await loadPatientVisibleDentalRecords()
            }
          })
          .catch((error) => {
            console.error('[background clinic sync failed]', error)
          })
      }, 0)
    })

    return () => {
      active = false
      if (backgroundTimer !== undefined) window.clearTimeout(backgroundTimer)
    }
  }, [isAuthenticated, isLoading, user?.role])

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
  return <>{children}</>
}

function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <DataBootstrap>
          <ModalAccessibilityManager />
          <OfflineStatusBanner />
          <PersistenceStatusNotice />
          <AppRouter />
        </DataBootstrap>
      </AuthProvider>
    </AppErrorBoundary>
  )
}

export default App
