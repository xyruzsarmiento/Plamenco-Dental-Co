type TrendDatum = { label: string; value: number }
type BarDatum = { label: string; value: number }

type TrendChartProps = {
  title: string
  description?: string
  data: TrendDatum[]
  valueLabel?: string
}

type BarChartProps = {
  title: string
  description?: string
  data: BarDatum[]
}

function safeMax(values: number[]) {
  return Math.max(1, ...values.filter((value) => Number.isFinite(value)))
}

export function DashboardTrendChart({ title, description, data, valueLabel = 'appointments' }: TrendChartProps) {
  const width = 720
  const height = 240
  const paddingX = 26
  const paddingTop = 24
  const paddingBottom = 40
  const max = safeMax(data.map((item) => item.value))
  const usableWidth = width - paddingX * 2
  const usableHeight = height - paddingTop - paddingBottom
  const points = data.map((item, index) => {
    const x = data.length <= 1 ? width / 2 : paddingX + (usableWidth * index) / (data.length - 1)
    const y = paddingTop + usableHeight - (item.value / max) * usableHeight
    return { ...item, x, y }
  })
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
    : ''

  return (
    <section className="dashboard-chart-card">
      <div className="dashboard-chart-header">
        <div>
          <p className="eyebrow">Live activity</p>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {data.length ? (
        <div className="dashboard-chart-canvas">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}. ${data.map((item) => `${item.label}: ${item.value} ${valueLabel}`).join(', ')}`}>
            {[0, 1, 2, 3].map((line) => {
              const y = paddingTop + (usableHeight * line) / 3
              return <line key={line} x1={paddingX} x2={width - paddingX} y1={y} y2={y} className="dashboard-chart-gridline" />
            })}
            <path d={areaPath} className="dashboard-chart-area" />
            <path d={linePath} className="dashboard-chart-line" />
            {points.map((point) => (
              <g key={point.label}>
                <circle cx={point.x} cy={point.y} r="5" className="dashboard-chart-point" />
                <text x={point.x} y={height - 14} textAnchor="middle" className="dashboard-chart-label">{point.label}</text>
                <title>{`${point.label}: ${point.value} ${valueLabel}`}</title>
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <div className="dashboard-chart-empty">No activity is available for this period.</div>
      )}
    </section>
  )
}

export function DashboardBarChart({ title, description, data }: BarChartProps) {
  const max = safeMax(data.map((item) => item.value))

  return (
    <section className="dashboard-chart-card dashboard-bar-card">
      <div className="dashboard-chart-header">
        <div>
          <p className="eyebrow">Current distribution</p>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="dashboard-bar-list">
        {data.length ? data.map((item) => (
          <div key={item.label} className="dashboard-bar-row">
            <div className="dashboard-bar-meta"><span>{item.label}</span><strong>{item.value}</strong></div>
            <div className="dashboard-bar-track" aria-label={`${item.label}: ${item.value}`}>
              <span style={{ width: `${Math.max(item.value ? 5 : 0, (item.value / max) * 100)}%` }} />
            </div>
          </div>
        )) : <div className="dashboard-chart-empty">No current distribution data.</div>}
      </div>
    </section>
  )
}
