import { useEffect, useState } from 'react'
import { PortalSkeleton } from '../../components/ui/DesignSystem'
import { PatientPortalPage } from '../../pages/PatientPortalPage'
import { hydratePatientBookingFoundation } from './bookingFoundationHydration'
import { hydratePatientPortalFromDatabase } from './patientPortalHydration'

type BootstrapState = 'loading' | 'ready' | 'error'

let patientPortalBootstrapPromise: Promise<void> | null = null

function refreshPatientPortal() {
  if (patientPortalBootstrapPromise) return patientPortalBootstrapPromise
  patientPortalBootstrapPromise = Promise.all([
    hydratePatientBookingFoundation(),
    hydratePatientPortalFromDatabase(),
  ]).then(() => undefined).finally(() => {
    patientPortalBootstrapPromise = null
  })
  return patientPortalBootstrapPromise
}

export function PatientPortalRoute() {
  const [state, setState] = useState<BootstrapState>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    setState('loading')
    setError(null)

    void refreshPatientPortal()
      .then(() => { if (isMounted) setState('ready') })
      .catch((cause) => {
        if (!isMounted) return
        setError(cause instanceof Error ? cause.message : 'Unable to refresh appointment availability.')
        setState('error')
      })

    return () => { isMounted = false }
  }, [])

  if (state === 'loading') return <PortalSkeleton variant="patient" message="Loading your latest care information" />
  if (state === 'error') return <main className="auth-page"><section className="auth-card"><h2>Patient portal unavailable</h2><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></section></main>
  return <PatientPortalPage />
}
