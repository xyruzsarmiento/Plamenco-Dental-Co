import { CheckCircle2, Circle } from 'lucide-react'
import { StatusBadge } from '../../components/ui/Badge'
import type { Treatment, TreatmentPlan } from './treatmentTypes'
import { getServiceById, getTreatmentProgress } from './treatmentStore'
import { getPatientName } from '../dentalRecords/dentalRecordStore'

type TreatmentPlanCardProps = {
  plan: TreatmentPlan
  treatments: Treatment[]
}

export function TreatmentPlanCard({ plan, treatments }: TreatmentPlanCardProps) {
  const progress = getTreatmentProgress(plan)
  const remaining = Math.max(plan.overallCost - plan.amountPaid, 0)
  const patientName = getPatientName(plan.patientId)

  return (
    <article className="treatment-plan-card premium-treatment-plan-card">
      <div className="plan-card-header">
        <div className="plan-title-group">
          <p className="eyebrow">Treatment plan</p>
          <h3>{plan.name}</h3>
          <p className="plan-patient">Patient: {patientName}</p>
        </div>
        <StatusBadge status={plan.status} />
      </div>

      {plan.description && <p className="plan-description">{plan.description}</p>}

      <div className="plan-progress-section">
        <div className="progress-header">
          <h4>Progress</h4>
          <span className="progress-percentage">{progress}%</span>
        </div>
        <div className="progress-bar" aria-label="Treatment plan progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="plan-financial-grid">
        <div className="financial-item">
          <span className="label">Total cost</span>
          <strong>₱{plan.overallCost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
        <div className="financial-item">
          <span className="label">Paid</span>
          <strong className="paid-amount">₱{plan.amountPaid.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
        <div className="financial-item">
          <span className="label">Balance</span>
          <strong className="balance-amount">₱{remaining.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
        </div>
      </div>

      {plan.treatments.length > 0 && (
        <div className="plan-steps-section">
          <h4>Treatment steps</h4>
          <div className="plan-steps">
            {plan.treatments.map((treatmentId, index) => {
              const treatment = treatments.find((entry) => entry.id === treatmentId)
              if (!treatment) return null

              const service = getServiceById(treatment.serviceId)
              const isCompleted = treatment.status === 'completed'
              return (
                <div key={treatment.id} className={`plan-step step-${treatment.status}`}>
                  <div className="step-indicator">
                    {isCompleted ? (
                      <CheckCircle2 size={20} className="step-icon completed" />
                    ) : (
                      <Circle size={20} className="step-icon pending" />
                    )}
                    <span className="step-number">{index + 1}</span>
                  </div>
                  <div className="step-content">
                    <div className="step-title">
                      <strong>{service?.name ?? treatment.description}</strong>
                      <StatusBadge status={treatment.status} variant="compact" />
                    </div>
                    <div className="step-meta">
                      {treatment.toothNumber && <span>Tooth #{treatment.toothNumber}</span>}
                      <span>{new Date(treatment.treatmentDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span>₱{treatment.cost.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </article>
  )
}
