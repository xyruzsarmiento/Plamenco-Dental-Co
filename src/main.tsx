import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/billing.css'
import './styles/treatments.css'
import './styles/release-polish.css'
import './styles/modal-fixes.css'
import './styles/payment-recorder.css'
import App from './App.tsx'
import { registerPatientPortalPwa } from './features/patientPortal/pwaRegistration'

registerPatientPortalPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
