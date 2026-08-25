import { useEffect, useState } from 'react'
import { PortalSkeleton } from '../../components/ui/DesignSystem'
import { loadBranchesFromSupabase } from '../branches/branchStore'
import { loadProviderFoundationFromSupabase } from '../dentists/dentistStore'
import { loadServicesFromSupabase } from '../services/serviceStore'
import { PatientPortalPage } from '../../pages/PatientPortalPage'

type BootstrapState = 'loading' | 'ready'

// Keep the non-patient-specific booking foundation warm for the lifetime of the SPA.
// If auth/session activity causes this route to mount again after a tab switch, the
// patient portal should not flash its full loading skeleton a second time.
let bookingFoundationReady = false
let bookingFoundationPromise: Promise<void> | null = null

function ensureBookingFoundation() {
  if (bookingFoundationReady) return Promise.resolve()
  if (bookingFoundationPromise) return bookingFoundationPromise

  bookingFoundationPromise = Promise.allSettled([
    loadBranchesFromSupabase({ strict: false }),
    loadServicesFromSupabase({ strict: false }),
    loadProviderFoundationFromSupabase({ strict: false }),
  ]).then(() => {
    bookingFoundationReady = true
  }).finally(() => {
    bookingFoundationPromise = null
  })

  return bookingFoundationPromise
}

export function PatientPortalRoute() {
  const [state, setState] = useState<BootstrapState>(bookingFoundationReady ? 'ready' : 'loading')

  useEffect(() => {
    let isMounted = true

    if (bookingFoundationReady) {
      setState('ready')
      return () => { isMounted = false }
    }

    void ensureBookingFoundation().finally(() => {
      if (isMounted) setState('ready')
    })

    return () => {
      isMounted = false
    }
  }, [])

  if (state === 'loading') {
    return <PortalSkeleton variant="patient" message="Preparing your patient portal" />
  }

  return <PatientPortalPage />
}
