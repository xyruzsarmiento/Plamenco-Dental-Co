import { useEffect, useState } from 'react'
import { PortalSkeleton } from '../../components/ui/DesignSystem'
import { PatientPortalPage } from '../../pages/PatientPortalPage'
import { hydratePatientBookingFoundation } from './bookingFoundationHydration'

type BootstrapState = 'loading' | 'ready' | 'error'

let bookingFoundationPromise: Promise<void> | null = null

function refreshBookingFoundation() {
  if (bookingFoundationPromise) return bookingFoundationPromise
  bookingFoundationPromise = hydratePatientBookingFoundation().finally(() => {
    bookingFoundationPromise = null
  })
  return bookingFoundationPromise
}

export function PatientPortalRoute() {
  const [state, setState] = useState<BootstrapState>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    setState('loading')
    setError(null)

    void refreshBookingFoundation()
      .then(() => { if (isMounted) setState('ready') })
      .catch((cause) => {
        if (!isMounted) return
        setError(cause instanceof Error ? cause.message : 'Unable to refresh appointment availability.')
        setState('error')
      })

    return () => { isMounted = false }
  }, [])

  if (state === 'loading') return <PortalSkeleton variant="patient" message="Refreshing clinic schedules" />
  if (state === 'error') return <main className="auth-page"><section className="auth-card"><h2>Booking availability unavailable</h2><p>{error}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></section></main>
  return <PatientPortalPage />
}
