import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useBranchContext } from '../features/branches/BranchContext'
import { hydrateBranchBillingFromDatabase } from '../features/billing/billingHydration'
import { BillingBranchWorkspaceV123 } from './BillingBranchWorkspaceV123'

export function BillingLiveWorkspaceV130() {
  const { activeBranchId, activeBranch, isLoading: branchLoading, hasBranchAccess } = useBranchContext()
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (branchLoading) return () => { active = false }
    if (!activeBranchId) {
      setLoading(false)
      setError(hasBranchAccess ? 'Choose a branch workspace to view billing.' : 'No branch access is assigned to this account.')
      return () => { active = false }
    }

    setLoading(true)
    setError(null)
    void hydrateBranchBillingFromDatabase(activeBranchId)
      .then(() => {
        if (!active) return
        setRevision((value) => value + 1)
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Unable to load branch billing.')
      })
      .finally(() => { if (active) setLoading(false) })

    return () => { active = false }
  }, [activeBranchId, branchLoading, hasBranchAccess])

  if (branchLoading || loading) {
    return <section className="panel" role="status"><RefreshCw size={20}/><h3>Loading live billing</h3><p>Refreshing invoices, payments, receipts and refunds for {activeBranch?.name ?? 'your branch'}.</p></section>
  }

  if (error) return <section className="panel"><h3>Billing data unavailable</h3><p>{error}</p></section>
  return <BillingBranchWorkspaceV123 key={`${activeBranchId}:${revision}`} />
}
