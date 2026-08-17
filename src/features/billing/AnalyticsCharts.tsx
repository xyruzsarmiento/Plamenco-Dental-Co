import { useMemo } from 'react'
import { getStoredPayments, getStoredInvoices } from './billingStore'

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

interface RevenuePoint {
  date: string
  amount: number
  formatted: string
}

export function RevenueChart() {
  const data: RevenuePoint[] = useMemo(() => {
    const payments = getStoredPayments()

    if (payments.length === 0) {
      return []
    }

    // Group payments by date
    const grouped = new Map<string, number>()
    payments.forEach((p) => {
      const existing = grouped.get(p.date) || 0
      grouped.set(p.date, existing + p.amountCents)
    })

    // Convert to sorted array
    return Array.from(grouped.entries())
      .map(([date, amount]) => ({
        date,
        amount,
        formatted: formatDate(date),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30) // Last 30 days
  }, [])

  if (data.length === 0) {
    return (
      <div className="analytics-card chart-empty-state">
        <div className="empty-state-content">
          <p className="empty-state-title">No payment data</p>
          <p className="empty-state-text">Payments will appear here as they are recorded.</p>
        </div>
      </div>
    )
  }

  // Calculate max value for scaling
  const maxAmount = Math.max(...data.map((d) => d.amount))
  const chartHeight = 200
  const chartWidth = data.length * 20 + 40
  const padding = 40

  // Create SVG points
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * (chartWidth - 2 * padding) + padding
    const y = chartHeight - (d.amount / maxAmount) * (chartHeight - 60) - 20
    return { ...d, x, y }
  })

  // Create path for area chart
  let pathData = `M ${points[0]?.x || 0} ${chartHeight} `
  points.forEach((p) => {
    pathData += `L ${p.x} ${p.y} `
  })
  pathData += `L ${points[points.length - 1]?.x || chartWidth} ${chartHeight} Z`

  return (
    <div className="analytics-card revenue-chart-card">
      <div className="card-header">
        <h3>Revenue over time</h3>
        <p className="card-description">Last 30 days of payments</p>
      </div>
      <div className="chart-container revenue-chart-container">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="xMinYMin meet"
          className="revenue-chart-svg"
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = chartHeight - fraction * (chartHeight - 60) - 20
            return (
              <line
                key={`grid-${fraction}`}
                x1={padding}
                x2={chartWidth - padding}
                y1={y}
                y2={y}
                stroke="#E8E3D9"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          {/* Y-axis labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const y = chartHeight - fraction * (chartHeight - 60) - 20
            const value = Math.round(fraction * maxAmount)
            return (
              <text
                key={`label-${fraction}`}
                x={padding - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="12"
                fill="#9A783B"
                fontWeight="500"
              >
                {formatCurrency(value)}
              </text>
            )
          })}

          {/* Area fill */}
          <path d={pathData} fill="url(#areaGradient)" opacity="0.8" />

          {/* Area border line */}
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#C6A15B"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Data points */}
          {points.map((p, i) => (
            <circle
              key={`point-${i}`}
              cx={p.x}
              cy={p.y}
              r="4"
              fill="#FFFFFF"
              stroke="#C6A15B"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#C6A15B" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#C6A15B" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* X-axis */}
          <line
            x1={padding}
            x2={chartWidth - padding}
            y1={chartHeight - 20}
            y2={chartHeight - 20}
            stroke="#9A783B"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* X-axis labels below chart */}
        <div className="chart-x-labels">
          {points.map((p, i) => (
            <div
              key={`date-${i}`}
              className="x-label"
              style={{
                left: `calc(${(p.x / chartWidth) * 100}% - 20px)`,
              }}
            >
              <small>{p.formatted}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PaymentStatusChart() {
  const { total, paid, partial, unpaid } = useMemo(() => {
    const invoices = getStoredInvoices()

    return {
      total: invoices.length,
      paid: invoices.filter((i) => i.status === 'paid').length,
      partial: invoices.filter((i) => i.status === 'partially_paid').length,
      unpaid: invoices.filter((i) => i.status === 'unpaid').length,
    }
  }, [])

  if (total === 0) {
    return (
      <div className="analytics-card chart-empty-state">
        <div className="empty-state-content">
          <p className="empty-state-title">No invoice data</p>
          <p className="empty-state-text">Invoices will appear here as they are created.</p>
        </div>
      </div>
    )
  }

  const chartSize = 160
  const radius = chartSize / 2 - 15
  const cx = chartSize / 2
  const cy = chartSize / 2

  // Create donut segments
  const angles = [
    (paid / total) * 360,
    ((paid + partial) / total) * 360 - (paid / total) * 360,
    ((paid + partial + unpaid) / total) * 360 - ((paid + partial) / total) * 360,
  ]

  const colors = ['#2A5F4A', '#8B5A2B', '#C6A15B']
  const labels = [
    { label: 'Paid', count: paid, color: '#2A5F4A' },
    { label: 'Partially paid', count: partial, color: '#8B5A2B' },
    { label: 'Unpaid', count: unpaid, color: '#C6A15B' },
  ]

  function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    }
  }

  function describeArc(x: number, y: number, r: number, startAngle: number, endAngle: number) {
    const start = polarToCartesian(x, y, r, endAngle)
    const end = polarToCartesian(x, y, r, startAngle)
    const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
    return [
      'M',
      start.x,
      start.y,
      'A',
      r,
      r,
      0,
      largeArc,
      0,
      end.x,
      end.y,
    ].join(' ')
  }

  let currentAngle = 0
  const paths = angles.map((angle, i) => {
    const path = describeArc(cx, cy, radius, currentAngle, currentAngle + angle)
    const result = { path, color: colors[i], angle, start: currentAngle }
    currentAngle += angle
    return result
  })

  return (
    <div className="analytics-card status-chart-card">
      <div className="card-header">
        <h3>Payment status</h3>
        <p className="card-description">Invoice breakdown</p>
      </div>

      <div className="chart-container status-chart-container">
        <div className="donut-chart-wrapper">
          <svg viewBox={`0 0 ${chartSize} ${chartSize}`} className="status-chart-svg">
            {/* Donut segments */}
            {paths.map((seg, i) => (
              <path
                key={`segment-${i}`}
                d={seg.path}
                fill={seg.color}
                stroke="white"
                strokeWidth="2"
              />
            ))}

            {/* Center circle for donut effect */}
            <circle cx={cx} cy={cy} r={radius - 20} fill="white" />

            {/* Total count in center */}
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="20"
              fontWeight="700"
              fill="#25231F"
            >
              {total}
            </text>
            <text
              x={cx}
              y={cy + 18}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="12"
              fill="#9A783B"
            >
              invoices
            </text>
          </svg>
        </div>

        <div className="chart-legend">
          {labels.map((item) => (
            <div key={item.label} className="legend-item">
              <span
                className="legend-dot"
                style={{ background: item.color }}
              />
              <div className="legend-content">
                <p className="legend-label">{item.label}</p>
                <strong className="legend-value">{item.count}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
