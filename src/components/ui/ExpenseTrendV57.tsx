import { useMemo, useState } from 'react'
import { ArrowUpRight, CalendarRange, CircleDollarSign } from 'lucide-react'

type ExpenseTrendPoint = {
  label: string
  value: number
}

type Props = {
  rows: ExpenseTrendPoint[]
  formatter: (value: number) => string
}

type HoverState = {
  index: number
  x: number
  y: number
} | null

export function ExpenseTrendV57({ rows, formatter }: Props) {
  const [hover, setHover] = useState<HoverState>(null)
  const width = 920
  const height = 330
  const left = 64
  const right = 26
  const top = 30
  const bottom = 48
  const innerWidth = width - left - right
  const innerHeight = height - top - bottom
  const max = Math.max(1, ...rows.map((row) => row.value))

  const total = useMemo(() => rows.reduce((sum, row) => sum + row.value, 0), [rows])
  const average = rows.length ? Math.round(total / rows.length) : 0
  const highest = useMemo(() => rows.reduce<ExpenseTrendPoint | null>((best, row) => !best || row.value > best.value ? row : best, null), [rows])

  const points = rows.map((row, index) => ({
    ...row,
    x: rows.length <= 1 ? left + innerWidth / 2 : left + (innerWidth * index) / (rows.length - 1),
    y: top + innerHeight - (row.value / max) * innerHeight,
  }))

  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${top + innerHeight} L ${points[0].x} ${top + innerHeight} Z`
    : ''

  const active = hover ? points[hover.index] : null

  function setFromPointer(index: number, clientX: number, clientY: number) {
    setHover({ index, x: clientX, y: clientY })
  }

  return (
    <div className="exp57-trend">
      <div className="exp57-summary">
        <article><span><CircleDollarSign size={14} /> Recorded spend</span><strong>{formatter(total)}</strong><small>Across the displayed period</small></article>
        <article><span><CalendarRange size={14} /> Monthly average</span><strong>{formatter(average)}</strong><small>Average recorded operating cost</small></article>
        <article><span><ArrowUpRight size={14} /> Highest period</span><strong>{highest?.label ?? 'No data'}</strong><small>{highest ? formatter(highest.value) : 'No recorded spend'}</small></article>
      </div>

      <div className="exp57-chart-shell" onMouseLeave={() => setHover(null)}>
        <div className="exp57-chart-scroll">
          <svg viewBox={`0 0 ${width} ${height}`} className="exp57-chart" role="img" aria-label="Interactive operating cost trend">
            <defs>
              <linearGradient id="exp57Area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {[0, .25, .5, .75, 1].map((ratio) => {
              const y = top + innerHeight * ratio
              const value = Math.round(max * (1 - ratio))
              return <g key={ratio}><line x1={left} x2={width - right} y1={y} y2={y} className="exp57-grid" /><text x={left - 12} y={y + 4} textAnchor="end" className="exp57-y-label">{formatter(value)}</text></g>
            })}

            {areaPath && <path d={areaPath} className="exp57-area" />}
            {linePath && <path d={linePath} className="exp57-line" />}

            {points.map((point, index) => (
              <g key={`${point.label}-${index}`}>
                <line x1={point.x} x2={point.x} y1={top} y2={top + innerHeight} className={hover?.index === index ? 'exp57-guide is-active' : 'exp57-guide'} />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={hover?.index === index ? 7 : 5}
                  className={hover?.index === index ? 'exp57-dot is-active' : 'exp57-dot'}
                  tabIndex={0}
                  onMouseEnter={(event) => setFromPointer(index, event.clientX, event.clientY)}
                  onMouseMove={(event) => setFromPointer(index, event.clientX, event.clientY)}
                  onFocus={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setFromPointer(index, rect.left + rect.width / 2, rect.top)
                  }}
                  onBlur={() => setHover(null)}
                />
                <text x={point.x} y={height - 17} textAnchor="middle" className="exp57-x-label">{point.label}</text>
              </g>
            ))}
          </svg>
        </div>

        {active && hover && <div className="exp57-tooltip" style={{ left: Math.min(Math.max(hover.x + 14, 12), window.innerWidth - 250), top: Math.max(12, hover.y - 86) }}>
          <span>Operating cost</span>
          <strong>{active.label}</strong>
          <b>{formatter(active.value)}</b>
        </div>}
      </div>
    </div>
  )
}
