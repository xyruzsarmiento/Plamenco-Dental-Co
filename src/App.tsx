import { AppRouter } from './app/AppRouter'
import { AuthProvider } from './features/auth/AuthProvider'
import { OfflineStatusBanner } from './features/patientPortal/OfflineStatusBanner'
import { ModalAccessibilityManager } from './components/ui/ModalAccessibilityManager'

function App() {
  return (
    <AuthProvider>
      <ModalAccessibilityManager />
      <OfflineStatusBanner />
      <AppRouter />
    </AuthProvider>
  )
}

export default App
