import { useMemo, useState } from 'react'

type ServiceAnalyticsRow = {
  label: string
  performed: number
  planned: number
  billedCents: number
  billedLabel: string
}

type TooltipState = { x: number; y: number; title: string; lines: string[] } | null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function Tooltip({ state }: { state: TooltipState }) {
  if (!state) return null
  return (
    <div className="svc52-tooltip" style={{ left: clamp(state.x + 14, 12, window.innerWidth - 290), top: Math.max(12, state.y - 96) }}>
      <strong>{state.title}</strong>
      {state.lines.map((line) => <span key={line}>{line}</span>)}
    </div>
  )
}

export function MostAvailedServicesV52({ rows }: { rows: ServiceAnalyticsRow[] }) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const max = Math.max(1, ...rows.map((row) => row.performed))
  const totalPerformed = useMemo(() => rows.reduce((sum, row) => sum + row.performed, 0), [rows])
  const topService = rows[0]

  return (
    <div className="svc52-chart" onMouseLeave={() => setTooltip(null)}>
      <div className="svc52-kpis">
        <div><span>Performed this month</span><strong>{totalPerformed}</strong><small>Completed treatment records</small></div>
        <div><span>Top service</span><strong>{topService?.label ?? 'No data'}</strong><small>{topService ? `${topService.performed} performed` : 'No activity recorded'}</small></div>
      </div>
      {rows.length ? <div className="svc52-demand-list" role="img" aria-label="Most availed services">
        {rows.map((row, index) => {
          const share = totalPerformed > 0 ? Math.round((row.performed / totalPerformed) * 100) : 0
          return <button type="button" key={`${row.label}-${index}`} className="svc52-demand-row"
            onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Performed: ${row.performed}`, `Demand share: ${share}%`, `Planned: ${row.planned}`] })}
            onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Performed: ${row.performed}`, `Demand share: ${share}%`, `Planned: ${row.planned}`] })}
            onFocus={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setTooltip({ x: rect.left + rect.width / 2, y: rect.top, title: row.label, lines: [`Performed: ${row.performed}`, `Demand share: ${share}%`, `Planned: ${row.planned}`] }) }}
            onBlur={() => setTooltip(null)}>
            <span className="svc52-rank">{String(index + 1).padStart(2, '0')}</span>
            <span className="svc52-demand-content"><span className="svc52-row-title"><strong>{row.label}</strong><small>{share}% of demand · {row.planned} planned</small></span><span className="svc52-track"><i style={{ width: `${(row.performed / max) * 100}%` }} /></span></span>
            <span className="svc52-row-value"><strong>{row.performed}</strong><small>performed</small></span>
          </button>
        })}
      </div> : <div className="svc52-empty">No performed service activity has been recorded this month.</div>}
      <Tooltip state={tooltip} />
    </div>
  )
}

export function BilledValueByServiceV52({ rows }: { rows: ServiceAnalyticsRow[] }) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const totalBilled = useMemo(() => rows.reduce((sum, row) => sum + row.billedCents, 0), [rows])
  const sortedRows = useMemo(() => [...rows].sort((a, b) => b.billedCents - a.billedCents || b.performed - a.performed), [rows])
  const max = Math.max(1, ...sortedRows.map((row) => row.billedCents))
  const topService = sortedRows.find((row) => row.billedCents > 0) ?? sortedRows[0]
  const totalLabel = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(totalBilled / 100)

  return (
    <div className="svc52-chart svc52-value-chart" onMouseLeave={() => setTooltip(null)}>
      <div className="svc52-kpis svc52-value-kpis">
        <div><span>Billed value</span><strong>{totalLabel}</strong><small>Recorded value this month</small></div>
        <div><span>Top value service</span><strong>{topService?.label ?? 'No data'}</strong><small>{totalBilled > 0 && topService ? topService.billedLabel : 'No billed value recorded yet'}</small></div>
      </div>

      {sortedRows.length ? <div className="svc52-value-list" role="img" aria-label="Billed value by service">
        {sortedRows.map((row, index) => {
          const share = totalBilled > 0 ? Math.round((row.billedCents / totalBilled) * 100) : 0
          const fillWidth = totalBilled > 0 ? (row.billedCents / max) * 100 : 0
          return <button type="button" key={`${row.label}-${index}`} className={`svc52-value-row ${row.billedCents === 0 ? 'is-zero' : ''}`}
            onMouseEnter={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Billed value: ${row.billedLabel}`, `Value share: ${share}%`, `Performed: ${row.performed}`] })}
            onMouseMove={(event) => setTooltip({ x: event.clientX, y: event.clientY, title: row.label, lines: [`Billed value: ${row.billedLabel}`, `Value share: ${share}%`, `Performed: ${row.performed}`] })}
            onFocus={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setTooltip({ x: rect.left + rect.width / 2, y: rect.top, title: row.label, lines: [`Billed value: ${row.billedLabel}`, `Value share: ${share}%`, `Performed: ${row.performed}`] }) }}
            onBlur={() => setTooltip(null)}>
            <span className="svc52-rank">{String(index + 1).padStart(2, '0')}</span>
            <span className="svc52-value-content">
              <span className="svc52-row-title"><strong>{row.label}</strong><small>{row.performed} performed · {share}% of billed value</small></span>
              <span className="svc52-track svc52-value-track"><i style={{ width: `${fillWidth}%` }} />{totalBilled === 0 && <em>No billed value recorded</em>}</span>
            </span>
            <span className="svc52-row-value"><strong>{row.billedLabel}</strong><small>billed</small></span>
          </button>
        })}
      </div> : <div className="svc52-empty">No service activity is available for billed-value analysis.</div>}
      <Tooltip state={tooltip} />
    </div>
  )
}
