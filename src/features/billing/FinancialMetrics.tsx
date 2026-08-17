import { useMemo } from 'react'
import { TrendingUp, AlertCircle, CheckCircle2, Zap } from 'lucide-react'
import { getStoredInvoices, getStoredPayments } from './billingStore'

type Metric = {
  label: string
  value: string
  subtext: string
  icon: React.ReactNode
  tone: 'positive' | 'neutral' | 'caution' | 'data'
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(cents / 100)
}

export function FinancialMetrics() {
  const metrics: Metric[] = useMemo(() => {
    const invoices = getStoredInvoices()
    const payments = getStoredPayments()

    if (invoices.length === 0) {
      return [
        {
          label: 'Total collected',
          value: '₱0.00',
          subtext: 'No payments yet',
          icon: <CheckCircle2 size={18} />,
          tone: 'neutral',
        },
        {
          label: 'Outstanding balance',
          value: '₱0.00',
          subtext: 'No pending amounts',
          icon: <AlertCircle size={18} />,
          tone: 'neutral',
        },
        {
          label: 'Paid invoices',
          value: '0',
          subtext: 'No completed invoices',
          icon: <CheckCircle2 size={18} />,
          tone: 'neutral',
        },
        {
          label: 'Pending confirmation',
          value: '0',
          subtext: 'No pending items',
          icon: <Zap size={18} />,
          tone: 'neutral',
        },
      ]
    }

    const totalCollected = payments.reduce((sum, p) => sum + p.amountCents, 0)
    const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balanceCents, 0)
    const paidInvoices = invoices.filter((inv) => inv.status === 'paid').length
    const partiallyPaid = invoices.filter((inv) => inv.status === 'partially_paid').length

    return [
      {
        label: 'Total collected',
        value: formatCurrency(totalCollected),
        subtext: `From ${payments.length} payments`,
        icon: <CheckCircle2 size={18} />,
        tone: 'positive',
      },
      {
        label: 'Outstanding balance',
        value: formatCurrency(totalOutstanding),
        subtext: `From ${invoices.filter((inv) => inv.balanceCents > 0).length} invoices`,
        icon: <AlertCircle size={18} />,
        tone: totalOutstanding > 0 ? 'caution' : 'neutral',
      },
      {
        label: 'Paid invoices',
        value: String(paidInvoices),
        subtext: `Of ${invoices.length} total`,
        icon: <CheckCircle2 size={18} />,
        tone: 'positive',
      },
      {
        label: 'Partially paid',
        value: String(partiallyPaid),
        subtext: 'Awaiting full payment',
        icon: <TrendingUp size={18} />,
        tone: 'data',
      },
    ]
  }, [])

  const bgTones = {
    positive: '#F0F8F4',
    neutral: '#F5F3F0',
    caution: '#FBF5F0',
    data: '#F0F4F8',
  }

  const textTones = {
    positive: '#2A5F4A',
    neutral: '#6F6A61',
    caution: '#8B5A2B',
    data: '#2C4563',
  }

  return (
    <div className="metrics-grid">
      {metrics.map((metric, index) => (
        <article
          key={index}
          className="metric-card"
          style={{
            background: bgTones[metric.tone],
            borderLeft: `3px solid ${textTones[metric.tone]}`,
          }}
        >
          <div className="metric-header">
            <div
              className="metric-icon"
              style={{ color: textTones[metric.tone] }}
            >
              {metric.icon}
            </div>
            <p className="metric-label">{metric.label}</p>
          </div>
          <div className="metric-content">
            <strong className="metric-value" style={{ color: textTones[metric.tone] }}>
              {metric.value}
            </strong>
            <small className="metric-subtext">{metric.subtext}</small>
          </div>
        </article>
      ))}
    </div>
  )
}
