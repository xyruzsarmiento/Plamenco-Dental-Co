import { useEffect, useState } from 'react'
import { Skeleton, SkeletonCard, SkeletonList } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { useBranchContext } from '../features/branches/BranchContext'
import { mapSupabasePatientRow, saveStoredPatients } from '../features/patients/patientStore'
import { supabase } from '../lib/supabase'
import { DocumentsBranchWorkspaceV127 } from './DocumentsBranchWorkspaceV127'

function DocumentsWorkspaceSkeleton() {
  return (
    <section className="doc177-skeleton" aria-busy="true" aria-label="Loading document workspace">
      <header className="doc177-skeleton-hero">
        <div className="doc177-skeleton-copy">
          <Skeleton width={82} height={10} radius={999} />
          <Skeleton width="min(320px, 72vw)" height={32} radius={10} />
          <Skeleton width="min(470px, 86vw)" height={13} radius={999} />
        </div>
        <div className="doc177-skeleton-actions">
          <Skeleton width={150} height={36} radius={999} />
          <Skeleton width={148} height={40} radius={11} />
        </div>
      </header>

      <section className="doc177-skeleton-summary" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} compact className="doc177-skeleton-metric">
            <div className="doc177-skeleton-metric-inner">
              <Skeleton width={38} height={38} radius={11} />
              <div>
                <Skeleton width={index % 2 ? 116 : 82} height={10} radius={999} />
                <Skeleton width={46} height={24} radius={8} />
              </div>
            </div>
          </SkeletonCard>
        ))}
      </section>

      <section className="doc177-skeleton-toolbar" aria-hidden="true">
        <Skeleton className="doc177-skeleton-search" width="100%" height={42} radius={11} />
        <Skeleton width="100%" height={42} radius={11} />
        <Skeleton width="100%" height={42} radius={11} />
        <Skeleton width="100%" height={42} radius={11} />
        <Skeleton width="100%" height={42} radius={11} />
      </section>

      <section className="doc177-skeleton-library">
        <header>
          <div>
            <Skeleton width={96} height={10} radius={999} />
            <Skeleton width={110} height={24} radius={9} />
          </div>
        </header>
        <SkeletonList items={6} withAvatar className="doc177-skeleton-list" />
      </section>
    </section>
  )
}

export function DocumentsLiveWorkspaceV131() {
  const { user } = useAuth()
  const { activeBranchId, isAllBranchesMode } = useBranchContext()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let alive = true

    async function hydratePatients() {
      if (!supabase) {
        if (alive) setState('ready')
        return
      }

      setState('loading')
      setError(null)
      const { data, error: queryError } = await supabase
        .from('patients')
        .select('*')
        .eq('status', 'active')
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })

      if (!alive) return
      if (queryError) {
        setError(`Unable to prepare the patient document workspace: ${queryError.message}`)
        setState('error')
        return
      }

      saveStoredPatients((data ?? []).map((row) => mapSupabasePatientRow(row as Record<string, any>)))
      setRevision((value) => value + 1)
      setState('ready')
    }

    void hydratePatients()
    return () => { alive = false }
  }, [activeBranchId, isAllBranchesMode, user?.id])

  if (state === 'loading') return <DocumentsWorkspaceSkeleton />

  if (state === 'error') {
    return <section className="doc127-page"><div className="doc127-error" role="alert">{error}</div></section>
  }

  return <DocumentsBranchWorkspaceV127 key={`documents-live:${user?.id ?? 'guest'}:${activeBranchId ?? 'all'}:${revision}`} />
}
