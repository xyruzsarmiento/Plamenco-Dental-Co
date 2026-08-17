import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Textarea } from '../../components/ui/Textarea'
import { getStoredTreatmentPlans, getStoredTreatments } from '../treatments/treatmentStore'
import { DENTAL_CONDITION_META, type DentalCondition, type DentalToothEntry, type DentalToothStatus } from './dentalChartTypes'
import { getDentalChartForPatient, getDentalChartLayout, upsertDentalTooth } from './dentalChartStore'

type DentalChartProps = {
  patientId: string
  isEditable?: boolean
}

const conditionOptions = Object.entries(DENTAL_CONDITION_META).map(([value, meta]) => ({
  label: meta.label,
  value,
}))

const statusOptions: { label: string; value: DentalToothStatus }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Monitoring', value: 'monitoring' },
  { label: 'Follow-up', value: 'follow_up' },
  { label: 'Completed', value: 'completed' },
]

function getToothState(entry?: DentalToothEntry) {
  if (!entry) {
    return {
      condition: 'healthy' as DentalCondition,
      treatment: '',
      notes: '',
      date: new Date().toISOString().split('T')[0],
      status: 'monitoring' as DentalToothStatus,
    }
  }

  return {
    condition: entry.condition,
    treatment: entry.treatment,
    notes: entry.notes,
    date: entry.date,
    status: entry.status,
  }
}

function ToothSvg({ 
  toothNumber, 
  condition, 
  onClick,
  isUpper,
  isSelected,
}: { 
  toothNumber: number
  condition: DentalCondition
  onClick: () => void
  isUpper: boolean
  isSelected: boolean
}) {
  const meta = DENTAL_CONDITION_META[condition]
  const family = (() => {
    const toothType = toothNumber % 10
    if (toothType === 1 || toothType === 2) return 'incisor'
    if (toothType === 3) return 'canine'
    if (toothType === 4 || toothType === 5) return 'premolar'
    return 'molar'
  })()

  // More realistic tooth paths with proper anatomy
  const crownPath = (() => {
    if (family === 'incisor') {
      return isUpper 
        ? 'M 18 10 Q 15 8 24 8 Q 33 8 30 10 L 28 35 Q 26 38 24 40 Q 22 38 20 35 Z'
        : 'M 18 25 Q 15 23 24 23 Q 33 23 30 25 L 28 45 Q 26 48 24 50 Q 22 48 20 45 Z'
    }
    if (family === 'canine') {
      return isUpper
        ? 'M 22 8 Q 18 9 18 16 L 17 30 Q 20 38 24 42 Q 28 38 31 30 L 30 16 Q 30 9 26 8 Z'
        : 'M 22 22 Q 18 23 18 30 L 17 44 Q 20 52 24 56 Q 28 52 31 44 L 30 30 Q 30 23 26 22 Z'
    }
    if (family === 'premolar') {
      return isUpper
        ? 'M 16 12 Q 12 14 11 20 L 13 34 Q 16 39 22 42 Q 28 39 31 34 L 33 20 Q 32 14 28 12 Z'
        : 'M 16 26 Q 12 28 11 34 L 13 48 Q 16 53 22 56 Q 28 53 31 48 L 33 34 Q 32 28 28 26 Z'
    }
    return isUpper
      ? 'M 10 15 Q 8 17 9 24 L 14 38 Q 18 42 24 44 Q 30 42 34 38 L 39 24 Q 40 17 38 15 Z'
      : 'M 10 29 Q 8 31 9 38 L 14 52 Q 18 56 24 58 Q 30 56 34 52 L 39 38 Q 40 31 38 29 Z'
  })()

  // More detailed and realistic root paths
  const rootPath = (() => {
    if (family === 'incisor') {
      return isUpper
        ? 'M 20 40 Q 19 52 20 62 Q 22 68 24 70 Q 26 68 28 62 Q 29 52 28 40'
        : 'M 20 50 Q 19 62 20 72 Q 22 78 24 80 Q 26 78 28 72 Q 29 62 28 50'
    }
    if (family === 'canine') {
      return isUpper
        ? 'M 22 42 Q 18 55 17 68 Q 18 75 24 78 Q 30 75 31 68 Q 30 55 26 42'
        : 'M 22 56 Q 18 69 17 82 Q 18 89 24 92 Q 30 89 31 82 Q 30 69 26 56'
    }
    if (family === 'premolar') {
      return isUpper
        ? 'M 14 42 Q 13 55 13 68 Q 15 74 22 77 Q 29 74 31 68 Q 31 55 30 42 M 13 68 Q 13 75 22 78 Q 31 75 31 68'
        : 'M 14 56 Q 13 69 13 82 Q 15 88 22 91 Q 29 88 31 82 Q 31 69 30 56'
    }
    return isUpper
      ? 'M 12 44 Q 10 55 10 68 Q 12 75 18 78 Q 24 80 30 78 Q 36 75 38 68 Q 38 55 36 44 M 18 78 Q 14 80 10 85 M 30 78 Q 34 80 38 85'
      : 'M 12 58 Q 10 69 10 82 Q 12 89 18 92 Q 24 94 30 92 Q 36 89 38 82 Q 38 69 36 58 M 18 92 Q 14 94 10 99 M 30 92 Q 34 94 38 99'
  })()

  // More detailed surface representation with cusp/ridge lines for molars
  const surfaceLines = isUpper
    ? family === 'molar' 
      ? 'M 18 28 Q 24 32 24 38 Q 24 32 30 28 M 16 26 Q 22 35 24 38 Q 26 35 32 26'
      : 'M 20 32 H 28 M 22 38 H 26'
    : family === 'molar'
      ? 'M 18 42 Q 24 46 24 52 Q 24 46 30 42 M 16 40 Q 22 49 24 52 Q 26 49 32 40'
      : 'M 20 46 H 28 M 22 52 H 26'

  const conditionOverlay = (() => {
    switch (condition) {
      case 'healthy':
        return <circle cx="42" cy="15" r="5" className="condition-badge healthy-badge" />
      case 'caries':
        return (
          <g>
            <circle cx="42" cy="15" r="6" className="condition-badge caries-badge" />
            <path d="M 42 11 L 42 19 M 38 15 L 46 15" className="cross-mark" strokeWidth="1.5" />
          </g>
        )
      case 'filled':
        return (
          <g>
            <rect x="36" y="10" width="12" height="10" rx="2" className="condition-badge filled-badge" />
            <path d="M 38 15 H 46" className="filled-mark" strokeWidth="1" />
          </g>
        )
      case 'missing':
        return <path d="M 37 11 L 47 19 M 37 19 L 47 11" className="condition-badge missing-badge" strokeWidth="1.5" />
      case 'crown':
        return (
          <g>
            <path d="M 34 11 H 50 L 54 15 L 52 20 H 32 L 30 15 Z" className="condition-badge crown-badge" />
            <path d="M 32 20 L 32 28" className="crown-mark" strokeWidth="1" />
          </g>
        )
      case 'root_canal':
        return (
          <g>
            <path d="M 36 10 L 36 20 M 42 10 L 42 20" className="condition-badge root-canal-badge" strokeWidth="1.5" />
            <path d="M 35 15 H 43" className="root-mark" strokeWidth="1" />
          </g>
        )
      case 'extraction':
        return <path d="M 37 11 L 47 19 M 37 19 L 47 11" className="condition-badge extraction-badge" strokeWidth="2" />
      case 'implant':
        return (
          <g>
            <path d="M 42 10 L 42 24" className="condition-badge implant-badge" strokeWidth="2" />
            <path d="M 36 14 L 48 14 M 36 18 L 48 18" className="implant-mark" strokeWidth="1" />
          </g>
        )
      default:
        return <circle cx="42" cy="15" r="5" className="condition-badge other-badge" />
    }
  })()

  return (
    <button
      type="button"
      className={`tooth-button-new condition-${condition} ${isSelected ? 'is-selected' : ''}`}
      onClick={onClick}
      aria-label={`Tooth ${toothNumber}: ${meta.label}`}
      title={meta.label}
    >
      <svg
        viewBox="0 0 56 100"
        className="tooth-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Tooth base background for realism */}
        <defs>
          <linearGradient id={`toothGradient${toothNumber}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef9f5" />
            <stop offset="100%" stopColor="#ede4d9" />
          </linearGradient>
          <filter id={`toothShade${toothNumber}`}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" />
          </filter>
        </defs>
        
        {/* Crown */}
        <path 
          d={crownPath} 
          className="tooth-shape"
          fill={`url(#toothGradient${toothNumber})`}
          stroke="rgba(150, 140, 130, 0.3)"
          strokeWidth="0.8"
        />
        
        {/* Root */}
        <path 
          d={rootPath} 
          className="tooth-root"
          fill="none"
          stroke="rgba(180, 160, 140, 0.4)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        
        {/* Surface details */}
        <path 
          d={surfaceLines} 
          className="tooth-surface-lines"
          fill="none"
          stroke="rgba(160, 140, 120, 0.25)"
          strokeWidth="0.6"
          strokeLinecap="round"
        />
        
        {/* Condition overlay */}
        <g className="condition-overlay">{conditionOverlay}</g>
        
        {/* Tooth number label */}
        <text 
          x="28" 
          y="60" 
          textAnchor="middle" 
          className="tooth-label"
          fontSize="9"
          fontWeight="600"
          fill="rgba(30, 20, 10, 0.5)"
        >
          {toothNumber}
        </text>
      </svg>
    </button>
  )
}

export function DentalChart({ patientId, isEditable = false }: DentalChartProps) {
  const [chart, setChart] = useState<DentalToothEntry[]>(() => getDentalChartForPatient(patientId))
  const [selectedToothNumber, setSelectedToothNumber] = useState<number | null>(null)
  const [draft, setDraft] = useState(() => ({
    condition: 'healthy' as DentalCondition,
    treatment: '',
    notes: '',
    date: new Date().toISOString().split('T')[0],
    status: 'monitoring' as DentalToothStatus,
  }))

  useEffect(() => {
    setChart(getDentalChartForPatient(patientId))
  }, [patientId])

  const selectedTooth = useMemo(
    () => chart.find((tooth) => tooth.toothNumber === selectedToothNumber),
    [chart, selectedToothNumber]
  )

  const linkedTreatments = useMemo(() => {
    if (selectedToothNumber === null) {
      return []
    }

    return getStoredTreatments()
      .filter((treatment) => treatment.patientId === patientId && treatment.toothNumber === selectedToothNumber)
      .sort((a, b) => new Date(b.treatmentDate).getTime() - new Date(a.treatmentDate).getTime())
  }, [patientId, selectedToothNumber])

  const linkedPlans = useMemo(() => {
    if (linkedTreatments.length === 0) {
      return []
    }

    const treatmentIds = new Set(linkedTreatments.map((treatment) => treatment.id))
    return getStoredTreatmentPlans()
      .filter((plan) => plan.patientId === patientId && plan.treatments.some((id) => treatmentIds.has(id)))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [linkedTreatments, patientId])

  useEffect(() => {
    if (!selectedTooth) {
      return
    }

    setDraft(getToothState(selectedTooth))
  }, [selectedTooth])

  const layout = useMemo(() => getDentalChartLayout(), [])

  function handleOpenTooth(toothNumber: number) {
    const entry = chart.find((tooth) => tooth.toothNumber === toothNumber)
    setSelectedToothNumber(toothNumber)
    setDraft(getToothState(entry))
  }

  function handleSaveTooth() {
    if (selectedToothNumber === null || !isEditable) {
      return
    }

    const updated = upsertDentalTooth(patientId, selectedToothNumber, {
      condition: draft.condition,
      treatment: draft.treatment,
      notes: draft.notes,
      date: draft.date,
      status: draft.status,
    })

    const nextChart = getDentalChartForPatient(patientId)
    setChart(nextChart)
    setSelectedToothNumber(updated.toothNumber)
    setDraft(getToothState(updated))
  }

  function renderTooth(toothNumber: number, isUpper: boolean) {
    const entry = chart.find((tooth) => tooth.toothNumber === toothNumber)

    return (
      <ToothSvg
        key={toothNumber}
        toothNumber={toothNumber}
        condition={entry?.condition ?? 'healthy'}
        onClick={() => handleOpenTooth(toothNumber)}
        isUpper={isUpper}
        isSelected={selectedToothNumber === toothNumber}
      />
    )
  }

  const conditionCounts = useMemo(() => {
    const counts: Record<DentalCondition, number> = {
      healthy: 0,
      caries: 0,
      filled: 0,
      missing: 0,
      crown: 0,
      root_canal: 0,
      extraction: 0,
      implant: 0,
      other: 0,
    }
    chart.forEach((tooth) => {
      counts[tooth.condition]++
    })
    return counts
  }, [chart])

  return (
    <div className="dental-chart-panel premium-odontogram">
      <div className="odontogram-header">
        <div className="header-row">
          <div>
            <p className="eyebrow">Odontogram</p>
            <h3>Tooth status overview</h3>
          </div>
          <span className={`access-badge ${isEditable ? 'editable' : 'readonly'}`}>
            {isEditable ? 'Manage clinical records' : 'Patient view only'}
          </span>
        </div>
        <p className="subtitle">Click a tooth to review condition, treatment, date, and history.</p>
      </div>

      <div className="odontogram-legend">
        {Object.entries(DENTAL_CONDITION_META).map(([value, meta]) => {
          const count = conditionCounts[value as DentalCondition]
          return (
            <div key={value} className={`legend-item condition-${value}`}>
              <span className="legend-dot"></span>
              <span className="legend-label">{meta.label}</span>
              {count > 0 && <span className="legend-count">{count}</span>}
            </div>
          )
        })}
      </div>

      <div className="odontogram-container">
        <div className="odontogram-jaw upper">
          <div className="jaw-label">Upper Jaw</div>
          <div className="odontogram-row upper-left">
            {layout.upper.left.map((tooth) => renderTooth(tooth, true))}
          </div>
          <div className="odontogram-midline" aria-hidden="true" />
          <div className="odontogram-row upper-right">
            {layout.upper.right.map((tooth) => renderTooth(tooth, true))}
          </div>
        </div>

        <div className="odontogram-jaw lower">
          <div className="jaw-label">Lower Jaw</div>
          <div className="odontogram-row lower-left">
            {layout.lower.left.map((tooth) => renderTooth(tooth, false))}
          </div>
          <div className="odontogram-midline" aria-hidden="true" />
          <div className="odontogram-row lower-right">
            {layout.lower.right.map((tooth) => renderTooth(tooth, false))}
          </div>
        </div>
      </div>

      {selectedToothNumber !== null && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal tooth-details-modal odontogram-modal" aria-labelledby="tooth-details-title" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Tooth information</p>
                <h2 id="tooth-details-title">Tooth #{selectedToothNumber}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedToothNumber(null)} aria-label="Close tooth details">
                <X size={18} />
              </button>
            </div>

            <div className="tooth-details-content">
              <div className="tooth-details-summary">
                <div>
                  <span className="label">Condition</span>
                  <strong>{DENTAL_CONDITION_META[draft.condition]?.label ?? 'Healthy'}</strong>
                </div>
                <div>
                  <span className="label">Status</span>
                  <strong className="capitalize">{draft.status}</strong>
                </div>
                <div>
                  <span className="label">Last updated</span>
                  <strong>{draft.date ? new Date(draft.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}</strong>
                </div>
              </div>

              {draft.treatment && (
                <div className="tooth-treatment-info">
                  <span className="label">Current treatment</span>
                  <p>{draft.treatment}</p>
                </div>
              )}

              {isEditable && (
                <div className="form-grid single-column">
                  <Select
                    label="Condition"
                    value={draft.condition}
                    onChange={(event) => setDraft({ ...draft, condition: event.target.value as DentalCondition })}
                    options={conditionOptions}
                  />
                  <Select
                    label="Status"
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value as DentalToothStatus })}
                    options={statusOptions}
                  />
                  <Input
                    label="Date"
                    type="date"
                    value={draft.date}
                    onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                  />
                  <Input
                    label="Treatment"
                    value={draft.treatment}
                    onChange={(event) => setDraft({ ...draft, treatment: event.target.value })}
                  />
                  <Textarea
                    label="Notes"
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  />
                </div>
              )}

              {draft.notes && !isEditable && (
                <div className="tooth-treatment-info">
                  <span className="label">Notes</span>
                  <p>{draft.notes}</p>
                </div>
              )}

              {(linkedTreatments.length > 0 || linkedPlans.length > 0 || (selectedTooth && selectedTooth.history.length > 0)) && (
                <div className="tooth-history">
                  <div className="history-header-row">
                    <h3>Tooth history</h3>
                  </div>

                  {linkedTreatments.length > 0 && (
                    <div className="history-subsection">
                      <h4>Linked treatments</h4>
                      {linkedTreatments.map((treatment) => (
                        <div key={treatment.id} className="history-item">
                          <div className="history-row">
                            <strong>{new Date(treatment.treatmentDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                            <span className={`status-badge status-${treatment.status}`}>{treatment.status}</span>
                          </div>
                          <p>{treatment.description || 'Treatment recorded'}</p>
                          <small>{treatment.notes || 'No treatment notes recorded.'}</small>
                        </div>
                      ))}
                    </div>
                  )}

                  {linkedPlans.length > 0 && (
                    <div className="history-subsection">
                      <h4>Related treatment plans</h4>
                      {linkedPlans.map((plan) => (
                        <div key={plan.id} className="history-item compact-item">
                          <strong>{plan.name}</strong>
                          <small>{plan.description || 'Plan attached to this tooth.'}</small>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedTooth && selectedTooth.history.length > 0 && (
                    <div className="history-subsection">
                      <h4>Clinical notes</h4>
                      {selectedTooth.history.map((entry) => (
                        <div key={entry.id} className="history-item">
                          <div className="history-row">
                            <strong>{new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                            <span className={`status-badge status-${entry.status}`}>{entry.status}</span>
                          </div>
                          <p>{entry.treatment || 'No treatment recorded'}</p>
                          <small>{entry.notes || 'No notes recorded.'}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <Button variant="secondary" type="button" onClick={() => setSelectedToothNumber(null)}>
                Close
              </Button>
              {isEditable && (
                <Button type="button" onClick={handleSaveTooth}>
                  Save tooth record
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
