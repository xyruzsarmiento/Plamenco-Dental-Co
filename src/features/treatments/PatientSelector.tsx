import { useMemo } from 'react'
import { Search, User } from 'lucide-react'
import { Input } from '../../components/ui/Input'
import type { Patient } from '../patients/patientTypes'

type PatientSelectorProps = {
  patients: Patient[]
  search: string
  onSearchChange: (value: string) => void
  selectedPatientId: string
  onSelectPatient: (patientId: string) => void
}

export function PatientSelector({
  patients,
  search,
  onSearchChange,
  selectedPatientId,
  onSelectPatient,
}: PatientSelectorProps) {
  const filteredPatients = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return patients

    return patients.filter((patient) => {
      const fullName = `${patient.firstName} ${patient.lastName}`.toLowerCase()
      return fullName.includes(query) || patient.patientId.toLowerCase().includes(query)
    })
  }, [patients, search])

  return (
    <div className="treatment-patient-selector">
      {/* Search bar */}
      <div className="selector-search-wrapper">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <Input
            placeholder="Search patient name or ID"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Patient list */}
      <div className="patient-list-container">
        {filteredPatients.length === 0 ? (
          <div className="empty-patient-list">
            <p>No patients found</p>
          </div>
        ) : (
          <div className="patient-list">
            {filteredPatients.map((patient) => (
              <button
                key={patient.patientId}
                className={`patient-list-item ${selectedPatientId === patient.patientId ? 'is-selected' : ''}`}
                onClick={() => onSelectPatient(patient.patientId)}
              >
                <div className="patient-item-avatar">
                  <User size={16} />
                </div>
                <div className="patient-item-info">
                  <div className="patient-item-name">
                    {patient.firstName} {patient.lastName}
                  </div>
                  <div className="patient-item-id">{patient.patientId}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
