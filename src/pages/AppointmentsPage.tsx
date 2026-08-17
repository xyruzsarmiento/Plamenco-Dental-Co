import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, Filter, XCircle } from 'lucide-react'
import { AppointmentCalendar } from '../features/appointments/AppointmentCalendar'
import { AppointmentDetails } from '../features/appointments/AppointmentDetails'
import { AppointmentFormModal } from '../features/appointments/AppointmentFormModal'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import type { Appointment, AppointmentFormValues, AppointmentStatus } from '../features/appointments/appointmentTypes'
import {
  checkScheduleConflict,
  createAppointment,
  getStoredAppointments,
  updateAppointment,
} from '../features/appointments/appointmentStore'
import { getStoredPatients } from '../features/patients/patientStore'
import type { Patient } from '../features/patients/patientTypes'
import { getStoredServices } from '../features/services/serviceStore'
import type { Service } from '../features/services/serviceTypes'

type ViewTab = 'calendar' | 'requests'

const branchOptions = [
  { value: 'all', label: 'All branches' },
  { value: 'pulilan', label: 'Pulilan Branch' },
  { value: 'plaridel', label: 'Plaridel Branch' },
]

export function AppointmentsPage() {
  const { user } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>(getStoredAppointments())
  const [patients] = useState<Patient[]>(getStoredPatients())
  const [services] = useState<Service[]>(getStoredServices())
  const [viewTab, setViewTab] = useState<ViewTab>('calendar')
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formValues, setFormValues] = useState<AppointmentFormValues>({
    patientId: '',
    serviceId: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '09:30',
    notes: '',
    status: 'pending',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [conflictError, setConflictError] = useState<string | null>(null)

  const upcomingCount = appointments.filter((appointment) => appointment.status !== 'cancelled' && appointment.status !== 'no_show').length
  const confirmedCount = appointments.filter((appointment) => appointment.status === 'confirmed').length
  const pendingCount = appointments.filter((appointment) => appointment.status === 'pending').length

  const pendingRequests = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'pending'),
    [appointments]
  )

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter
      const matchesService = serviceFilter === 'all' || appointment.serviceId === serviceFilter
      const matchesDate = !dateFilter || appointment.date === dateFilter
      const matchesBranch = branchFilter === 'all' || branchFilter === 'pulilan' || branchFilter === 'plaridel'

      return matchesStatus && matchesService && matchesDate && matchesBranch
    })
  }, [appointments, branchFilter, dateFilter, serviceFilter, statusFilter])

  // Create maps for quick lookups
  const patientMap = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients])
  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])

  function handleAddAppointment(date: string, time?: string) {
    setSelectedAppointment(null)
    setFormValues({
      patientId: '',
      serviceId: '',
      date,
      startTime: time || '09:00',
      endTime: '09:30',
      notes: '',
      status: 'pending',
    })
    setFormError(null)
    setConflictError(null)
    setShowForm(true)
  }

  function handleFormValueChange(values: AppointmentFormValues) {
    setFormValues(values)

    // Check for conflicts
    if (values.date && values.startTime && values.endTime) {
      const hasConflict = checkScheduleConflict(values.date, values.startTime, values.endTime)
      if (hasConflict) {
        setConflictError('This time slot is already booked. Please choose another time.')
      } else {
        setConflictError(null)
      }
    }
  }

  function handleSubmitForm() {
    if (!formValues.patientId) {
      setFormError('Please select a patient')
      return
    }
    if (!formValues.serviceId) {
      setFormError('Please select a service')
      return
    }
    if (!formValues.date) {
      setFormError('Please select a date')
      return
    }
    if (!formValues.startTime) {
      setFormError('Please select a time')
      return
    }

    if (conflictError) {
      setFormError('Cannot create appointment: ' + conflictError)
      return
    }

    const result = createAppointment(formValues, 'admin@plamencodental.local')
    if (!result) {
      setFormError('Failed to create appointment. Time slot may be booked.')
      return
    }

    setAppointments(getStoredAppointments())
    setShowForm(false)
    setFormError(null)
    setConflictError(null)
  }

  function handleStatusChange(status: AppointmentStatus) {
    if (!selectedAppointment) return

    const result = updateAppointment(selectedAppointment.id, { status })
    if (result) {
      setAppointments(getStoredAppointments())
      setSelectedAppointment(result)
    }
  }

  function handleApproveRequest(appointmentId: string) {
    const result = updateAppointment(appointmentId, { status: 'confirmed' })
    if (result) {
      setAppointments(getStoredAppointments())
    }
  }

  function handleDisapproveRequest(appointmentId: string) {
    const result = updateAppointment(appointmentId, { status: 'cancelled' })
    if (result) {
      setAppointments(getStoredAppointments())
    }
  }

  function formatCurrency(cents: number) {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(cents / 100)
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function handleCloseForm() {
    setShowForm(false)
    setFormError(null)
    setConflictError(null)
  }

  const selectedAppointmentData = selectedAppointment
    ? {
        patient: patientMap.get(selectedAppointment.patientId),
        service: serviceMap.get(selectedAppointment.serviceId),
      }
    : { patient: undefined, service: undefined }

  return (
    <section className="page-stack premium-appointments-page">
      <div className="section-header premium-page-header">
        <div>
          <h2>Appointments</h2>
          <p>Manage clinic appointments, view calendar, and track patient visits with a clearer care-flow overview.</p>
        </div>
      </div>

      <div className="stats-grid compact-stats">
        <article className="stat-card">
          <span>Scheduled</span>
          <strong>{upcomingCount}</strong>
        </article>
        <article className="stat-card">
          <span>Confirmed</span>
          <strong>{confirmedCount}</strong>
        </article>
        <article className="stat-card">
          <span>Pending</span>
          <strong>{pendingCount}</strong>
        </article>
        <article className="stat-card">
          <span>Patients</span>
          <strong>{patients.length}</strong>
        </article>
      </div>

      <div className="view-tabs">
        <button
          type="button"
          className={`view-tab-button ${viewTab === 'calendar' ? 'is-active' : ''}`}
          onClick={() => setViewTab('calendar')}
        >
          Calendar
        </button>
        <button
          type="button"
          className={`view-tab-button ${viewTab === 'requests' ? 'is-active' : ''}`}
          onClick={() => setViewTab('requests')}
        >
          Appointment Requests {pendingCount > 0 && <span className="badge-dot">{pendingCount}</span>}
        </button>
      </div>

      {viewTab === 'calendar' && (
        <>
          <div className="calendar-filter-bar panel">
            <div className="calendar-filter-header">
              <span className="muted-label"><Filter size={12} /> Filters</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setStatusFilter('all')
                  setServiceFilter('all')
                  setDateFilter('')
                  setBranchFilter('all')
                }}
              >
                Clear
              </Button>
            </div>

            <div className="calendar-filter-grid">
              <div className="field-wrap">
                <label htmlFor="appointment-branch-filter">Branch</label>
                <select
                  id="appointment-branch-filter"
                  value={branchFilter}
                  onChange={(event) => setBranchFilter(event.target.value)}
                >
                  {branchOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="field-wrap">
                <label htmlFor="appointment-status-filter">Status</label>
                <select
                  id="appointment-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as AppointmentStatus | 'all')}
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Approved</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="field-wrap">
                <label htmlFor="appointment-service-filter">Service</label>
                <select
                  id="appointment-service-filter"
                  value={serviceFilter}
                  onChange={(event) => setServiceFilter(event.target.value)}
                >
                  <option value="all">All services</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
              </div>

              <div className="field-wrap">
                <label htmlFor="appointment-date-filter">Date</label>
                <input
                  id="appointment-date-filter"
                  type="date"
                  value={dateFilter}
                  onChange={(event) => setDateFilter(event.target.value)}
                />
              </div>
            </div>
          </div>

          <AppointmentCalendar
            appointments={filteredAppointments}
            patients={patientMap}
            services={serviceMap}
            onSelectAppointment={setSelectedAppointment}
            onAddAppointment={handleAddAppointment}
          />
        </>
      )}

      {viewTab === 'requests' && (
        <section className="appointment-requests-panel">
          {pendingRequests.length === 0 ? (
            <div className="empty-state-panel">
              <Clock size={28} />
              <h3>No pending requests</h3>
              <p>All appointment requests have been reviewed.</p>
            </div>
          ) : (
            <div className="request-list">
              {pendingRequests.map((request) => {
                const patient = patientMap.get(request.patientId)
                const service = serviceMap.get(request.serviceId)
                return (
                  <div key={request.id} className="request-card">
                    <div className="request-header">
                      <div className="request-main">
                        <div className="request-patient">
                          <strong>{patient?.firstName} {patient?.lastName}</strong>
                          <small>{patient?.patientId}</small>
                        </div>
                        <div className="request-service">
                          <p>{service?.name}</p>
                        </div>
                      </div>
                      <Badge tone="warning">Pending</Badge>
                    </div>

                    <div className="request-details">
                      <div className="detail-col">
                        <span className="detail-label">Date & Time</span>
                        <p>{formatDate(request.date)} • {request.startTime}</p>
                      </div>
                      <div className="detail-col">
                        <span className="detail-label">Duration</span>
                        <p>{service?.duration ?? 30} minutes</p>
                      </div>
                      <div className="detail-col">
                        <span className="detail-label">Price</span>
                        <strong>{service ? formatCurrency(service.price) : '—'}</strong>
                      </div>
                      <div className="detail-col">
                        <span className="detail-label">Contact</span>
                        <p>{patient?.phone}</p>
                      </div>
                    </div>

                    {request.notes && (
                      <div className="request-notes">
                        <span className="detail-label">Notes</span>
                        <p>{request.notes}</p>
                      </div>
                    )}

                    <div className="request-actions">
                      <Button
                        onClick={() => handleApproveRequest(request.id)}
                        className="btn-success"
                      >
                        <CheckCircle2 size={16} />
                        Approve
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleDisapproveRequest(request.id)}
                        className="btn-danger"
                      >
                        <XCircle size={16} />
                        Disapprove
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {showForm && (
        <AppointmentFormModal
          patients={patients}
          services={services}
          values={formValues}
          onChange={handleFormValueChange}
          onSubmit={handleSubmitForm}
          onClose={handleCloseForm}
          error={formError}
          conflictError={conflictError}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetails
          appointment={selectedAppointment}
          patient={selectedAppointmentData.patient}
          service={selectedAppointmentData.service}
          canManage={Boolean(user && user.role !== 'patient')}
          onClose={() => setSelectedAppointment(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </section>
  )
}
