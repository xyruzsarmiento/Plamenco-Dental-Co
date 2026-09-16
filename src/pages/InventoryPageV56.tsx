import { useEffect, useRef, useState } from 'react'
import { useBranchContext } from '../features/branches/BranchContext'
import { refreshInventoryOperationalCaches } from '../features/inventory/inventoryPersistence'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import '../styles/inventory-modal-centering-v224.css'
import { InventoryPageSimpleV232 } from './InventoryPageSimpleV232'

type DatabaseGateState = 'loading' | 'ready' | 'error'

export function InventoryPageV56() {
  const [, setRevision] = useState(0)
  const [databaseState, setDatabaseState] = useState<DatabaseGateState>(isSupabaseConfigured ? 'loading' : 'error')
  const [databaseError, setDatabaseError] = useState(isSupabaseConfigured ? '' : 'Supabase is not configured for this clinic workspace.')
  const hydrateRequestRef = useRef(0)
  const {
    activeBranchId,
    authorizedBranchIds,
    isAllBranchesMode,
    isLoading: branchLoading,
  } = useBranchContext()

  const scopeKey = `${isAllBranchesMode ? 'all' : activeBranchId ?? 'none'}:${authorizedBranchIds.join(',')}`

  async function hydrateFromDatabase() {
    if (branchLoading) return false
    if (!isSupabaseConfigured || !supabase) {
      setDatabaseState('error')
      setDatabaseError('Supabase is required for Inventory. Local browser storage is not used as the source of truth.')
      return false
    }

    if (!isAllBranchesMode && !activeBranchId) {
      setDatabaseState('ready')
      setDatabaseError('')
      return true
    }

    const requestId = ++hydrateRequestRef.current
    setDatabaseState('loading')
    setDatabaseError('')

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!sessionData.session) throw new Error('Your database session is not ready. Please sign in again if this persists.')

      await refreshInventoryOperationalCaches({
        branchIds: isAllBranchesMode ? undefined : activeBranchId ? [activeBranchId] : undefined,
      })

      if (hydrateRequestRef.current !== requestId) return false
      setDatabaseState('ready')
      return true
    } catch (cause) {
      if (hydrateRequestRef.current !== requestId) return false
      setDatabaseState('error')
      setDatabaseError(cause instanceof Error ? cause.message : 'Inventory could not be loaded from Supabase.')
      return false
    }
  }

  useEffect(() => {
    if (!branchLoading) void hydrateFromDatabase()
  }, [branchLoading, scopeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const refresh = () => {
      void hydrateFromDatabase().then((loaded) => {
        if (loaded) setRevision((value) => value + 1)
      })
    }
    window.addEventListener('plamenco-inventory-updated', refresh)
    return () => window.removeEventListener('plamenco-inventory-updated', refresh)
  }, [branchLoading, scopeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (branchLoading || databaseState === 'loading') {
    return <section className="inv224-database-gate" aria-busy="true"><div><strong>Loading inventory from Supabase…</strong><span>Verifying the authenticated database session and loading the latest clinic inventory.</span></div></section>
  }

  if (databaseState === 'error') {
    return <section className="inv224-database-gate" role="alert"><div><strong>Inventory database unavailable</strong><span>{databaseError}</span><button className="btn btn-primary" type="button" onClick={() => void hydrateFromDatabase()}>Retry database load</button></div></section>
  }

  const refreshWorkspace = () => {
    void hydrateFromDatabase().then((loaded) => {
      if (loaded) setRevision((value) => value + 1)
    })
  }

  return <InventoryPageSimpleV232 onInventoryChanged={refreshWorkspace} />
}
