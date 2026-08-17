import { Download, FileText, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import { getStoredAppointments } from '../features/appointments/appointmentStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredPayments } from '../features/billing/billingStore'
import { getStoredServices } from '../features/services/serviceStore'

const branchOptions = [
  { value: 'all', label: 'All branches' },
  { value: 'Pulilan', label: 'Pulilan' },
  { value: 'Plaridel', label: 'Plaridel' },
]

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked in' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
]

const statusColors: Record<string, string> = {
  pending: '#d3a55a',
  confirmed: '#5f7f76',
  checked_in: '#8b6833',
  in_progress: '#336b7a',
  completed: '#2d6a52',
  cancelled: '#b7594d',
  no_show: '#8b5e3c',
}

const branchNames = new Set(branchOptions.map((option) => option.value).filter((value) => value !== 'all'))

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getDateRangeBounds(dates: string[]) {
  const validDates = dates.filter(Boolean).sort()
  if (!validDates.length) {
    const today = new Date().toISOString().slice(0, 10)
    return { startDate: today, endDate: today }
  }
  return {
    startDate: validDates[0],
    endDate: validDates[validDates.length - 1],
  }
}

function formatCsv(rows: Record<string, string | number>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]

  rows.forEach((row) => {
    lines.push(
      headers
        .map((header) => {
          const value = row[header]
          const safe = String(value ?? '').replace(/"/g, '""')
          return `"${safe}"`
        })
        .join(','),
    )
  })

  return lines.join('\n')
}

function createPdfDocument(title: string, lines: string[]) {
  const content = lines.map((line) => `${line}\n`).join('')
  const stream = `BT\n/F1 12 Tf\n50 760 Td\n(${title}) Tj\n0 -20 Td\n(${content.replace(/\(/g, '\\(').replace(/\)/g, '\\)')}) Tj\nET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]

  objects.forEach((object, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return pdf
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function getSeriesPath(values: number[], width: number, height: number, padding: number) {
  if (!values.length) return ''
  const max = Math.max(...values, 1)
  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1)
      const y = height - padding - (value / max) * (height - padding * 2)
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')
}

function getAreaPath(values: number[], width: number, height: number, padding: number) {
  const line = getSeriesPath(values, width, height, padding)
  if (!line) return ''
  const firstX = padding
  const lastX = width - padding
  return `${line} L ${lastX} ${height - padding} L ${firstX} ${height - padding} Z`
}

function buildDateSeries(items: Array<{ date: string; value: number }>, rangeStart: string, rangeEnd: string, formatLabel: boolean) {
  const start = new Date(`${rangeStart}T00:00:00`)
  const end = new Date(`${rangeEnd}T00:00:00`)
  const daysBetween = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
  const map = new Map<string, number>()

  items.forEach((item) => {
    map.set(item.date, (map.get(item.date) ?? 0) + item.value)
  })

  const series = Array.from({ length: daysBetween }, (_, index) => {
    const current = new Date(start)
    current.setDate(start.getDate() + index)
    const key = current.toISOString().slice(0, 10)
    return {
      label: formatLabel ? formatDate(key) : key.slice(5),
      value: map.get(key) ?? 0,
    }
  })

  return series
}

function statusDonutSegments(counts: Record<string, number>) {
  const statusKeys = Object.keys(statusColors)
  const total = statusKeys.reduce((sum, key) => sum + (counts[key] ?? 0), 0)

  if (!total) return ''

  let start = 0
  return statusKeys
    .filter((key) => (counts[key] ?? 0) > 0)
    .map((key) => {
      const fraction = (counts[key] ?? 0) / total
      const end = start + fraction
      const segment = `${statusColors[key]} ${start * 100}% ${end * 100}%`
      start = end
      return segment
    })
    .join(', ')
}

export function ReportsPage() {
  const { user } = useAuth()
  const canExport = user?.role === 'admin'
  const appointments = useMemo(() => getStoredAppointments(), [])
  const patients = useMemo(() => getStoredPatients(), [])
  const payments = useMemo(() => getStoredPayments(), [])
  const services = useMemo(() => getStoredServices(), [])

  const allDates = [
    ...appointments.map((item) => item.date),
    ...payments.map((item) => item.date),
    ...patients.map((item) => item.registrationDate),
  ].filter(Boolean)

  const defaultRange = getDateRangeBounds(allDates)
  const [startDate, setStartDate] = useState(defaultRange.startDate)
  const [endDate, setEndDate] = useState(defaultRange.endDate)
  const [branch, setBranch] = useState('all')
  const [serviceId, setServiceId] = useState('all')
  const [status, setStatus] = useState('all')

  const serviceOptions = useMemo(
    () => [
      { value: 'all', label: 'All services' },
      ...services.map((service) => ({ value: service.id, label: service.name })),
    ],
    [services],
  )

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      const matchesDate = appointment.date >= startDate && appointment.date <= endDate
      const matchesService = serviceId === 'all' || appointment.serviceId === serviceId
      const matchesStatus = status === 'all' || appointment.status === status
      const matchesBranch = branch === 'all' || branchNames.has(branch)
      return matchesDate && matchesService && matchesStatus && matchesBranch
    })
  }, [appointments, branch, endDate, serviceId, startDate, status])

  const filteredPayments = useMemo(() => {
    const appointmentDates = new Set(filteredAppointments.map((appointment) => appointment.date))
    return payments.filter((payment) => {
      const matchesDate = payment.date >= startDate && payment.date <= endDate
      const matchesByAppointment = !appointmentDates.size || appointmentDates.has(payment.date)
      return matchesDate && matchesByAppointment
    })
  }, [filteredAppointments, endDate, payments, startDate])

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => patient.registrationDate >= startDate && patient.registrationDate <= endDate)
  }, [endDate, patients, startDate])

  const appointmentTrend = useMemo(() => {
    const dateSeries = buildDateSeries(
      filteredAppointments.map((appointment) => ({ date: appointment.date, value: 1 })),
      startDate,
      endDate,
      true,
    )
    return dateSeries
  }, [endDate, filteredAppointments, startDate])

  const revenueTrend = useMemo(() => {
    const series = buildDateSeries(
      filteredPayments.map((payment) => ({ date: payment.date, value: payment.amountCents })),
      startDate,
      endDate,
      true,
    )
    return series
  }, [endDate, filteredPayments, startDate])

  const serviceBreakdown = useMemo(() => {
    const grouped = new Map<string, { name: string; count: number; revenue: number }>()

    filteredAppointments.forEach((appointment) => {
      const service = services.find((entry) => entry.id === appointment.serviceId)
      const key = appointment.serviceId
      const current = grouped.get(key) ?? { name: service?.name ?? 'Unknown service', count: 0, revenue: 0 }
      current.count += 1
      current.revenue += service?.price ?? 0
      grouped.set(key, current)
    })

    return [...grouped.values()].sort((a, b) => b.count - a.count || b.revenue - a.revenue).slice(0, 5)
  }, [filteredAppointments, services])

  const patientGrowth = useMemo(() => {
    const series = new Map<string, number>()

    filteredPatients.forEach((patient) => {
      const month = patient.registrationDate.slice(0, 7)
      series.set(month, (series.get(month) ?? 0) + 1)
    })

    const entries = [...series.entries()].sort(([a], [b]) => a.localeCompare(b))
    return entries.map(([label, value]) => ({ label, value }))
  }, [filteredPatients])

  const statusCounts = useMemo(() => {
    return filteredAppointments.reduce<Record<string, number>>(
      (accumulator, appointment) => {
        accumulator[appointment.status] = (accumulator[appointment.status] ?? 0) + 1
        return accumulator
      },
      { pending: 0, confirmed: 0, checked_in: 0, in_progress: 0, completed: 0, cancelled: 0, no_show: 0 },
    )
  }, [filteredAppointments])

  const totalRevenue = filteredPayments.reduce((sum, payment) => sum + payment.amountCents, 0)
  const totalAppointments = filteredAppointments.length
  const completedAppointments = filteredAppointments.filter((appointment) => appointment.status === 'completed').length
  const summaryPatients = filteredPatients.length
  const avgRevenuePerVisit = totalAppointments > 0 ? totalRevenue / totalAppointments : 0

  const hasAnyData = totalAppointments > 0 || filteredPayments.length > 0 || summaryPatients > 0
  const donutGradient = statusDonutSegments(statusCounts)

  const appointmentPath = getSeriesPath(
    appointmentTrend.map((entry) => entry.value),
    520,
    180,
    24,
  )
  const appointmentArea = getAreaPath(
    appointmentTrend.map((entry) => entry.value),
    520,
    180,
    24,
  )
  const patientPath = getSeriesPath(
    patientGrowth.map((entry) => entry.value),
    520,
    180,
    24,
  )
  const revenueMax = Math.max(...revenueTrend.map((entry) => entry.value), 1)
  const serviceMax = Math.max(...serviceBreakdown.map((item) => item.count), 1)

  const handleExportCsv = () => {
    if (!canExport) return

    const rowData = [
      { 
        period: `${startDate} to ${endDate}`,
        totalRevenue: totalRevenue,
        totalAppointments,
        completedAppointments,
        totalPatients: summaryPatients,
      },
      ...serviceBreakdown.map((service) => ({
        period: `${startDate} to ${endDate}`,
        service: service.name,
        count: service.count,
        revenue: service.revenue,
      })),
    ]

    downloadBlob('clinic-analytics.csv', formatCsv(rowData), 'text/csv;charset=utf-8;')
  }

  const handleExportPdf = () => {
    if (!canExport) return

    const lines = [
      `Plamenco Dental Co — Reports & Analytics`,
      `Period: ${startDate} to ${endDate}`,
      `Revenue: ${formatCurrency(totalRevenue)}`,
      `Appointments: ${totalAppointments}`,
      `Completed visits: ${completedAppointments}`,
      `Patients: ${summaryPatients}`,
      ...serviceBreakdown.map((service) => `${service.name}: ${service.count} visits • ${formatCurrency(service.revenue)}`),
    ]

    downloadBlob('clinic-analytics.pdf', createPdfDocument('Plamenco Dental Co — Reports & Analytics', lines), 'application/pdf')
  }

  return (
    <section className="page-stack reports-analytics-page">
      <div className="section-header reports-header">
        <div>
          <span className="eyebrow">Admin analytics</span>
          <h2>Reports &amp; Analytics</h2>
          <p>Clinic performance and operational insights</p>
        </div>

        {canExport && (
          <div className="report-export-actions">
            <Button variant="secondary" size="sm" icon={<Download size={14} />} onClick={handleExportCsv}>
              CSV
            </Button>
            <Button variant="secondary" size="sm" icon={<FileText size={14} />} onClick={handleExportPdf}>
              PDF
            </Button>
          </div>
        )}
      </div>

      <div className="reports-filter-panel panel">
        <div className="reports-filter-grid">
          <label className="report-control">
            <span>Start date</span>
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} min={defaultRange.startDate} max={defaultRange.endDate} />
          </label>

          <label className="report-control">
            <span>End date</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} min={defaultRange.startDate} max={defaultRange.endDate} />
          </label>

          <label className="report-control">
            <span>Branch</span>
            <select value={branch} onChange={(event) => setBranch(event.target.value)}>
              {branchOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="report-control">
            <span>Service</span>
            <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
              {serviceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="report-control">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="panel chart-panel chart-empty-panel">
          <div className="chart-empty-state">
            <TrendingUp size={28} />
            <h3>No data available for this period.</h3>
            <p>Once appointments, payments, or patient records are created, the analytics workspace will populate automatically.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="report-summary-grid">
            <article className="summary-kpi">
              <span>Total revenue</span>
              <strong>{formatCurrency(totalRevenue)}</strong>
              <small>{filteredPayments.length} payment entries</small>
            </article>
            <article className="summary-kpi">
              <span>Appointments</span>
              <strong>{totalAppointments}</strong>
              <small>{completedAppointments} completed</small>
            </article>
            <article className="summary-kpi">
              <span>Patients</span>
              <strong>{summaryPatients}</strong>
              <small>registered in period</small>
            </article>
            <article className="summary-kpi">
              <span>Avg. revenue / visit</span>
              <strong>{formatCurrency(avgRevenuePerVisit)}</strong>
              <small>based on selected activity</small>
            </article>
          </div>

          <div className="analytics-grid">
            <article className="panel chart-panel chart-panel-wide">
              <div className="chart-header">
                <div>
                  <span className="chart-kicker">Appointments</span>
                  <h3>Appointments over time</h3>
                </div>
              </div>

              {appointmentTrend.every((entry) => entry.value === 0) ? (
                <div className="chart-empty-state compact">
                  <p>No appointment data available for this period.</p>
                </div>
              ) : (
                <div className="chart-svg-wrap">
                  <svg viewBox="0 0 520 180" preserveAspectRatio="none" className="chart-svg" role="img" aria-label="Appointments over time chart">
                    <defs>
                      <linearGradient id="appointmentsGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="rgba(183, 153, 96, 0.45)" />
                        <stop offset="100%" stopColor="rgba(183, 153, 96, 0)" />
                      </linearGradient>
                    </defs>
                    <path d={appointmentArea} fill="url(#appointmentsGradient)" />
                    <path d={appointmentPath} fill="none" stroke="#8b6833" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                  <div className="chart-labels">
                    {appointmentTrend.slice(0, 6).map((entry) => (
                      <span key={entry.label}>{entry.label}</span>
                    ))}
                  </div>
                </div>
              )}
            </article>

            <article className="panel chart-panel">
              <div className="chart-header">
                <div>
                  <span className="chart-kicker">Distribution</span>
                  <h3>Appointment status</h3>
                </div>
              </div>

              {Object.values(statusCounts).every((count) => count === 0) ? (
                <div className="chart-empty-state compact">
                  <p>No appointment status data available for this period.</p>
                </div>
              ) : (
                <div className="donut-wrap">
                  <div className="donut-chart" style={{ background: `conic-gradient(${donutGradient})` }} aria-label="Appointment status donut chart">
                    <div className="donut-center">
                      <strong>{totalAppointments}</strong>
                      <span>Visits</span>
                    </div>
                  </div>

                  <div className="legend-list">
                    {Object.entries(statusColors).map(([key, color]) => (
                      <div className="legend-item" key={key}>
                        <span className="legend-swatch" style={{ background: color }} />
                        <span>{key.replace('_', ' ')}</span>
                        <strong>{statusCounts[key] ?? 0}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>

            <article className="panel chart-panel chart-panel-wide">
              <div className="chart-header">
                <div>
                  <span className="chart-kicker">Revenue</span>
                  <h3>Revenue over time</h3>
                </div>
              </div>

              {revenueTrend.every((entry) => entry.value === 0) ? (
                <div className="chart-empty-state compact">
                  <p>No revenue data available for this period.</p>
                </div>
              ) : (
                <div className="bar-chart">
                  {revenueTrend.map((entry) => (
                    <div className="bar-col" key={entry.label} title={`${entry.label}: ${formatCurrency(entry.value)}`}>
                      <span className="bar-value">{formatCurrency(entry.value)}</span>
                      <div className="bar-track">
                        <span style={{ height: `${Math.max((entry.value / revenueMax) * 100, entry.value > 0 ? 12 : 0)}%` }} />
                      </div>
                      <small>{entry.label}</small>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="panel chart-panel chart-panel-wide">
              <div className="chart-header">
                <div>
                  <span className="chart-kicker">Services</span>
                  <h3>Services performed</h3>
                </div>
              </div>

              {serviceBreakdown.length === 0 ? (
                <div className="chart-empty-state compact">
                  <p>No service activity recorded for this period.</p>
                </div>
              ) : (
                <div className="service-bars">
                  {serviceBreakdown.map((service) => (
                    <div className="service-bar-row" key={service.name}>
                      <div className="service-label-group">
                        <strong>{service.name}</strong>
                        <span>{service.count} visits</span>
                      </div>
                      <div className="service-bar-track">
                        <span style={{ width: `${(service.count / serviceMax) * 100}%` }} />
                      </div>
                      <em>{formatCurrency(service.revenue)}</em>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="panel chart-panel chart-panel-wide">
              <div className="chart-header">
                <div>
                  <span className="chart-kicker">Growth</span>
                  <h3>Patient growth</h3>
                </div>
              </div>

              {patientGrowth.length === 0 ? (
                <div className="chart-empty-state compact">
                  <p>No patient growth data available for this period.</p>
                </div>
              ) : (
                <div className="chart-svg-wrap">
                  <svg viewBox="0 0 520 180" preserveAspectRatio="none" className="chart-svg" role="img" aria-label="Patient growth chart">
                    <path d={patientPath} fill="none" stroke="#a7773d" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                  <div className="chart-labels">
                    {patientGrowth.map((entry) => (
                      <span key={entry.label}>{entry.label.slice(5)}</span>
                    ))}
                  </div>
                </div>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  )
}
