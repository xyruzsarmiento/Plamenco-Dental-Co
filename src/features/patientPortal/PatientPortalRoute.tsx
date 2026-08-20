import { useEffect, useState } from 'react'
import { loadBranchesFromSupabase } from '../branches/branchStore'
import { loadProviderFoundationFromSupabase } from '../dentists/dentistStore'
import { loadServicesFromSupabase } from '../services/serviceStore'
import { PatientPortalPage } from '../../pages/PatientPortalPage'

type BootstrapState = 'loading' | 'ready' | 'error'

export function PatientPortalRoute() {
  const [state, setState] = useState<BootstrapState>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const loadBookingFoundation = async () => {
      try {
        await Promise.all([
          loadBranchesFromSupabase(),
          loadServicesFromSupabase(),
          loadProviderFoundationFromSupabase(),
        ])

        if (isMounted) {
          setState('ready')
        }
      } catch (error) {
        if (!isMounted) return
        setErrorMessage(error instanceof Error ? error.message : 'Unable to prepare appointment availability.')
        setState('error')
      }
    }

    void loadBookingFoundation()

    return () => {
      isMounted = false
    }
  }, [])

  if (state === 'loading') {
    return <div className="portal-empty">Preparing your appointment availability...</div>
  }

  if (state === 'error') {
    return (
      <div className="portal-empty">
        {errorMessage || 'Appointment availability could not be loaded. Please refresh and try again.'}
      </div>
    )
  }

  return <PatientPortalPage />
}
