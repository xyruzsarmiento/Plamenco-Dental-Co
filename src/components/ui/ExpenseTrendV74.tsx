import { useMemo, useState } from 'react'

type TrendRow = { label: string; value: number }
type Props = { rows: TrendRow[]; formatter: (value: number) => string }
type SelectedPoint = { index: number; clientX: number; clientY: number } | null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function curve(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    const control = (b.x - a.x) * 0.42
    d += ` C ${a.x + control} ${a.y}, ${b.x - control} ${b.y}, ${b.x} ${b.y}`
  }
  return d
}

export function ExpenseTrendV74({ rows, formatter }: Props) {
  const [selected, setSelected] = useState<SelectedPoint>(null)
  const width = 1200
  const height = 420
  const left = 82
  const right = 26
  const top = 34
  const bottom = 54
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.value, 0), [rows])
  const maxValue = Math.max(0, ...rows.map((row) => row.value))
  const axisMax = maxValue > 0 ? Math.ceil(maxValue * 1.18) : 100
  const peak = useMemo(() => rows.reduce((best, row, index) => row.value > best.row.value ? { row, index } : best, { row: rows[0] ?? { label: '—', value: 0 }, index: 0 }), [rows])
  const latestActiveIndex = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i].value > 0) return i
    return -1
  }, [rows])
  const latest = latestActiveIndex >= 0 ? rows[latestActiveIndex] : null
  const previous = latestActiveIndex > 0 ? rows[latestActiveIndex - 1] : null
  const change = latest && previous && previous.value > 0 ? ((latest.value - previous.value) / previous.value) * 100 : null

  const points = useMemo(() => rows.map((row, index) => ({
    ...row,
    x: rows.length <= 1 ? left + plotWidth / 2 : left + (plotWidth * index) / Math.max(1, rows.length - 1),
    y: top + plotHeight - (row.value / axisMax) * plotHeight,
  })), [rows, plotWidth, plotHeight, axisMax])

  const linePath = curve(points)
  const baseline = top + plotHeight
  const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z` : ''
  const activePoint = selected ? points[selected.index] : null
  const average = rows.length ? total / rows.length : 0

  return (
    <div className="exp74">
      <div className="exp74-overview">
        <article className="exp74-overview-primary"><span>Recorded this year</span><strong>{formatter(total)}</strong><small>Operating expenses across all recorded months</small></article>
        <article><span>Monthly average</span><strong>{formatter(average)}</strong><small>{rows.length} months in view</small></article>
        <article><span>Highest month</span><strong>{peak.row.value > 0 ? peak.row.label : 'No activity'}</strong><small>{peak.row.value > 0 ? formatter(peak.row.value) : 'No recorded spend'}</small></article>
        <article><span>Latest movement</span><strong>{change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}</strong><small>{latest ? `${latest.label} vs previous month` : 'No active month yet'}</small></article>
      </div>

      <div className="exp74-visual">
        <div className="exp74-visual-head">
          <div><span>Monthly operating costs</span><strong>{activePoint ? activePoint.label : 'Hover a month'}</strong></div>
          <div className="exp74-live-value"><span>{activePoint ? 'Selected value' : 'Current peak'}</span><strong>{formatter(activePoint?.value ?? peak.row.value)}</strong></div>
        </div>

        <div className="exp74-chart-wrap" onMouseLeave={() => setSelected(null)}>
          <svg viewBox={`0 0 ${width} ${height}`} className="exp74-chart" role="img" aria-label="Interactive monthly operating cost trend">
            <defs>
              <linearGradient id="exp74-area-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.24" />
                <stop offset="52%" stopColor="#60A5FA" stopOpacity="0.10" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>
              <filter id="exp74-dot-shadow" x="-100%" y="-100%" width="300%" height="300%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#1D4ED8" floodOpacity="0.24" />
              </filter>
            </defs>

            {[0, .25, .5, .75, 1].map((ratio) => {
              const y = top + plotHeight * ratio
              const value = Math.round(axisMax * (1 - ratio))
              return <g key={ratio}>
                <line x1={left} x2={width - right} y1={y} y2={y} className="exp74-grid" />
                <text x={left - 16} y={y + 4} textAnchor="end" className="exp74-y-label">{formatter(value)}</text>
              </g>
            })}

            {areaPath && <path d={areaPath} className="exp74-area" />}
            {linePath && <path d={linePath} className="exp74-line" />}

            {points.map((point, index) => {
              const active = selected?.index === index
              const step = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth
              return <g key={`${point.label}-${index}`}>
                <rect
                  x={clamp(point.x - step / 2, left, width - right)}
                  y={top}
                  width={Math.max(38, Math.min(step, width - right - clamp(point.x - step / 2, left, width - right)))}
                  height={plotHeight}
                  className="exp74-hit"
                  tabIndex={0}
                  aria-label={`${point.label}: ${formatter(point.value)}`}
                  onMouseEnter={(event) => setSelected({ index, clientX: event.clientX, clientY: event.clientY })}
                  onMouseMove={(event) => setSelected({ index, clientX: event.clientX, clientY: event.clientY })}
                  onFocus={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setSelected({ index, clientX: rect.left + rect.width / 2, clientY: rect.top + 24 })
                  }}
                  onBlur={() => setSelected(null)}
                />
                <line x1={point.x} x2={point.x} y1={top} y2={baseline} className={`exp74-guide${active ? ' is-active' : ''}`} />
                <circle cx={point.x} cy={point.y} r={active ? 8 : 5.5} className={`exp74-dot${active ? ' is-active' : ''}`} filter={active ? 'url(#exp74-dot-shadow)' : undefined} />
                <text x={point.x} y={height - 16} textAnchor="middle" className={`exp74-x-label${active ? ' is-active' : ''}`}>{point.label}</text>
              </g>
            })}
          </svg>

          {selected && activePoint && (
            <div className="exp74-tooltip" style={{ left: clamp(selected.clientX + 14, 12, typeof window !== 'undefined' ? window.innerWidth - 250 : selected.clientX + 14), top: Math.max(12, selected.clientY - 92) }}>
              <span>Operating costs</span><strong>{activePoint.label}</strong><b>{formatter(activePoint.value)}</b>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
