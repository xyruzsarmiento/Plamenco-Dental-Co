import { useMemo, useState } from 'react'

type TrendRow = { label: string; value: number }
type Props = { rows: TrendRow[]; formatter: (value: number) => string }
type ActivePoint = { index: number; clientX: number; clientY: number } | null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function curve(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const control = (next.x - current.x) * 0.38
    d += ` C ${current.x + control} ${current.y}, ${next.x - control} ${next.y}, ${next.x} ${next.y}`
  }
  return d
}

export function ExpenseTrendV72({ rows, formatter }: Props) {
  const [active, setActive] = useState<ActivePoint>(null)
  const width = 1200
  const height = 390
  const left = 58
  const right = 18
  const top = 24
  const bottom = 48
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const baseline = top + plotHeight
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.value, 0), [rows])
  const activeMonths = useMemo(() => rows.filter((row) => row.value > 0).length, [rows])
  const maxValue = Math.max(0, ...rows.map((row) => row.value))
  const axisMax = maxValue > 0 ? maxValue * 1.16 : 100

  const points = useMemo(() => rows.map((row, index) => ({
    ...row,
    x: rows.length <= 1 ? left + plotWidth / 2 : left + (plotWidth * index) / Math.max(1, rows.length - 1),
    y: maxValue === 0 ? baseline : top + plotHeight - (row.value / axisMax) * plotHeight,
  })), [rows, plotWidth, plotHeight, axisMax, maxValue, baseline])

  const linePath = curve(points)
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
    : ''
  const selected = active ? points[active.index] : null
  const zoneWidth = rows.length > 1 ? plotWidth / (rows.length - 1) : plotWidth

  function activate(index: number, clientX: number, clientY: number) {
    setActive({ index, clientX, clientY })
  }

  return (
    <div className="exp72-trend">
      <div className="exp72-meta" aria-label="Operating cost year summary">
        <div><span>Year view</span><strong>{formatter(total)}</strong><small>Total recorded operating costs</small></div>
        <div><span>Active months</span><strong>{activeMonths} / {rows.length}</strong><small>Months with recorded expenses</small></div>
      </div>

      <div className="exp72-chart-shell" onMouseLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} className="exp72-chart" role="img" aria-label="Monthly operating cost trend">
          <defs>
            <linearGradient id="exp72-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.2" />
              <stop offset="72%" stopColor="#60A5FA" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <filter id="exp72-line-shadow" x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#2563EB" floodOpacity="0.13" />
            </filter>
          </defs>

          {[0, .25, .5, .75, 1].map((ratio) => {
            const y = top + plotHeight * ratio
            const value = Math.round(axisMax * (1 - ratio))
            return (
              <g key={ratio}>
                <line x1={left} x2={width - right} y1={y} y2={y} className="exp72-grid" />
                <text x={left - 10} y={y + 4} textAnchor="end" className="exp72-y-label">{formatter(value)}</text>
              </g>
            )
          })}

          {areaPath && <path d={areaPath} className="exp72-area" />}
          {linePath && <path d={linePath} className="exp72-line" filter="url(#exp72-line-shadow)" />}

          {points.map((point, index) => {
            const half = zoneWidth / 2
            const hitX = clamp(point.x - half, left, width - right)
            const hitWidth = Math.min(zoneWidth, width - right - hitX)
            const isActive = active?.index === index
            return (
              <g key={`${point.label}-${index}`}>
                <rect
                  x={hitX}
                  y={top}
                  width={Math.max(hitWidth, 28)}
                  height={plotHeight}
                  className="exp72-hit"
                  tabIndex={0}
                  aria-label={`${point.label}: ${formatter(point.value)}`}
                  onMouseEnter={(event) => activate(index, event.clientX, event.clientY)}
                  onMouseMove={(event) => activate(index, event.clientX, event.clientY)}
                  onFocus={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    activate(index, rect.left + rect.width / 2, rect.top + 24)
                  }}
                  onBlur={() => setActive(null)}
                />
                <line x1={point.x} x2={point.x} y1={top} y2={baseline} className={`exp72-guide${isActive ? ' is-active' : ''}`} />
                <circle cx={point.x} cy={point.y} r={isActive ? 7.5 : 5.5} className={`exp72-dot${isActive ? ' is-active' : ''}`} />
                <text x={point.x} y={height - 15} textAnchor="middle" className="exp72-x-label">{point.label}</text>
              </g>
            )
          })}
        </svg>

        {selected && active && (
          <div
            className="exp72-tooltip"
            style={{
              left: clamp(active.clientX + 14, 12, typeof window !== 'undefined' ? window.innerWidth - 250 : active.clientX + 14),
              top: Math.max(12, active.clientY - 88),
            }}
          >
            <span>Operating cost</span>
            <strong>{selected.label}</strong>
            <b>{formatter(selected.value)}</b>
          </div>
        )}
      </div>
    </div>
  )
}
