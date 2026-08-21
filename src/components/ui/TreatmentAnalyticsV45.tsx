import { useMemo, useState } from 'react'

type TreatmentAnalyticsRow = {
  label: string
  performed: number
  planned: number
  billedLabel: string
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
    <div className="tx45-tooltip" style={{ left: clamp(state.x + 14, 12, window.innerWidth - 270), top: Math.max(12, state.y - 86) }}>
      <strong>{state.title}</strong>
      {state.lines.map((line) => <span key={line}>{line}</span>)}
    </div>
  )
}

export function MostPerformedTreatmentsV45({ rows }: { rows: TreatmentAnalyticsRow[] }) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const max = Math.max(1, ...rows.map((row) => row.performed))
  const total = rows.reduce((sum, row) => sum + row.performed, 0)
  const top = rows[0]

  return (
    <div className="tx45-chart-shell" onMouseLeave={() => setTooltip(null)}>
      <div className="tx45-chart-summary">
        <div><span>Total performed</span><strong>{total}</strong></div>
        <div><span>Top procedure</span><strong>{top?.label ?? 'No data'}</strong></div>
      </div>
      {rows.length ? (
        <div className="tx45-ranked-list" role="img" aria-label="Most performed treatments">
          {rows.map((row, index) => (
            <button
              type="button"
              key={`${row.label}-${index}`}
              className="tx45-ranked-row"
              onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Performed: ${row.performed}`, `Billed: ${row.billedLabel}`] })}
              onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Performed: ${row.performed}`, `Billed: ${row.billedLabel}`] })}
              onFocus={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setTooltip({ x: rect.left + rect.width / 2, y: rect.top, title: row.label, lines: [`Performed: ${row.performed}`, `Billed: ${row.billedLabel}`] })
              }}
              onBlur={() => setTooltip(null)}
            >
              <span className="tx45-rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="tx45-ranked-main">
                <span className="tx45-ranked-copy"><strong>{row.label}</strong><small>{row.billedLabel} billed</small></span>
                <span className="tx45-ranked-track"><i style={{ width: `${Math.max(row.performed ? 8 : 0, (row.performed / max) * 100)}%` }} /></span>
              </span>
              <span className="tx45-ranked-value"><strong>{row.performed}</strong><small>performed</small></span>
            </button>
          ))}
        </div>
      ) : <div className="tx45-empty">No performed treatments recorded for this month.</div>}
      <Tooltip state={tooltip} />
    </div>
  )
}

export function PlannedVsPerformedV45({ rows }: { rows: TreatmentAnalyticsRow[] }) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const max = Math.max(1, ...rows.flatMap((row) => [row.planned, row.performed]))
  const plannedTotal = useMemo(() => rows.reduce((sum, row) => sum + row.planned, 0), [rows])
  const performedTotal = useMemo(() => rows.reduce((sum, row) => sum + row.performed, 0), [rows])
  const completion = plannedTotal > 0 ? Math.min(100, Math.round((performedTotal / plannedTotal) * 100)) : null

  return (
    <div className="tx45-chart-shell" onMouseLeave={() => setTooltip(null)}>
      <div className="tx45-pipeline-kpis">
        <div><span>Planned</span><strong>{plannedTotal}</strong></div>
        <div><span>Performed</span><strong>{performedTotal}</strong></div>
        <div><span>Completion</span><strong>{completion == null ? '—' : `${completion}%`}</strong></div>
      </div>
      <div className="tx45-legend"><span><i className="is-planned" /> Planned</span><span><i className="is-performed" /> Performed</span></div>
      {rows.length ? (
        <div className="tx45-compare-list" role="img" aria-label="Planned versus performed treatments">
          {rows.map((row, index) => (
            <button
              type="button"
              key={`${row.label}-${index}`}
              className="tx45-compare-row"
              onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Planned: ${row.planned}`, `Performed: ${row.performed}`] })}
              onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Planned: ${row.planned}`, `Performed: ${row.performed}`] })}
              onFocus={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setTooltip({ x: rect.left + rect.width / 2, y: rect.top, title: row.label, lines: [`Planned: ${row.planned}`, `Performed: ${row.performed}`] })
              }}
              onBlur={() => setTooltip(null)}
            >
              <span className="tx45-compare-label">{row.label}</span>
              <span className="tx45-compare-bars">
                <span><i className="is-planned" style={{ width: `${Math.max(row.planned ? 6 : 0, (row.planned / max) * 100)}%` }} /></span>
                <span><i className="is-performed" style={{ width: `${Math.max(row.performed ? 6 : 0, (row.performed / max) * 100)}%` }} /></span>
              </span>
              <span className="tx45-compare-values"><strong>{row.planned}</strong><strong>{row.performed}</strong></span>
            </button>
          ))}
        </div>
      ) : <div className="tx45-empty">No planned or performed treatment data recorded for this month.</div>}
      <Tooltip state={tooltip} />
    </div>
  )
}
