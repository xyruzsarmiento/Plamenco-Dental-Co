import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatExpenseCurrency, getExpenses, type Expense } from '../../features/expenses/expenseStore'

type MonthPoint = {
  key: string
  label: string
  value: number
}

function manilaYearMonth() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function isVisibleExpense(expense: Expense, year: string, branch: string) {
  if (!expense.expenseDate?.startsWith(year)) return false
  if (expense.status === 'void' || expense.status === 'cancelled') return false
  if (branch === 'all') return true
  if (branch === 'clinic_wide') return expense.scope === 'clinic_wide'
  return expense.branchId === branch
}

function monthlyOperatingCosts(expenses: Expense[], branch: string) {
  const currentYearMonth = manilaYearMonth()
  const year = currentYearMonth.slice(0, 4)
  const currentMonth = Number(currentYearMonth.slice(5, 7))

  return Array.from({ length: currentMonth }, (_, index): MonthPoint => {
    const month = String(index + 1).padStart(2, '0')
    const key = `${year}-${month}`
    const value = expenses
      .filter((expense) => isVisibleExpense(expense, year, branch) && expense.expenseDate.startsWith(key))
      .reduce((sum, expense) => sum + Math.max(0, expense.totalCents ?? 0), 0)

    return {
      key,
      label: new Date(`${key}-01T00:00:00+08:00`).toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
      }),
      value,
    }
  })
}

function OperatingCostChart({ data }: { data: MonthPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const width = 1120
  const height = 330
  const left = 76
  const right = 24
  const top = 28
  const bottom = 52
  const usableWidth = width - left - right
  const usableHeight = height - top - bottom
  const rawMax = Math.max(0, ...data.map((item) => item.value))
  const max = rawMax > 0 ? rawMax * 1.12 : 1
  const points = data.map((item, index) => ({
    ...item,
    x: data.length <= 1 ? left + usableWidth / 2 : left + (usableWidth * index) / (data.length - 1),
    y: top + usableHeight - (item.value / max) * usableHeight,
  }))
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const area = points.length
    ? `${line} L ${points[points.length - 1].x} ${top + usableHeight} L ${points[0].x} ${top + usableHeight} Z`
    : ''
  const active = activeIndex === null ? null : points[activeIndex]
  const yTicks = [1, .75, .5, .25, 0]

  return (
    <div className="expense-trend-v115">
      <div className="expense-trend-v115-chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly operating costs for the current year">
          <defs>
            <linearGradient id="expense-trend-v115-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity=".22" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity=".025" />
            </linearGradient>
          </defs>

          {yTicks.map((ratio) => {
            const y = top + usableHeight * (1 - ratio)
            return (
              <g key={ratio}>
                <line x1={left} x2={width - right} y1={y} y2={y} className="expense-trend-v115-grid" />
                <text x={left - 12} y={y + 4} textAnchor="end" className="expense-trend-v115-ylabel">
                  {ratio === 0 ? '₱0' : formatExpenseCurrency(rawMax * ratio).replace('.00', '')}
                </text>
              </g>
            )
          })}

          {area && <path d={area} className="expense-trend-v115-area" />}
          {line && <path d={line} className="expense-trend-v115-line" />}

          {active && (
            <line
              x1={active.x}
              x2={active.x}
              y1={top}
              y2={top + usableHeight}
              className="expense-trend-v115-guide"
            />
          )}

          {points.map((point, index) => (
            <g key={point.key}>
              <circle
                cx={point.x}
                cy={point.y}
                r="16"
                className="expense-trend-v115-hit"
                tabIndex={0}
                aria-label={`${point.label}: ${formatExpenseCurrency(point.value)}`}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
              />
              <circle
                cx={point.x}
                cy={point.y}
                r={activeIndex === index ? 6 : 4.5}
                className={`expense-trend-v115-dot ${activeIndex === index ? 'is-active' : ''}`}
              />
              <text x={point.x} y={height - 18} textAnchor="middle" className="expense-trend-v115-xlabel">
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {active && (
        <div
          className="expense-trend-v115-tooltip"
          style={{ left: `${(active.x / width) * 100}%`, top: `${Math.max(5, ((active.y - 2) / height) * 100)}%` }}
        >
          <span>{active.label}</span>
          <strong>{formatExpenseCurrency(active.value)}</strong>
          <small>Recorded operating costs</small>
        </div>
      )}
    </div>
  )
}

export function ExpenseTrendEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [branch, setBranch] = useState('all')
  const [expenses, setExpenses] = useState<Expense[]>([])

  useEffect(() => {
    let lastSignature = ''
    const sync = () => {
      const nextTarget = document.querySelector<HTMLElement>('.ex57-trend')
      if (nextTarget !== target) setTarget(nextTarget)

      const branchSelect = document.querySelector<HTMLSelectElement>('.ex57-filters select')
      const nextBranch = branchSelect?.value ?? 'all'
      setBranch((current) => current === nextBranch ? current : nextBranch)

      const nextExpenses = getExpenses()
      const signature = nextExpenses
        .map((expense) => `${expense.id}:${expense.expenseDate}:${expense.totalCents}:${expense.status}:${expense.branchId ?? ''}:${expense.scope}`)
        .join('|')
      if (signature !== lastSignature) {
        lastSignature = signature
        setExpenses(nextExpenses)
      }
    }

    sync()
    const timer = window.setInterval(sync, 500)
    return () => window.clearInterval(timer)
  }, [target])

  const data = useMemo(() => monthlyOperatingCosts(expenses, branch), [expenses, branch])
  const total = useMemo(() => data.reduce((sum, item) => sum + item.value, 0), [data])

  useEffect(() => {
    const totalNode = document.querySelector<HTMLElement>('.ex57-trend-total strong')
    if (totalNode) totalNode.textContent = formatExpenseCurrency(total)
  }, [total])

  if (!target) return null
  return createPortal(<OperatingCostChart data={data} />, target)
}
