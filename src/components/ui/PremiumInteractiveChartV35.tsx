import { useMemo, useState } from 'react'

type Tooltip = { x: number; y: number; title: string; lines: string[] } | null

type Series = {
  key: string
  label: string
  values: number[]
  formatter?: (value: number) => string
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function PremiumLineChartV35({
  labels,
  series,
  ariaLabel,
}: {
  labels: string[]
  series: Series[]
  ariaLabel: string
}) {
  const [tooltip, setTooltip] = useState<Tooltip>(null)
  const width = 900
  const height = 300
  const left = 44
  const right = 22
  const top = 24
  const bottom = 42
  const usableWidth = width - left - right
  const usableHeight = height - top - bottom
  const max = Math.max(1, ...series.flatMap((item) => item.values))

  const points = useMemo(() => labels.map((_, index) => ({
    x: labels.length <= 1 ? left + usableWidth / 2 : left + (usableWidth * index) / Math.max(1, labels.length - 1),
    index,
  })), [labels, usableWidth])

  const yFor = (value: number) => top + usableHeight - (value / max) * usableHeight
  const pathFor = (values: number[]) => values.map((value, index) => {
    const x = points[index]?.x ?? left
    return `${index === 0 ? 'M' : 'L'} ${x} ${yFor(value)}`
  }).join(' ')

  function show(index: number, clientX: number, clientY: number) {
    setTooltip({
      x: clientX,
      y: clientY,
      title: labels[index] ?? 'Data point',
      lines: series.map((item) => `${item.label}: ${item.formatter ? item.formatter(item.values[index] ?? 0) : (item.values[index] ?? 0).toLocaleString('en-PH')}`),
    })
  }

  return (
    <div className="premium-chart-v35" onMouseLeave={() => setTooltip(null)}>
      <div className="premium-chart-scroll-v35">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} className="premium-line-chart-v35">
          {[0, .25, .5, .75, 1].map((ratio) => {
            const y = top + usableHeight * ratio
            return <line key={ratio} x1={left} x2={width - right} y1={y} y2={y} className="premium-chart-grid-v35" />
          })}
          {series.map((item, seriesIndex) => (
            <g key={item.key} className={`premium-chart-series-v35 series-${seriesIndex}`}>
              <path d={pathFor(item.values)} className="premium-chart-line-v35" />
              {item.values.map((value, index) => (
                <circle
                  key={`${item.key}-${index}`}
                  cx={points[index]?.x ?? left}
                  cy={yFor(value)}
                  r="5"
                  className="premium-chart-dot-v35"
                  tabIndex={0}
                  onMouseEnter={(event) => show(index, event.clientX, event.clientY)}
                  onMouseMove={(event) => show(index, event.clientX, event.clientY)}
                  onFocus={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    show(index, rect.left + rect.width / 2, rect.top)
                  }}
                  onBlur={() => setTooltip(null)}
                />
              ))}
            </g>
          ))}
          {labels.map((label, index) => {
            const step = Math.max(1, Math.ceil(labels.length / 8))
            if (index !== labels.length - 1 && index % step !== 0) return null
            return <text key={`${label}-${index}`} x={points[index]?.x ?? left} y={height - 12} textAnchor="middle" className="premium-chart-axis-v35">{label}</text>
          })}
        </svg>
      </div>
      {tooltip && <div className="premium-chart-tooltip-v35" style={{ left: clamp(tooltip.x + 14, 12, window.innerWidth - 260), top: Math.max(12, tooltip.y - 84) }}><strong>{tooltip.title}</strong>{tooltip.lines.map((line) => <span key={line}>{line}</span>)}</div>}
    </div>
  )
}

export function PremiumBarChartV35({
  rows,
  valueLabel,
  formatter = (value) => value.toLocaleString('en-PH'),
  ariaLabel,
}: {
  rows: Array<{ label: string; value: number; meta?: string }>
  valueLabel: string
  formatter?: (value: number) => string
  ariaLabel: string
}) {
  const [tooltip, setTooltip] = useState<Tooltip>(null)
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <div className="premium-bars-v35" role="img" aria-label={ariaLabel} onMouseLeave={() => setTooltip(null)}>
      {rows.length ? rows.map((row) => (
        <button
          type="button"
          key={row.label}
          className="premium-bar-row-v35"
          onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`${valueLabel}: ${formatter(row.value)}`, ...(row.meta ? [row.meta] : [])] })}
          onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`${valueLabel}: ${formatter(row.value)}`, ...(row.meta ? [row.meta] : [])] })}
          onFocus={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            setTooltip({ x: rect.left + rect.width / 2, y: rect.top, title: row.label, lines: [`${valueLabel}: ${formatter(row.value)}`, ...(row.meta ? [row.meta] : [])] })
          }}
          onBlur={() => setTooltip(null)}
        >
          <span className="premium-bar-copy-v35"><strong>{row.label}</strong><b>{formatter(row.value)}</b></span>
          <span className="premium-bar-track-v35"><i style={{ width: `${(row.value / max) * 100}%` }} /></span>
          {row.meta && <small>{row.meta}</small>}
        </button>
      )) : <div className="premium-chart-empty-v35">No recorded data in this view.</div>}
      {tooltip && <div className="premium-chart-tooltip-v35" style={{ left: clamp(tooltip.x + 14, 12, window.innerWidth - 260), top: Math.max(12, tooltip.y - 84) }}><strong>{tooltip.title}</strong>{tooltip.lines.map((line) => <span key={line}>{line}</span>)}</div>}
    </div>
  )
}
