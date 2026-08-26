import { useEffect, useState } from 'react'
import { loadInternalAccountsFromProfiles } from '../features/auth/staffStore'
import { TeamAccessPageV26 } from './TeamAccessPageV26'

export function TeamAccessDirectoryV129() {
  const [ready, setReady] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void loadInternalAccountsFromProfiles({ strict: true })
      .then(() => { if (active) { setRevision((value) => value + 1); setReady(true) } })
      .catch((cause) => { if (active) { setError(cause instanceof Error ? cause.message : 'Unable to load internal accounts.'); setReady(true) } })
    return () => { active = false }
  }, [])

  if (!ready) return <section className="panel" role="status"><h3>Loading Team & Access</h3><p>Refreshing authenticated Staff and Dentist accounts from the clinic database.</p></section>
  return <>{error && <div className="inline-alert warning">{error}</div>}<TeamAccessPageV26 key={revision}/></>
}
