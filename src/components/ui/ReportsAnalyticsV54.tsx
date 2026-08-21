import { useMemo, useState } from 'react'

type ReportAnalyticsRow = {
  label: string
  value: number
  displayValue: string
  meta?: string
}

type TooltipState = {
  x: number
  y: number
  title: string
  lines: string[]
} | null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function Tooltip({ state }: { state: TooltipState }) {
  if (!state) return null
  return (
    <div className="rpt54-tooltip" style={{ left: clamp(state.x + 14, 12, window.innerWidth - 285), top: Math.max(12, state.y - 96) }}>
      <strong>{state.title}</strong>
      {state.lines.map((line) => <span key={line}>{line}</span>)}
    </div>
  )
}

export function ReportRankedBarsV54({
  rows,
  valueLabel,
  totalLabel,
  totalDisplay,
  emptyLabel,
  ariaLabel,
}: {
  rows: ReportAnalyticsRow[]
  valueLabel: string
  totalLabel: string
  totalDisplay: string
  emptyLabel: string
  ariaLabel: string
}) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const sortedRows = useMemo(() => [...rows].sort((a, b) => b.value - a.value), [rows])
  const total = useMemo(() => sortedRows.reduce((sum, row) => sum + row.value, 0), [sortedRows])
  const max = Math.max(1, ...sortedRows.map((row) => row.value))
  const leader = sortedRows[0]

  return (
    <div className="rpt54-chart" role="img" aria-label={ariaLabel} onMouseLeave={() => setTooltip(null)}>
      <div className="rpt54-summary">
        <div><span>{totalLabel}</span><strong>{totalDisplay}</strong></div>
        <div><span>Leading segment</span><strong>{leader?.label ?? 'No data'}</strong></div>
      </div>

      {sortedRows.length ? (
        <div className="rpt54-list">
          {sortedRows.map((row, index) => {
            const share = total > 0 ? Math.round((row.value / total) * 100) : 0
            const width = row.value > 0 ? Math.max(8, (row.value / max) * 100) : 0
            return (
              <button
                type="button"
                className={`rpt54-row ${row.value === 0 ? 'is-zero' : ''}`}
                key={`${row.label}-${index}`}
                onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`${valueLabel}: ${row.displayValue}`, `Share: ${share}%`, ...(row.meta ? [row.meta] : [])] })}
                onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`${valueLabel}: ${row.displayValue}`, `Share: ${share}%`, ...(row.meta ? [row.meta] : [])] })}
                onFocus={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setTooltip({ x: rect.left + rect.width / 2, y: rect.top, title: row.label, lines: [`${valueLabel}: ${row.displayValue}`, `Share: ${share}%`, ...(row.meta ? [row.meta] : [])] })
                }}
                onBlur={() => setTooltip(null)}
              >
                <span className="rpt54-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="rpt54-main">
                  <span className="rpt54-copy"><strong>{row.label}</strong><small>{row.meta || `${share}% of recorded total`}</small></span>
                  <span className="rpt54-track">
                    <i style={{ width: `${width}%` }} />
                    {row.value === 0 && <em>No recorded value</em>}
                  </span>
                </span>
                <span className="rpt54-value"><strong>{row.displayValue}</strong><small>{valueLabel}</small></span>
              </button>
            )
          })}
        </div>
      ) : <div className="rpt54-empty">{emptyLabel}</div>}
      <Tooltip state={tooltip} />
    </div>
  )
}
