import { useMemo, useState } from 'react'

type Point = { label: string; value: number }
type Tip = { x: number; y: number; label: string; value: number } | null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function ExpenseTrendV57({ points, formatter }: { points: Point[]; formatter: (value: number) => string }) {
  const [tip, setTip] = useState<Tip>(null)
  const width = 760
  const height = 210
  const left = 20
  const right = 16
  const top = 18
  const bottom = 28
  const innerW = width - left - right
  const innerH = height - top - bottom
  const max = Math.max(1, ...points.map((point) => point.value))
  const total = useMemo(() => points.reduce((sum, point) => sum + point.value, 0), [points])
  const peak = useMemo(() => points.reduce<Point | null>((best, point) => !best || point.value > best.value ? point : best, null), [points])

  const coords = points.map((point, index) => ({
    ...point,
    x: points.length <= 1 ? left + innerW / 2 : left + (innerW * index) / Math.max(1, points.length - 1),
    y: top + innerH - (point.value / max) * innerH,
  }))
  const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area = coords.length ? `${line} L ${coords[coords.length - 1].x} ${top + innerH} L ${coords[0].x} ${top + innerH} Z` : ''

  return (
    <div className="exp57-trend" onMouseLeave={() => setTip(null)}>
      <div className="exp57-summary">
        <article><span>Year-to-date spend</span><strong>{formatter(total)}</strong></article>
        <article><span>Peak period</span><strong>{peak?.label ?? 'No data'}</strong><small>{peak ? formatter(peak.value) : formatter(0)}</small></article>
      </div>
      <div className="exp57-plot-wrap">
        {points.length ? <svg viewBox={`0 0 ${width} ${height}`} className="exp57-plot" role="img" aria-label="Operating cost trend">
          <defs>
            <linearGradient id="exp57Area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.16" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.015" />
            </linearGradient>
          </defs>
          {[0, .5, 1].map((ratio) => <line key={ratio} x1={left} x2={width - right} y1={top + innerH * ratio} y2={top + innerH * ratio} className="exp57-grid" />)}
          {area && <path d={area} className="exp57-area" />}
          {line && <path d={line} className="exp57-line" />}
          {coords.map((point) => <g key={point.label}>
            <circle
              cx={point.x}
              cy={point.y}
              r="5"
              className="exp57-dot"
              tabIndex={0}
              onMouseEnter={(event) => setTip({ x: event.clientX, y: event.clientY, label: point.label, value: point.value })}
              onMouseMove={(event) => setTip({ x: event.clientX, y: event.clientY, label: point.label, value: point.value })}
              onFocus={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setTip({ x: rect.left + rect.width / 2, y: rect.top, label: point.label, value: point.value })
              }}
              onBlur={() => setTip(null)}
            />
            <text x={point.x} y={height - 7} textAnchor="middle" className="exp57-label">{point.label}</text>
          </g>)}
        </svg> : <div className="exp57-empty">No operating expense activity has been recorded for this period.</div>}
      </div>
      {tip && <div className="exp57-tooltip" style={{ left: clamp(tip.x + 14, 12, window.innerWidth - 250), top: Math.max(12, tip.y - 76) }}><strong>{tip.label}</strong><span>{formatter(tip.value)}</span></div>}
    </div>
  )
}
