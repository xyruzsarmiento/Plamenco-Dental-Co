import { useEffect } from 'react'
import { AppRouter } from './app/AppRouter'
import { AuthProvider } from './features/auth/AuthProvider'
import { OfflineStatusBanner } from './features/patientPortal/OfflineStatusBanner'
import { ModalAccessibilityManager } from './components/ui/ModalAccessibilityManager'
import { syncSupabaseToLocalStorage } from './lib/supabaseSync'

function App() {
  useEffect(() => {
    void syncSupabaseToLocalStorage()
  }, [])

  return (
    <AuthProvider>
      <ModalAccessibilityManager />
      <OfflineStatusBanner />
      <AppRouter />
    </AuthProvider>
  )
}

export default App
