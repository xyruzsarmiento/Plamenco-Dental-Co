import '../styles/patient-portal-premium-v94.css'
import '../styles/patient-portal-premium-v97.css'
import '../styles/patient-portal-premium-v98.css'
import '../styles/patient-portal-premium-v99.css'
import '../styles/patient-portal-premium-v100.css'
import '../styles/patient-portal-premium-v101.css'
import '../styles/patient-portal-premium-v102.css'
import '../styles/patient-portal-premium-v103.css'
import '../styles/portal-shell-premium-v1.css'
import '../styles/patient-dashboard-premium-v2.css'
import '../styles/patient-booking-appointments-v3.css'
import '../styles/patient-clinical-care-v4.css'
import '../styles/patient-recalls-v5.css'
import '../styles/patient-payments-v6.css'
import '../styles/patient-documents-v7.css'
import '../styles/patient-consistency-v9.css'
import { PatientPortalInteractionEnhancements } from '../features/patientPortal/PatientPortalInteractionEnhancements'
import { PatientPortalLiveEnhancements } from '../features/patientPortal/PatientPortalLiveEnhancements'
import { PatientPortalSemanticStatusEnhancer } from '../features/patientPortal/PatientPortalSemanticStatusEnhancer'
import { PatientPortalPage as PatientPortalPageV3 } from './PatientPortalPageV3'

export function PatientPortalPage() {
  return (
    <>
      <PatientPortalPageV3 />
      <PatientPortalInteractionEnhancements />
      <PatientPortalLiveEnhancements />
      <PatientPortalSemanticStatusEnhancer />
    </>
  )
}
