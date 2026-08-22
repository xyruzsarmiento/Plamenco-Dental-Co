import { useEffect, useState } from 'react'
import { AppRouter } from './app/AppRouter'
import { AuthProvider } from './features/auth/AuthProvider'
import { useAuth } from './features/auth/AuthContext'
import { OfflineStatusBanner } from './features/patientPortal/OfflineStatusBanner'
import { ModalAccessibilityManager } from './components/ui/ModalAccessibilityManager'
import { syncSupabaseToLocalStorage } from './lib/supabaseSync'
import { loadBranchesFromSupabase } from './features/branches/branchStore'
import { loadProviderFoundationFromSupabase } from './features/dentists/dentistStore'
import { loadPatientsFromSupabase } from './features/patients/patientPersistence'
import { loadServicesFromSupabase } from './features/services/serviceStore'

function DataBootstrap({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true

    if (isLoading) return () => { active = false }
    if (!isAuthenticated) {
      setReady(true)
      return () => { active = false }
    }

    setReady(false)
    void Promise.allSettled([
      syncSupabaseToLocalStorage(),
      loadBranchesFromSupabase({ strict: true }),
      loadProviderFoundationFromSupabase({ strict: true }),
      loadPatientsFromSupabase({ strict: true }),
      loadServicesFromSupabase({ strict: true }),
    ]).finally(() => {
      if (active) setReady(true)
    })

    return () => { active = false }
  }, [isAuthenticated, isLoading])

  if (isLoading || !ready) return null
  return <>{children}</>
}

function App() {
  return (
    <AuthProvider>
      <DataBootstrap>
        <ModalAccessibilityManager />
        <OfflineStatusBanner />
        <AppRouter />
      </DataBootstrap>
    </AuthProvider>
  )
}

export default App
