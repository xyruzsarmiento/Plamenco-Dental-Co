import { Skeleton, SkeletonCard, SkeletonList, SkeletonText } from './DesignSystem'

type ClinicalWorkspaceSkeletonProps = {
  variant?: 'directory' | 'dashboard'
  label?: string
}

export function ClinicalWorkspaceSkeleton({
  variant = 'directory',
  label = 'Loading clinical workspace',
}: ClinicalWorkspaceSkeletonProps) {
  const metricCount = variant === 'dashboard' ? 5 : 4

  return (
    <section className={`clinical-loading-shell is-${variant}`} aria-busy="true" aria-label={label}>
      <header className="clinical-loading-hero">
        <div className="clinical-loading-title">
          <Skeleton width={44} height={44} radius={10} />
          <div>
            <Skeleton width={132} height={10} radius={999} />
            <Skeleton width="min(330px, 68vw)" height={32} radius={9} />
            <Skeleton width="min(620px, 82vw)" height={13} radius={999} />
          </div>
        </div>
        <Skeleton width={142} height={42} radius={10} />
      </header>

      <div className="clinical-loading-metrics" aria-hidden="true">
        {Array.from({ length: metricCount }, (_, index) => (
          <SkeletonCard key={index} compact>
            <div className="clinical-loading-metric">
              <Skeleton width={38} height={38} radius={10} />
              <SkeletonText lines={3} widths={['62%', '34%', '78%']} />
            </div>
          </SkeletonCard>
        ))}
      </div>

      {variant === 'dashboard' ? (
        <>
          <div className="clinical-loading-dashboard-grid">
            <SkeletonCard className="clinical-loading-chart">
              <Skeleton width={150} height={11} radius={999} />
              <Skeleton width="42%" height={24} radius={8} />
              <div className="clinical-loading-chart-bars">
                {[42, 68, 51, 82, 60, 88, 72].map((height, index) => (
                  <Skeleton key={index} width="100%" height={`${height}%`} radius="8px 8px 3px 3px" />
                ))}
              </div>
            </SkeletonCard>
            <SkeletonCard className="clinical-loading-flow">
              <Skeleton width={128} height={11} radius={999} />
              <Skeleton width="58%" height={24} radius={8} />
              <SkeletonList items={4} withAvatar={false} />
            </SkeletonCard>
          </div>
          <SkeletonCard className="clinical-loading-wide-list">
            <Skeleton width={152} height={11} radius={999} />
            <Skeleton width="34%" height={24} radius={8} />
            <SkeletonList items={4} withAvatar />
          </SkeletonCard>
        </>
      ) : (
        <div className="clinical-loading-directory-grid">
          <aside className="clinical-loading-rail">
            <div className="clinical-loading-rail-head"><SkeletonText lines={2} widths={['54%', '72%']} /><Skeleton width={20} height={20} radius={7} /></div>
            <Skeleton width="100%" height={42} radius={10} />
            <SkeletonList items={6} withAvatar />
          </aside>
          <main className="clinical-loading-main">
            <SkeletonCard className="clinical-loading-patient">
              <div className="clinical-loading-patient-copy"><Skeleton width={52} height={52} radius={13} /><SkeletonText lines={3} widths={['34%', '52%', '70%']} /></div>
              <Skeleton width={82} height={25} radius={999} />
            </SkeletonCard>
            <div className="clinical-loading-content-grid">
              <SkeletonCard><Skeleton width="36%" height={12} radius={999} /><Skeleton width="62%" height={24} radius={8} /><SkeletonText lines={4} /></SkeletonCard>
              <SkeletonCard><Skeleton width="42%" height={12} radius={999} /><Skeleton width="56%" height={24} radius={8} /><SkeletonList items={3} withAvatar={false} /></SkeletonCard>
            </div>
          </main>
        </div>
      )}
    </section>
  )
}
