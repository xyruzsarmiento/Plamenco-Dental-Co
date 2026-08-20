import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/billing.css'
import './styles/treatments.css'
import './styles/release-polish.css'
import './styles/modal-fixes.css'
import './styles/payment-recorder.css'
import './styles/inventory-actions.css'
import './styles/expense-actions.css'
import './styles/forms-consent-actions.css'
import './styles/design-system-47a.css'
import './styles/design-system-components-47a.css'
import './styles/auth-47c.css'
import './styles/patient-portal-47d.css'
import './styles/staff-portal-47e.css'
import './styles/dentist-portal-47f.css'
import './styles/admin-portal-47g.css'
import './styles/super-admin-portal-47h.css'
import './styles/final-polish-47i.css'
import './styles/corrective-redesign-48a.css'
import './styles/internal-portal-redesign-v2.css'
import './styles/patient-portal-redesign-v3.css'
import App from './App.tsx'
import { registerPatientPortalPwa } from './features/patientPortal/pwaRegistration'

registerPatientPortalPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
