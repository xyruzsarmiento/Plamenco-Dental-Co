import { useMemo, useState } from 'react'
import { Activity, ArrowUpRight, CalendarRange, CircleDollarSign } from 'lucide-react'

type ExpenseTrendPoint = { label: string; value: number }
type Props = { rows: ExpenseTrendPoint[]; formatter: (value: number) => string }
type HoverState = { index: number; x: number; y: number } | null

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
    const midX = (current.x + next.x) / 2
    path += ` C ${midX} ${current.y}, ${midX} ${next.y}, ${next.x} ${next.y}`
  }
  return path
}

export function ExpenseTrendV66({ rows, formatter }: Props) {
  const [hover, setHover] = useState<HoverState>(null)
  const width = 1200
  const height = 400
  const left = 84
  const right = 32
  const top = 34
  const bottom = 56
  const innerWidth = width - left - right
  const innerHeight = height - top - bottom
  const maxValue = Math.max(1, ...rows.map((row) => row.value))
  const axisStep = maxValue <= 1000 ? 250 : Math.pow(10, Math.max(0, Math.floor(Math.log10(maxValue)) - 1))
  const axisMax = Math.max(1, Math.ceil(maxValue / axisStep) * axisStep)
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.value, 0), [rows])
  const average = rows.length ? Math.round(total / rows.length) : 0
  const highest = useMemo(() => rows.reduce<ExpenseTrendPoint | null>((best, row) => !best || row.value > best.value ? row : best, null), [rows])
  const activePeriods = rows.filter((row) => row.value > 0).length

  const points = useMemo(() => rows.map((row, index) => ({
    ...row,
    x: rows.length <= 1 ? left + innerWidth / 2 : left + (innerWidth * index) / Math.max(1, rows.length - 1),
    y: top + innerHeight - (row.value / axisMax) * innerHeight,
  })), [rows, innerWidth, innerHeight, axisMax])

  const linePath = smoothPath(points)
  const baseline = top + innerHeight
  const areaPath = points.length ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z` : ''
  const active = hover ? points[hover.index] : null
  const hitWidth = rows.length > 1 ? innerWidth / (rows.length - 1) : innerWidth

  function show(index: number, clientX: number, clientY: number) {
    setHover({ index, x: clientX, y: clientY })
  }

  return (
    <div className="exp66-trend">
      <div className="exp66-summary">
        <article><i><CircleDollarSign size={16} /></i><span>Recorded spend</span><strong>{formatter(total)}</strong><small>Across the displayed year</small></article>
        <article><i><CalendarRange size={16} /></i><span>Monthly average</span><strong>{formatter(average)}</strong><small>Average operating cost</small></article>
        <article><i><ArrowUpRight size={16} /></i><span>Peak period</span><strong>{highest?.label ?? 'No data'}</strong><small>{highest ? formatter(highest.value) : 'No recorded spend'}</small></article>
        <article><i><Activity size={16} /></i><span>Active periods</span><strong>{activePeriods}</strong><small>Months with recorded costs</small></article>
      </div>

      <div className="exp66-chart-shell" onMouseLeave={() => setHover(null)}>
        <div className="exp66-chart-scroll">
          <svg viewBox={`0 0 ${width} ${height}`} className="exp66-chart" role="img" aria-label="Interactive operating cost trend">
            <defs>
              <linearGradient id="exp66-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.24" />
                <stop offset="65%" stopColor="#60a5fa" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.012" />
              </linearGradient>
              <filter id="exp66-glow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#2563eb" floodOpacity="0.13" /></filter>
            </defs>

            {[0, .25, .5, .75, 1].map((ratio) => {
              const y = top + innerHeight * ratio
              const value = Math.round(axisMax * (1 - ratio))
              return <g key={ratio}><line x1={left} x2={width - right} y1={y} y2={y} className="exp66-grid" /><text x={left - 14} y={y + 4} textAnchor="end" className="exp66-y-label">{formatter(value)}</text></g>
            })}

            {areaPath && <path d={areaPath} className="exp66-area" />}
            {linePath && <path d={linePath} className="exp66-line" filter="url(#exp66-glow)" />}

            {points.map((point, index) => {
              const zoneX = clamp(point.x - hitWidth / 2, left, width - right)
              const zoneWidth = Math.min(Math.max(hitWidth, 46), width - right - zoneX)
              return <g key={`${point.label}-${index}`}>
                <rect
                  x={zoneX}
                  y={top}
                  width={zoneWidth}
                  height={innerHeight}
                  className="exp66-hit"
                  tabIndex={0}
                  onMouseEnter={(event) => show(index, event.clientX, event.clientY)}
                  onMouseMove={(event) => show(index, event.clientX, event.clientY)}
                  onFocus={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    show(index, rect.left + rect.width / 2, rect.top + 26)
                  }}
                  onBlur={() => setHover(null)}
                />
                <line x1={point.x} x2={point.x} y1={top} y2={baseline} className={hover?.index === index ? 'exp66-guide is-active' : 'exp66-guide'} />
                <circle cx={point.x} cy={point.y} r={hover?.index === index ? 8 : 5.5} className={hover?.index === index ? 'exp66-dot is-active' : 'exp66-dot'} />
                <text x={point.x} y={height - 18} textAnchor="middle" className="exp66-x-label">{point.label}</text>
              </g>
            })}
          </svg>
        </div>

        {active && hover && <div className="exp66-tooltip" style={{ left: clamp(hover.x + 16, 12, window.innerWidth - 270), top: Math.max(12, hover.y - 96) }}>
          <span>Operating cost</span><strong>{active.label}</strong><b>{formatter(active.value)}</b><small>{total > 0 ? `${Math.round((active.value / total) * 100)}% of displayed spend` : 'No recorded spend'}</small>
        </div>}
      </div>
    </div>
  )
}
