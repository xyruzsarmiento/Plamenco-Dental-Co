import { useMemo, useState } from 'react'

type Row = {
  label: string
  valuationCents: number
  quantityOnHand: number
  branchName: string
  valueLabel: string
}

type TooltipState = { x: number; y: number; title: string; lines: string[] } | null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function InventoryValueAnalyticsV56({ rows }: { rows: Row[] }) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const sorted = useMemo(() => [...rows].sort((a, b) => b.valuationCents - a.valuationCents), [rows])
  const total = useMemo(() => sorted.reduce((sum, row) => sum + row.valuationCents, 0), [sorted])
  const max = Math.max(1, ...sorted.map((row) => row.valuationCents))

  return (
    <div className="inv56-value-chart" onMouseLeave={() => setTooltip(null)}>
      <div className="inv56-value-summary">
        <div><span>Tracked positions</span><strong>{sorted.length}</strong></div>
        <div><span>Top value position</span><strong>{sorted[0]?.valueLabel ?? '₱0'}</strong></div>
      </div>

      {sorted.length ? (
        <div className="inv56-value-list" role="img" aria-label="Highest-value inventory stock positions">
          {sorted.map((row, index) => {
            const share = total > 0 ? Math.round((row.valuationCents / total) * 100) : 0
            const width = row.valuationCents > 0 ? Math.max(10, (row.valuationCents / max) * 100) : 0
            const lines = [
              `Stock value: ${row.valueLabel}`,
              `Share of listed value: ${share}%`,
              `On hand: ${row.quantityOnHand.toLocaleString('en-PH')}`,
              `Branch: ${row.branchName}`,
            ]
            return (
              <button
                type="button"
                key={`${row.label}-${row.branchName}-${index}`}
                className="inv56-value-row"
                onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines })}
                onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines })}
                onFocus={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setTooltip({ x: rect.left + rect.width / 2, y: rect.top, title: row.label, lines })
                }}
                onBlur={() => setTooltip(null)}
              >
                <span className="inv56-value-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="inv56-value-main">
                  <span className="inv56-value-copy"><strong>{row.label}</strong><small>{row.branchName} · {row.quantityOnHand.toLocaleString('en-PH')} on hand</small></span>
                  <span className={`inv56-value-track ${row.valuationCents === 0 ? 'is-zero' : ''}`}>
                    <i style={{ width: `${width}%` }} />
                    {row.valuationCents === 0 && <em>No recorded value</em>}
                  </span>
                </span>
                <span className="inv56-value-number"><strong>{row.valueLabel}</strong><small>{share}% share</small></span>
              </button>
            )
          })}
        </div>
      ) : <div className="inv56-value-empty">No inventory valuation records are available yet.</div>}

      {tooltip && <div className="inv56-tooltip" style={{ left: clamp(tooltip.x + 14, 12, window.innerWidth - 280), top: Math.max(12, tooltip.y - 110) }}><strong>{tooltip.title}</strong>{tooltip.lines.map((line) => <span key={line}>{line}</span>)}</div>}
    </div>
  )
}
