import { useEffect, useState } from 'react'
import { Skeleton, SkeletonCard, SkeletonList, SkeletonText } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { hydrateBranchBillingFromDatabase } from '../features/billing/billingHydration'
import { useBranchContext } from '../features/branches/BranchContext'
import { BillingBranchWorkspaceV123 } from './BillingBranchWorkspaceV123'

function BillingWorkspaceSkeleton() {
  return <section className="bill123-page bill123-skeleton" aria-busy="true" aria-label="Loading billing workspace">
    <SkeletonCard className="bill123-skeleton-hero"><Skeleton width={190} height={12}/><Skeleton width="44%" height={34} radius={12}/><SkeletonText lines={2} widths={['62%','48%']}/></SkeletonCard>
    <div className="bill123-skeleton-kpis">{Array.from({length:4},(_,index)=><SkeletonCard key={index} compact />)}</div>
    <SkeletonCard className="bill123-skeleton-command" compact><Skeleton width="100%" height={42} radius={14}/><Skeleton width="100%" height={42} radius={14}/></SkeletonCard>
    <SkeletonCard className="bill123-skeleton-table"><Skeleton width="26%" height={14}/><SkeletonList items={6} withAvatar /></SkeletonCard>
  </section>
}

export function BillingLiveWorkspaceV131() {
  const { user } = useAuth()
  const { activeBranchId, isAllBranchesMode } = useBranchContext()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)
  const scope = `${user?.id}:${isAllBranchesMode ? 'all' : activeBranchId}`
  const [loadedScope, setLoadedScope] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let alive = true

    async function hydrate() {
      if (!isAllBranchesMode && !activeBranchId) {
        setError('Select a branch to view billing records.')
        setState('error')
        return
      }

      setState('loading')
      setError(null)
      try {
        await hydrateBranchBillingFromDatabase(isAllBranchesMode ? undefined : activeBranchId ?? undefined)
        if (!alive) return
        setRevision((value) => value + 1)
        setState('ready')
        setLoadedScope(scope)
      } catch (cause) {
        if (!alive) return
        setError(cause instanceof Error ? cause.message : 'Unable to load live billing data.')
        setState('error')
      }
    }

    void hydrate()

    const onMutation = (event: Event) => {
      const detail = (event as CustomEvent<{ branchId?: string }>).detail
      if (!isAllBranchesMode && detail?.branchId && detail.branchId !== activeBranchId) return
      void hydrate()
    }
    window.addEventListener('plamenco:billing-mutated', onMutation)

    return () => {
      alive = false
      window.removeEventListener('plamenco:billing-mutated', onMutation)
    }
  }, [activeBranchId, isAllBranchesMode, user?.id, retry, scope])

  if (state !== 'error' && (state === 'loading' || loadedScope !== scope)) {
    return <BillingWorkspaceSkeleton />
  }

  if (state === 'error') {
    return <section className="bill123-page"><div className="inline-alert" role="alert">{error}</div><button type="button" className="btn" onClick={() => setRetry((value) => value + 1)}>Retry loading</button></section>
  }

  return <BillingBranchWorkspaceV123 key={`billing-live:${user?.id ?? 'guest'}:${activeBranchId ?? 'all'}:${revision}`} />
}
