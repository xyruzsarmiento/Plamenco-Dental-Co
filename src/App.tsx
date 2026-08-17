import { useEffect } from 'react'
import { AppRouter } from './app/AppRouter'
import { AuthProvider } from './features/auth/AuthProvider'
import { syncSupabaseToLocalStorage } from './lib/supabaseSync'

function App() {
  useEffect(() => {
    void syncSupabaseToLocalStorage()
  }, [])

  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}

export default App
