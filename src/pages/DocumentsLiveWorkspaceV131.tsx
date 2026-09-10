import { useEffect, useState } from 'react'
import { Skeleton, SkeletonCard, SkeletonList } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { useBranchContext } from '../features/branches/BranchContext'
import { loadPatientsFromSupabase } from '../features/patients/patientPersistence'
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

      <div className="doc177-skeleton-workspace" aria-hidden="true">
        <aside className="doc177-skeleton-directory">
          <div className="doc177-skeleton-directory-heading">
            <div><Skeleton width={94} height={10} radius={999} /><Skeleton width={78} height={15} radius={6} /></div>
            <Skeleton width={18} height={18} radius={6} />
          </div>
          <Skeleton width="100%" height={42} radius={8} />
          <SkeletonList items={6} withAvatar className="doc177-skeleton-directory-list" />
        </aside>

        <main className="doc177-skeleton-main">
          <section className="doc177-skeleton-patient">
            <div><Skeleton width={48} height={48} radius={999} /><span><Skeleton width={88} height={9} radius={999} /><Skeleton width={180} height={22} radius={7} /><Skeleton width={230} height={10} radius={999} /></span></div>
            <span><Skeleton width={38} height={25} radius={7} /><Skeleton width={112} height={10} radius={999} /></span>
          </section>
          <section className="doc177-skeleton-patient-toolbar">
            <Skeleton width="100%" height={40} radius={8} />
            <Skeleton width="100%" height={40} radius={8} />
            <Skeleton width="100%" height={40} radius={8} />
            <Skeleton width="100%" height={40} radius={8} />
          </section>
          <section className="doc177-skeleton-patient-library">
            <div><Skeleton width={104} height={10} radius={999} /><Skeleton width={86} height={22} radius={7} /></div>
            <div className="doc177-skeleton-document-grid">
              {Array.from({ length: 4 }, (_, index) => <SkeletonCard key={index} className="doc177-skeleton-document-card"><SkeletonList items={2} withAvatar /></SkeletonCard>)}
            </div>
          </section>
        </main>
      </div>
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
      setState('loading')
      setError(null)
      try {
        await loadPatientsFromSupabase({ strict: true })
      } catch (cause) {
        if (!alive) return
        setError(`Unable to prepare the patient document workspace: ${cause instanceof Error ? cause.message : 'Patient records could not be loaded.'}`)
        setState('error')
        return
      }

      if (!alive) return
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
