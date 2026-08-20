import { useEffect, useState } from 'react'
import { loadBranchesFromSupabase } from '../branches/branchStore'
import { loadProviderFoundationFromSupabase } from '../dentists/dentistStore'
import { loadServicesFromSupabase } from '../services/serviceStore'
import { PatientPortalPage } from '../../pages/PatientPortalPage'

type BootstrapState = 'loading' | 'ready'

export function PatientPortalRoute() {
  const [state, setState] = useState<BootstrapState>('loading')

  useEffect(() => {
    let isMounted = true

    const loadBookingFoundation = async () => {
      // Booking data is supplemental to the patient portal. A missing provider,
      // schedule, service, or branch must never prevent an authenticated patient
      // from opening records, billing, documents, profile, or appointment history.
      await Promise.allSettled([
        loadBranchesFromSupabase({ strict: false }),
        loadServicesFromSupabase({ strict: false }),
        loadProviderFoundationFromSupabase({ strict: false }),
      ])

      if (isMounted) setState('ready')
    }

    void loadBookingFoundation()

    return () => {
      isMounted = false
    }
  }, [])

  if (state === 'loading') {
    return <div className="portal-empty">Preparing your patient portal...</div>
  }

  return <PatientPortalPage />
}
