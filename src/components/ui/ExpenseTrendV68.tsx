import { useMemo, useState } from 'react'
import { ArrowUpRight, CalendarDays, CircleDollarSign, TrendingUp } from 'lucide-react'

type TrendRow = { label: string; value: number }
type Props = { rows: TrendRow[]; formatter: (value: number) => string }
type ActivePoint = { index: number; x: number; y: number } | null

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
    const dx = (b.x - a.x) * 0.42
    d += ` C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
  }
  return d
}

export function ExpenseTrendV68({ rows, formatter }: Props) {
  const [active, setActive] = useState<ActivePoint>(null)
  const width = 1280
  const height = 410
  const left = 94
  const right = 34
  const top = 30
  const bottom = 58
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.value, 0), [rows])
  const average = rows.length ? Math.round(total / rows.length) : 0
  const peak = useMemo(() => rows.reduce<TrendRow | null>((best, row) => !best || row.value > best.value ? row : best, null), [rows])
  const activeMonths = rows.filter((row) => row.value > 0).length
  const rawMax = Math.max(0, ...rows.map((row) => row.value))
  const axisMax = rawMax > 0 ? rawMax * 1.18 : 100

  const points = useMemo(() => rows.map((row, index) => ({
    ...row,
    x: rows.length <= 1 ? left + plotWidth / 2 : left + (plotWidth * index) / Math.max(1, rows.length - 1),
    y: top + plotHeight - (row.value / axisMax) * plotHeight,
  })), [rows, plotWidth, plotHeight, axisMax])

  const line = curve(points)
  const baseline = top + plotHeight
  const area = points.length ? `${line} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z` : ''
  const selected = active ? points[active.index] : null
  const zoneWidth = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth

  return (
    <div className="exp68-trend">
      <div className="exp68-summary">
        <article><i><CircleDollarSign size={17} /></i><div><span>Year-to-date spend</span><strong>{formatter(total)}</strong><small>Recorded non-void operating costs</small></div></article>
        <article><i><TrendingUp size={17} /></i><div><span>Monthly average</span><strong>{formatter(average)}</strong><small>Across the displayed year</small></div></article>
        <article><i><ArrowUpRight size={17} /></i><div><span>Highest month</span><strong>{peak?.label ?? 'No activity'}</strong><small>{peak && peak.value > 0 ? formatter(peak.value) : 'No recorded spend'}</small></div></article>
        <article><i><CalendarDays size={17} /></i><div><span>Active months</span><strong>{activeMonths}</strong><small>Months containing expense records</small></div></article>
      </div>

      <div className="exp68-chart-wrap" onMouseLeave={() => setActive(null)}>
        <div className="exp68-chart-scroll">
          <svg viewBox={`0 0 ${width} ${height}`} className="exp68-chart" role="img" aria-label="Monthly operating cost trend">
            <defs>
              <linearGradient id="exp68-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity="0.22" />
                <stop offset="58%" stopColor="#60A5FA" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>
              <filter id="exp68-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#2563EB" floodOpacity="0.12" />
              </filter>
            </defs>

            {[0, .25, .5, .75, 1].map((ratio) => {
              const y = top + plotHeight * ratio
              const value = Math.round(axisMax * (1 - ratio))
              return <g key={ratio}>
                <line x1={left} x2={width - right} y1={y} y2={y} className="exp68-grid" />
                <text x={left - 15} y={y + 4} textAnchor="end" className="exp68-y">{formatter(value)}</text>
              </g>
            })}

            {area && <path d={area} className="exp68-area" />}
            {line && <path d={line} className="exp68-line" filter="url(#exp68-shadow)" />}

            {points.map((point, index) => {
              const x = clamp(point.x - zoneWidth / 2, left, width - right)
              const w = Math.min(Math.max(zoneWidth, 54), width - right - x)
              const isActive = active?.index === index
              return <g key={`${point.label}-${index}`}>
                <rect
                  x={x}
                  y={top}
                  width={w}
                  height={plotHeight}
                  className="exp68-hit"
                  tabIndex={0}
                  aria-label={`${point.label}: ${formatter(point.value)}`}
                  onMouseEnter={(event) => setActive({ index, x: event.clientX, y: event.clientY })}
                  onMouseMove={(event) => setActive({ index, x: event.clientX, y: event.clientY })}
                  onFocus={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setActive({ index, x: rect.left + rect.width / 2, y: rect.top + 30 })
                  }}
                  onBlur={() => setActive(null)}
                />
                <line x1={point.x} x2={point.x} y1={top} y2={baseline} className={`exp68-guide${isActive ? ' is-active' : ''}`} />
                <circle cx={point.x} cy={point.y} r={isActive ? 8 : 5.5} className={`exp68-dot${isActive ? ' is-active' : ''}`} />
                <text x={point.x} y={height - 18} textAnchor="middle" className="exp68-x">{point.label}</text>
              </g>
            })}
          </svg>
        </div>

        {selected && active && <div className="exp68-tooltip" style={{ left: clamp(active.x + 14, 12, window.innerWidth - 278), top: Math.max(12, active.y - 100) }}>
          <span>Monthly operating cost</span>
          <strong>{selected.label}</strong>
          <b>{formatter(selected.value)}</b>
          <small>{total > 0 ? `${Math.round((selected.value / total) * 100)}% of year-to-date spend` : 'No expense recorded for this month'}</small>
        </div>}
      </div>
    </div>
  )
}
