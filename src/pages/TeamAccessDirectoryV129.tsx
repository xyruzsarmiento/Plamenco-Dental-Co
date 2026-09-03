import { Skeleton, SkeletonList, SkeletonText } from '../components/ui/DesignSystem'
import { PageScaffold } from '../components/ui/PageScaffold'
import { loadInternalAccountsFromProfiles } from '../features/auth/staffStore'
import { useEffect, useState } from 'react'
import { TeamAccessPageV26 } from './TeamAccessPageV26'
import '../styles/team-access-page-skeleton-v180.css'

const TEAM_ACCESS_LOAD_TIMEOUT_MS = 10_000

function TeamAccessPageSkeleton() {
  return (
    <PageScaffold title="Team & Access" description="Manage clinic accounts, roles, workforce visibility, providers and compensation.">
      <div className="team-access-skeleton-v180" role="status" aria-live="polite" aria-busy="true" aria-label="Loading Team and Access">
        <section className="team-access-skeleton-v180-hero">
          <div>
            <Skeleton width={110} height={10} radius={999} />
            <Skeleton width="min(420px, 76%)" height={30} radius={10} />
            <SkeletonText lines={2} widths={['min(620px, 94%)', 'min(460px, 72%)']} />
          </div>
          <div className="team-access-skeleton-v180-actions">
            <Skeleton width={118} height={36} radius={999} />
            <Skeleton width={154} height={40} radius={11} />
          </div>
        </section>

        <section className="team-access-skeleton-v180-trust">
          <Skeleton width={34} height={34} radius={10} />
          <SkeletonText lines={2} widths={['210px', 'min(680px, 90%)']} />
        </section>

        <section className="team-access-skeleton-v180-metrics" aria-label="Loading team metrics">
          {Array.from({ length: 6 }, (_, index) => (
            <article key={index}>
              <Skeleton width={34} height={34} radius={10} />
              <Skeleton width="48%" height={10} radius={999} />
              <Skeleton width="34%" height={25} radius={9} />
              <Skeleton width="70%" height={9} radius={999} />
            </article>
          ))}
        </section>

        <section className="team-access-skeleton-v180-summary">
          {Array.from({ length: 5 }, (_, index) => (
            <article key={index}>
              <Skeleton width={30} height={30} radius={9} />
              <div>
                <Skeleton width="62%" height={9} radius={999} />
                <Skeleton width="38%" height={19} radius={8} />
              </div>
            </article>
          ))}
        </section>

        <section className="team-access-skeleton-v180-controls">
          <Skeleton width="100%" height={42} radius={11} />
          <Skeleton width="100%" height={42} radius={11} />
          <Skeleton width="100%" height={42} radius={11} />
          <Skeleton width="100%" height={42} radius={11} />
        </section>

        <section className="team-access-skeleton-v180-directory">
          <header>
            <div>
              <Skeleton width={110} height={9} radius={999} />
              <Skeleton width={180} height={22} radius={9} />
              <Skeleton width="min(480px, 82%)" height={10} radius={999} />
            </div>
            <Skeleton width={156} height={26} radius={999} />
          </header>
          <SkeletonList items={6} className="team-access-skeleton-v180-list" />
        </section>
      </div>
    </PageScaffold>
  )
}

function loadWithinTimeout() {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error('Team & Access took too long to refresh. Showing the last available account data.')),
      TEAM_ACCESS_LOAD_TIMEOUT_MS,
    )
  })

  return Promise.race([loadInternalAccountsFromProfiles({ strict: true }), timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  })
}

export function TeamAccessDirectoryV129() {
  const [ready, setReady] = useState(false)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void loadWithinTimeout()
      .then(() => {
        if (!active) return
        setRevision((value) => value + 1)
        setReady(true)
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'Unable to load internal accounts.')
        setReady(true)
      })
    return () => { active = false }
  }, [])

  if (!ready) return <TeamAccessPageSkeleton />

  return (
    <>
      {error && <div className="inline-alert warning">{error}</div>}
      <TeamAccessPageV26 key={revision} />
    </>
  )
}
