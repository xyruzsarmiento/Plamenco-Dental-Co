import { useEffect } from 'react'
import { AppRouter } from './app/AppRouter'
import { AuthProvider } from './features/auth/AuthProvider'
import { OfflineStatusBanner } from './features/patientPortal/OfflineStatusBanner'
import { syncSupabaseToLocalStorage } from './lib/supabaseSync'

function App() {
  useEffect(() => {
    void syncSupabaseToLocalStorage()
  }, [])

  return (
    <AuthProvider>
      <OfflineStatusBanner />
      <AppRouter />
    </AuthProvider>
  )
}

export default App
