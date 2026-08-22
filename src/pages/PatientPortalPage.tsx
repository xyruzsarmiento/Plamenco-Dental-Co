import '../styles/patient-portal-premium-v94.css'
import '../styles/patient-portal-premium-v97.css'
import '../styles/patient-portal-premium-v98.css'
import '../styles/patient-portal-premium-v99.css'
import { PatientPortalInteractionEnhancements } from '../features/patientPortal/PatientPortalInteractionEnhancements'
import { PatientPortalLiveEnhancements } from '../features/patientPortal/PatientPortalLiveEnhancements'
import { PatientPortalPage as PatientPortalPageV3 } from './PatientPortalPageV3'

export function PatientPortalPage() {
  return (
    <>
      <PatientPortalPageV3 />
      <PatientPortalInteractionEnhancements />
      <PatientPortalLiveEnhancements />
    </>
  )
}
