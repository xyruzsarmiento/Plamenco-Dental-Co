import { useMemo, useState } from 'react'

type ServiceAnalyticsRow = {
  label: string
  performed: number
  planned: number
  billedCents: number
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
    <div className="svc50-tooltip" style={{ left: clamp(state.x + 14, 12, window.innerWidth - 280), top: Math.max(12, state.y - 92) }}>
      <strong>{state.title}</strong>
      {state.lines.map((line) => <span key={line}>{line}</span>)}
    </div>
  )
}

export function MostAvailedServicesV50({ rows }: { rows: ServiceAnalyticsRow[] }) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const max = Math.max(1, ...rows.map((row) => row.performed))
  const totalPerformed = useMemo(() => rows.reduce((sum, row) => sum + row.performed, 0), [rows])
  const topService = rows[0]

  return (
    <div className="svc50-chart" onMouseLeave={() => setTooltip(null)}>
      <div className="svc50-summary-strip">
        <div><span>Total performed</span><strong>{totalPerformed}</strong></div>
        <div><span>Top service</span><strong>{topService?.label ?? 'No data'}</strong></div>
      </div>

      {rows.length ? (
        <div className="svc50-ranked-list" role="img" aria-label="Most availed services">
          {rows.map((row, index) => {
            const share = totalPerformed > 0 ? Math.round((row.performed / totalPerformed) * 100) : 0
            return (
              <button
                type="button"
                key={`${row.label}-${index}`}
                className="svc50-ranked-row"
                onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Performed: ${row.performed}`, `Share: ${share}%`, `Planned: ${row.planned}`] })}
                onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Performed: ${row.performed}`, `Share: ${share}%`, `Planned: ${row.planned}`] })}
                onFocus={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setTooltip({ x: rect.left + rect.width / 2, y: rect.top, title: row.label, lines: [`Performed: ${row.performed}`, `Share: ${share}%`, `Planned: ${row.planned}`] })
                }}
                onBlur={() => setTooltip(null)}
              >
                <span className="svc50-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="svc50-ranked-main">
                  <span className="svc50-ranked-copy"><strong>{row.label}</strong><small>{share}% of recorded demand · {row.planned} planned</small></span>
                  <span className="svc50-ranked-track"><i style={{ width: `${Math.max(row.performed ? 8 : 0, (row.performed / max) * 100)}%` }} /></span>
                </span>
                <span className="svc50-ranked-value"><strong>{row.performed}</strong><small>performed</small></span>
              </button>
            )
          })}
        </div>
      ) : <div className="svc50-empty">No performed service activity has been recorded this month.</div>}
      <Tooltip state={tooltip} />
    </div>
  )
}

export function BilledValueByServiceV50({ rows }: { rows: ServiceAnalyticsRow[] }) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const max = Math.max(1, ...rows.map((row) => row.billedCents))
  const totalBilled = useMemo(() => rows.reduce((sum, row) => sum + row.billedCents, 0), [rows])
  const topByValue = useMemo(() => [...rows].sort((a, b) => b.billedCents - a.billedCents), [rows])
  const topService = topByValue[0]

  return (
    <div className="svc50-chart" onMouseLeave={() => setTooltip(null)}>
      <div className="svc50-summary-strip">
        <div><span>Total billed value</span><strong>{rows[0]?.billedLabel ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(totalBilled / 100) : '₱0'}</strong></div>
        <div><span>Top value service</span><strong>{topService?.label ?? 'No data'}</strong></div>
      </div>

      {topByValue.length ? (
        <div className="svc50-value-list" role="img" aria-label="Billed value by service">
          {topByValue.map((row, index) => {
            const share = totalBilled > 0 ? Math.round((row.billedCents / totalBilled) * 100) : 0
            return (
              <button
                type="button"
                key={`${row.label}-${index}`}
                className="svc50-value-row"
                onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Billed value: ${row.billedLabel}`, `Share of recorded value: ${share}%`, `Performed: ${row.performed}`] })}
                onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Billed value: ${row.billedLabel}`, `Share of recorded value: ${share}%`, `Performed: ${row.performed}`] })}
                onFocus={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setTooltip({ x: rect.left + rect.width / 2, y: rect.top, title: row.label, lines: [`Billed value: ${row.billedLabel}`, `Share of recorded value: ${share}%`, `Performed: ${row.performed}`] })
                }}
                onBlur={() => setTooltip(null)}
              >
                <span className="svc50-value-head"><strong>{row.label}</strong><b>{row.billedLabel}</b></span>
                <span className="svc50-value-track"><i style={{ width: `${Math.max(row.billedCents ? 8 : 0, (row.billedCents / max) * 100)}%` }} /></span>
                <span className="svc50-value-meta"><small>{row.performed} performed</small><small>{share}% of billed value</small></span>
              </button>
            )
          })}
        </div>
      ) : <div className="svc50-empty">No billed service activity has been recorded this month.</div>}
      <Tooltip state={tooltip} />
    </div>
  )
}
