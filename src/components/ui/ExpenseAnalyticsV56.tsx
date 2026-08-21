import { useMemo, useState } from 'react'

type ExpenseAnalyticsRow = {
  label: string
  value: number
  displayValue: string
  meta?: string
}

type TooltipState = { x: number; y: number; title: string; lines: string[] } | null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function Tooltip({ state }: { state: TooltipState }) {
  if (!state) return null
  return (
    <div className="exp56-tooltip" style={{ left: clamp(state.x + 14, 12, window.innerWidth - 286), top: Math.max(12, state.y - 96) }}>
      <strong>{state.title}</strong>
      {state.lines.map((line) => <span key={line}>{line}</span>)}
    </div>
  )
}

export function ExpenseRankedBarsV56({
  rows,
  valueLabel,
  totalLabel,
  totalDisplay,
  secondaryLabel,
  emptyLabel,
  ariaLabel,
}: {
  rows: ExpenseAnalyticsRow[]
  valueLabel: string
  totalLabel: string
  totalDisplay: string
  secondaryLabel: string
  emptyLabel: string
  ariaLabel: string
}) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const sorted = useMemo(() => [...rows].sort((a, b) => b.value - a.value), [rows])
  const total = useMemo(() => sorted.reduce((sum, row) => sum + row.value, 0), [sorted])
  const max = Math.max(1, ...sorted.map((row) => row.value))
  const leader = sorted[0]

  return (
    <div className="exp56-chart" role="img" aria-label={ariaLabel} onMouseLeave={() => setTooltip(null)}>
      <div className="exp56-summary">
        <article><span>{totalLabel}</span><strong>{totalDisplay}</strong><small>Across the current report period</small></article>
        <article><span>{secondaryLabel}</span><strong>{leader?.label ?? 'No data'}</strong><small>{leader ? leader.displayValue : 'No recorded spend'}</small></article>
      </div>

      {sorted.length ? (
        <div className="exp56-list">
          {sorted.map((row, index) => {
            const share = total > 0 ? Math.round((row.value / total) * 100) : 0
            const width = row.value > 0 ? Math.max(10, (row.value / max) * 100) : 0
            return (
              <button
                type="button"
                key={`${row.label}-${index}`}
                className={`exp56-row ${row.value === 0 ? 'is-zero' : ''}`}
                onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`${valueLabel}: ${row.displayValue}`, `Share of recorded spend: ${share}%`, ...(row.meta ? [row.meta] : [])] })}
                onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`${valueLabel}: ${row.displayValue}`, `Share of recorded spend: ${share}%`, ...(row.meta ? [row.meta] : [])] })}
                onFocus={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setTooltip({ x: rect.left + rect.width / 2, y: rect.top, title: row.label, lines: [`${valueLabel}: ${row.displayValue}`, `Share of recorded spend: ${share}%`, ...(row.meta ? [row.meta] : [])] })
                }}
                onBlur={() => setTooltip(null)}
              >
                <span className="exp56-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="exp56-main">
                  <span className="exp56-copy"><strong>{row.label}</strong><small>{row.meta || `${share}% of recorded spend`}</small></span>
                  <span className="exp56-track"><i style={{ width: `${width}%` }} />{row.value === 0 && <em>No recorded spend</em>}</span>
                </span>
                <span className="exp56-value"><strong>{row.displayValue}</strong><small>{share}% share</small></span>
              </button>
            )
          })}
        </div>
      ) : <div className="exp56-empty">{emptyLabel}</div>}
      <Tooltip state={tooltip} />
    </div>
  )
}
