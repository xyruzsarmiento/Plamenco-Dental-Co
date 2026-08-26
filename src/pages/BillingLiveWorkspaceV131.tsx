import { useEffect, useState } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { hydrateBranchBillingFromDatabase } from '../features/billing/billingHydration'
import { useBranchContext } from '../features/branches/BranchContext'
import { BillingBranchWorkspaceV123 } from './BillingBranchWorkspaceV123'

export function BillingLiveWorkspaceV131() {
  const { user } = useAuth()
  const { activeBranchId, isAllBranchesMode } = useBranchContext()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(isAllBranchesMode ? 'ready' : 'loading')
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let alive = true

    async function hydrate() {
      if (isAllBranchesMode || !activeBranchId) {
        if (alive) setState('ready')
        return
      }

      setState('loading')
      setError(null)
      try {
        await hydrateBranchBillingFromDatabase(activeBranchId)
        if (!alive) return
        setRevision((value) => value + 1)
        setState('ready')
      } catch (cause) {
        if (!alive) return
        setError(cause instanceof Error ? cause.message : 'Unable to load live billing data.')
        setState('error')
      }
    }

    void hydrate()

    const onMutation = (event: Event) => {
      const detail = (event as CustomEvent<{ branchId?: string }>).detail
      if (!activeBranchId || (detail?.branchId && detail.branchId !== activeBranchId)) return
      void hydrate()
    }
    window.addEventListener('plamenco:billing-mutated', onMutation)

    return () => {
      alive = false
      window.removeEventListener('plamenco:billing-mutated', onMutation)
    }
  }, [activeBranchId, isAllBranchesMode, user?.id])

  if (state === 'loading') {
    return <section className="bill123-page"><div className="bill123-empty" role="status"><h3>Loading live billing</h3><p>Refreshing invoices, payments and unbilled charges from the clinic database.</p></div></section>
  }

  if (state === 'error') {
    return <section className="bill123-page"><div className="inline-alert" role="alert">{error}</div></section>
  }

  return <BillingBranchWorkspaceV123 key={`billing-live:${user?.id ?? 'guest'}:${activeBranchId ?? 'all'}:${revision}`} />
}
