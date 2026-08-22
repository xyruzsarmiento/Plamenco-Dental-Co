import { useMemo, useState } from 'react'

type TrendRow = { label: string; value: number }
type Props = { rows: TrendRow[]; formatter: (value: number) => string }
type ActivePoint = { index: number; x: number; y: number } | null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const distance = (next.x - current.x) * 0.38
    path += ` C ${current.x + distance} ${current.y}, ${next.x - distance} ${next.y}, ${next.x} ${next.y}`
  }
  return path
}

export function ExpenseTrendV73({ rows, formatter }: Props) {
  const [active, setActive] = useState<ActivePoint>(null)
  const width = 1440
  const height = 360
  const left = 78
  const right = 28
  const top = 28
  const bottom = 52
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const maxValue = Math.max(0, ...rows.map((row) => row.value))
  const axisMax = maxValue > 0 ? maxValue * 1.15 : 100
  const baseline = top + plotHeight
  const zeroLineY = top + plotHeight * 0.66

  const total = useMemo(() => rows.reduce((sum, row) => sum + row.value, 0), [rows])
  const activeMonths = useMemo(() => rows.filter((row) => row.value > 0).length, [rows])
  const peak = useMemo(() => rows.reduce((best, row) => row.value > best.value ? row : best, rows[0] ?? { label: '—', value: 0 }), [rows])

  const points = useMemo(() => rows.map((row, index) => ({
    ...row,
    x: rows.length <= 1 ? left + plotWidth / 2 : left + (plotWidth * index) / Math.max(1, rows.length - 1),
    y: maxValue === 0 ? zeroLineY : top + plotHeight - (row.value / axisMax) * plotHeight,
  })), [rows, plotWidth, plotHeight, maxValue, axisMax, zeroLineY])

  const line = smoothPath(points)
  const area = points.length ? `${line} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z` : ''
  const selected = active ? points[active.index] : null
  const zoneWidth = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth

  return (
    <div className="exp73-trend">
      <div className="exp73-summary">
        <article><span>Year total</span><strong>{formatter(total)}</strong><small>Recorded operating costs</small></article>
        <article><span>Active months</span><strong>{activeMonths} / {rows.length}</strong><small>Months with expense activity</small></article>
        <article><span>Peak month</span><strong>{peak.value > 0 ? peak.label : 'No activity'}</strong><small>{peak.value > 0 ? formatter(peak.value) : 'No recorded spend yet'}</small></article>
      </div>

      <div className="exp73-chart-shell" onMouseLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="exp73-chart" role="img" aria-label="Monthly operating cost trend">
          <defs>
            <linearGradient id="exp73-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
              <stop offset="68%" stopColor="#60A5FA" stopOpacity="0.07" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, .25, .5, .75, 1].map((ratio) => {
            const y = top + plotHeight * ratio
            const value = Math.round(axisMax * (1 - ratio))
            return <g key={ratio}>
              <line x1={left} x2={width - right} y1={y} y2={y} className="exp73-grid" />
              <text x={left - 14} y={y + 4} textAnchor="end" className="exp73-axis-y">{formatter(value)}</text>
            </g>
          })}

          {area && <path d={area} className="exp73-area" />}
          {line && <path d={line} className="exp73-line" />}

          {points.map((point, index) => {
            const half = zoneWidth / 2
            const hitX = clamp(point.x - half, left, width - right)
            const hitWidth = Math.min(zoneWidth, width - right - hitX)
            const isActive = active?.index === index
            return <g key={`${point.label}-${index}`}>
              <rect
                x={hitX}
                y={top}
                width={Math.max(hitWidth, 34)}
                height={plotHeight}
                className="exp73-hit"
                tabIndex={0}
                aria-label={`${point.label}: ${formatter(point.value)}`}
                onMouseEnter={(event) => setActive({ index, x: event.clientX, y: event.clientY })}
                onMouseMove={(event) => setActive({ index, x: event.clientX, y: event.clientY })}
                onFocus={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setActive({ index, x: rect.left + rect.width / 2, y: rect.top + 24 })
                }}
                onBlur={() => setActive(null)}
              />
              <line x1={point.x} x2={point.x} y1={top} y2={baseline} className={`exp73-guide${isActive ? ' is-active' : ''}`} />
              <circle cx={point.x} cy={point.y} r={isActive ? 7 : 5} className={`exp73-dot${isActive ? ' is-active' : ''}`} />
              <text x={point.x} y={height - 16} textAnchor="middle" className="exp73-axis-x">{point.label}</text>
            </g>
          })}
        </svg>

        {selected && active && <div className="exp73-tooltip" style={{ left: clamp(active.x + 14, 12, typeof window !== 'undefined' ? window.innerWidth - 250 : active.x + 14), top: Math.max(12, active.y - 88) }}>
          <span>Operating cost</span><strong>{selected.label}</strong><b>{formatter(selected.value)}</b>
        </div>}
      </div>
    </div>
  )
}
