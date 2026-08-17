import { Phone, Mail, Calendar } from 'lucide-react'
import type { Patient } from '../patients/patientTypes'

type PatientHeaderProps = {
  patient: Patient
  treatmentCount: number
  lastTreatmentDate: string | null
}

export function PatientHeader({ patient, treatmentCount, lastTreatmentDate }: PatientHeaderProps) {
  return (
    <div className="treatment-patient-header">
      <div className="header-left">
        <div className="patient-header-badge">
          {patient.firstName.charAt(0)}{patient.lastName.charAt(0)}
        </div>
        <div className="patient-header-info">
          <h2 className="patient-header-name">
            {patient.firstName} {patient.lastName}
          </h2>
          <p className="patient-header-id">ID: {patient.patientId}</p>
        </div>
      </div>

      <div className="header-metadata">
        {patient.phone && (
          <div className="metadata-item">
            <Phone size={14} />
            <span>{patient.phone}</span>
          </div>
        )}
        {patient.email && (
          <div className="metadata-item">
            <Mail size={14} />
            <span>{patient.email}</span>
          </div>
        )}
        {lastTreatmentDate && (
          <div className="metadata-item">
            <Calendar size={14} />
            <span>Last visit: {new Date(lastTreatmentDate).toLocaleDateString()}</span>
          </div>
        )}
        <div className="metadata-item status-item">
          <span className="badge-treatments">{treatmentCount} treatment{treatmentCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}
