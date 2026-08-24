import { useState } from 'react'
import { ChevronDown, ChevronUp, Edit, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { StatusBadge } from '../../components/ui/Badge'
import type { Patient } from './patientTypes'
import {
  filterPatients,
  paginatePatients,
  searchPatients,
  sortPatients,
  type SortKey,
} from './patientStore'

type PatientListProps = {
  patients: Patient[]
  onSelect: (patient: Patient) => void
  onEdit: (patient: Patient) => void
  onDelete: (patient: Patient) => void
  onAddNew: () => void
}

type SortState = {
  key: SortKey | null
  direction: 'asc' | 'desc'
}

const PAGE_SIZE = 10

export function PatientList({
  onAddNew,
  onDelete,
  onEdit,
  onSelect,
  patients,
}: PatientListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [sort, setSort] = useState<SortState>({ key: 'registrationDate', direction: 'desc' })

  // Apply search
  let filtered = searchPatients(searchQuery).filter((patient) => patients.some((item) => item.id === patient.id))

  // Apply filters
  filtered = filterPatients(filtered, {
    status: statusFilter || undefined,
  })

  // Apply sorting
  if (sort.key) {
    filtered = sortPatients(filtered, sort.key, sort.direction)
  }

  // Apply pagination
  const paginated = paginatePatients(filtered, currentPage, PAGE_SIZE)

  function handleSort(key: SortKey) {
    setCurrentPage(1)
    if (sort.key === key) {
      setSort({
        key,
        direction: sort.direction === 'asc' ? 'desc' : 'asc',
      })
    } else {
      setSort({ key, direction: 'asc' })
    }
  }

  function SortIcon({ active, direction }: { active: boolean; direction?: 'asc' | 'desc' }) {
    if (!active) return null
    return direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  function getAge(dateOfBirth: string) {
    const today = new Date()
    const birthDate = new Date(dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  return (
    <div className="patient-list-container">
      <div className="patient-toolbar">
        <Input
          placeholder="Search by name, ID, phone, or email..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setCurrentPage(1)
          }}
        />
        <Select
          label="Status"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setCurrentPage(1)
          }}
          options={[
            { label: 'All statuses', value: '' },
            { label: 'Active', value: 'active' },
            { label: 'Inactive', value: 'inactive' },
          ]}
        />
        <Button onClick={onAddNew}>+ New Patient</Button>
      </div>

      {paginated.items.length === 0 ? (
        <div className="empty-state">
          <h3>No patients found</h3>
          <p>Try adjusting your search or filters, or create a new patient.</p>
          <Button onClick={onAddNew}>Create first patient</Button>
        </div>
      ) : (
        <>
          <div className="table-panel">
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        className="sort-button"
                        onClick={() => handleSort('patientId')}
                      >
                        ID <SortIcon active={sort.key === 'patientId'} direction={sort.direction} />
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="sort-button"
                        onClick={() => handleSort('name')}
                      >
                        Name <SortIcon active={sort.key === 'name'} direction={sort.direction} />
                      </button>
                    </th>
                    <th>Age</th>
                    <th>Contact</th>
                    <th>
                      <button
                        type="button"
                        className="sort-button"
                        onClick={() => handleSort('status')}
                      >
                        Status <SortIcon active={sort.key === 'status'} direction={sort.direction} />
                      </button>
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.items.map((patient) => (
                    <tr
                      key={patient.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(patient)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          onSelect(patient)
                        }
                      }}
                    >
                      <td>
                        <strong>{patient.patientId}</strong>
                      </td>
                      <td>
                        <strong>
                          {patient.firstName} {patient.middleName && `${patient.middleName} `}
                          {patient.lastName}
                        </strong>
                        <span>{patient.email}</span>
                      </td>
                      <td>{getAge(patient.dateOfBirth)}</td>
                      <td>{patient.phone}</td>
                      <td>
                        <StatusBadge status={patient.status} variant="compact" />
                      </td>
                      <td>
                        <div
                          className="row-actions"
                          onClick={(e) => {
                            e.stopPropagation()
                          }}
                        >
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Edit patient"
                            onClick={() => onEdit(patient)}
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-button icon-button-danger"
                            aria-label="Delete patient"
                            onClick={() => onDelete(patient)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {paginated.totalPages > 1 && (
            <div className="pagination">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {paginated.currentPage} of {paginated.totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage === paginated.totalPages}
                onClick={() => setCurrentPage((p) => Math.min(paginated.totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
