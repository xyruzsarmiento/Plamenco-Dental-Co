import { useMemo, useState } from 'react'

type ExpenseMonthRow = { label: string; value: number }
type Props = { rows: ExpenseMonthRow[]; formatter: (value: number) => string }
type HoverState = { index: number; x: number; y: number } | null

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function ExpenseMonthlyBarsV75({ rows, formatter }: Props) {
  const [hovered, setHovered] = useState<HoverState>(null)
  const total = useMemo(() => rows.reduce((sum, row) => sum + row.value, 0), [rows])
  const maxValue = Math.max(0, ...rows.map((row) => row.value))
  const peak = useMemo(
    () => rows.reduce((best, row, index) => row.value > best.row.value ? { row, index } : best, { row: rows[0] ?? { label: '—', value: 0 }, index: 0 }),
    [rows],
  )
  const active = hovered ? rows[hovered.index] : null

  return (
    <div className="exp75" onMouseLeave={() => setHovered(null)}>
      <div className="exp75-summary">
        <div>
          <span>Recorded this year</span>
          <strong>{formatter(total)}</strong>
        </div>
        <div>
          <span>Highest month</span>
          <strong>{peak.row.value > 0 ? peak.row.label : 'No activity'}</strong>
          <small>{peak.row.value > 0 ? formatter(peak.row.value) : 'No recorded spend'}</small>
        </div>
      </div>

      <div className="exp75-chart-shell">
        <div className="exp75-chart-heading">
          <div>
            <span>Monthly distribution</span>
            <strong>Operating costs by month</strong>
          </div>
          <div className="exp75-selected">
            <span>{active ? active.label : 'Selected month'}</span>
            <strong>{active ? formatter(active.value) : 'Hover a bar'}</strong>
          </div>
        </div>

        <div className="exp75-chart" role="img" aria-label="Monthly operating costs bar chart">
          {rows.map((row, index) => {
            const height = maxValue > 0 ? (row.value / maxValue) * 100 : 0
            const isActive = hovered?.index === index
            return (
              <button
                key={`${row.label}-${index}`}
                type="button"
                className={`exp75-column${isActive ? ' is-active' : ''}`}
                aria-label={`${row.label}: ${formatter(row.value)}`}
                onMouseEnter={(event) => setHovered({ index, x: event.clientX, y: event.clientY })}
                onMouseMove={(event) => setHovered({ index, x: event.clientX, y: event.clientY })}
                onFocus={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setHovered({ index, x: rect.left + rect.width / 2, y: rect.top + 20 })
                }}
                onBlur={() => setHovered(null)}
              >
                <span className="exp75-plot">
                  <span className="exp75-grid-line is-top" />
                  <span className="exp75-grid-line is-mid" />
                  <span className="exp75-bar-wrap">
                    <span
                      className={`exp75-bar${row.value === 0 ? ' is-zero' : ''}`}
                      style={{ height: row.value > 0 ? `${Math.max(9, height)}%` : '4px' }}
                    />
                  </span>
                </span>
                <span className="exp75-label">{row.label}</span>
              </button>
            )
          })}
        </div>

        {hovered && active && (
          <div
            className="exp75-tooltip"
            style={{
              left: clamp(hovered.x + 14, 12, typeof window !== 'undefined' ? window.innerWidth - 245 : hovered.x + 14),
              top: Math.max(12, hovered.y - 86),
            }}
          >
            <span>Operating costs</span>
            <strong>{active.label}</strong>
            <b>{formatter(active.value)}</b>
          </div>
        )}
      </div>
    </div>
  )
}
