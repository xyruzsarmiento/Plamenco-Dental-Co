import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock, Filter, Plus, Search, XCircle } from 'lucide-react'
import { AppointmentCalendar } from '../features/appointments/AppointmentCalendar'
import { AppointmentDetails } from '../features/appointments/AppointmentDetails'
import { AppointmentFormModal } from '../features/appointments/AppointmentFormModal'
import { ClinicalVisitWorkspace } from '../features/dentalRecords/ClinicalVisitWorkspace'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import type { Appointment, AppointmentFormValues, AppointmentStatus } from '../features/appointments/appointmentTypes'
import {
  addMinutesToTime,
  checkScheduleConflict,
  createAppointment,
  getOperatories,
  getScheduleConflictDetail,
  getStoredAppointments,
  getAppointmentHistory,
  resendAppointmentCommunication,
  transitionAppointmentStatus,
} from '../features/appointments/appointmentStore'
import { createClinicalVisitFromAppointment } from '../features/dentalRecords/dentalRecordStore'
import type { DentalRecord } from '../features/dentalRecords/dentalRecordTypes'
import { formatAppointmentTime, getAvailableAppointmentSlots, getEligibleProviders } from '../features/appointments/availabilityEngine'
import { usePermissions } from '../features/auth/permissions'
import { getStoredBranches } from '../features/branches/branchStore'
import type { Branch } from '../features/branches/branchTypes'
import { getStoredProviders } from '../features/dentists/dentistStore'
import type { Provider } from '../features/dentists/dentistTypes'
import { getStoredPatients } from '../features/patients/patientStore'
import type { Patient } from '../features/patients/patientTypes'
import { getStoredServices } from '../features/services/serviceStore'
import type { Service } from '../features/services/serviceTypes'
import type { CommunicationTemplateKey } from '../features/communications/communicationTypes'

type ViewTab = 'queue' | 'calendar' | 'requests'
type OperationAction = {
  appointment: Appointment
  status: AppointmentStatus
  label: string
  requiresReason?: boolean
} | null

export function AppointmentsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const permissions = usePermissions()
  const [appointments, setAppointments] = useState<Appointment[]>(getStoredAppointments())
  const [patients] = useState<Patient[]>(getStoredPatients())
  const [services] = useState<Service[]>(getStoredServices())
  const [branches] = useState<Branch[]>(getStoredBranches().filter((branch) => branch.status === 'active'))
  const [providers] = useState<Provider[]>(getStoredProviders())
  const [viewTab, setViewTab] = useState<ViewTab>('queue')
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | 'all'>('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')

  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formValues, setFormValues] = useState<AppointmentFormValues>({
    patientId: '',
    branchId: branches[0]?.id ?? '',
    providerId: '',
    serviceId: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '09:30',
    durationMinutes: undefined,
    estimatedAmountCents: undefined,
    paymentStatus: 'not_billed',
    depositStatus: 'not_required',
    depositRequiredCents: 0,
    depositPaidCents: 0,
    bookingSource: 'staff_entry',
    reasonForVisit: '',
    patientNotes: '',
    internalNotes: '',
    notes: '',
    status: 'pending',
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [conflictError, setConflictError] = useState<string | null>(null)
  const [operationAction, setOperationAction] = useState<OperationAction>(null)
  const [operationReason, setOperationReason] = useState('')
  const [operationError, setOperationError] = useState<string | null>(null)
  const [clinicalRecord, setClinicalRecord] = useState<DentalRecord | null>(null)

  const confirmedCount = appointments.filter((appointment) => appointment.status === 'confirmed').length
  const pendingCount = appointments.filter((appointment) => appointment.status === 'pending').length
  const today = new Date().toISOString().slice(0, 10)
  const todayAppointments = appointments.filter((appointment) => appointment.date === today)
  const waitingCount = todayAppointments.filter((appointment) => appointment.status === 'waiting' || appointment.status === 'checked_in').length
  const inTreatmentCount = todayAppointments.filter((appointment) => appointment.status === 'in_progress').length
  const completedTodayCount = todayAppointments.filter((appointment) => appointment.status === 'completed').length
  const noShowTodayCount = todayAppointments.filter((appointment) => appointment.status === 'no_show').length

  const pendingRequests = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'pending'),
    [appointments]
  )

  const filteredAppointments = useMemo(() => {
    return appointments.filter((appointment) => {
      const patient = patients.find((entry) => entry.id === appointment.patientId || entry.patientId === appointment.patientId)
      const matchesStatus = statusFilter === 'all' || appointment.status === statusFilter
      const matchesService = serviceFilter === 'all' || appointment.serviceId === serviceFilter
      const matchesDate = !dateFilter || appointment.date === dateFilter
      const matchesBranch = branchFilter === 'all' || appointment.branchId === branchFilter
      const matchesProvider = providerFilter === 'all' || appointment.providerId === providerFilter
      const query = searchQuery.trim().toLowerCase()
      const matchesSearch = !query || [
        appointment.id,
        appointment.appointmentNumber ?? '',
        appointment.notes,
        patient?.patientId ?? '',
        patient?.firstName ?? '',
        patient?.lastName ?? '',
        patient?.phone ?? '',
        patient?.email ?? '',
      ].some((value) => value.toLowerCase().includes(query))

      return matchesStatus && matchesService && matchesDate && matchesBranch && matchesProvider && matchesSearch
    })
  }, [appointments, branchFilter, dateFilter, patients, providerFilter, searchQuery, serviceFilter, statusFilter])

  const patientMap = useMemo(() => {
    const map = new Map<string, Patient>()
    patients.forEach((patient) => {
      map.set(patient.id, patient)
      map.set(patient.patientId, patient)
    })
    return map
  }, [patients])
  const serviceMap = useMemo(() => new Map(services.map((s) => [s.id, s])), [services])
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch])), [branches])
  const providerMap = useMemo(() => new Map(providers.map((provider) => [provider.id, provider])), [providers])
  const operatoryMap = useMemo(() => new Map(getOperatories().map((operatory) => [operatory.id, operatory])), [])

  function handleAddAppointment(date: string, time?: string) {
    setSelectedAppointment(null)
    setFormValues({
      patientId: '',
      branchId: branchFilter !== 'all' ? branchFilter : branches[0]?.id ?? '',
      providerId: providerFilter !== 'all' ? providerFilter : '',
      serviceId: '',
      date,
      startTime: time || '09:00',
      endTime: '09:30',
      durationMinutes: undefined,
      estimatedAmountCents: undefined,
      paymentStatus: 'not_billed',
      depositStatus: 'not_required',
      depositRequiredCents: 0,
      depositPaidCents: 0,
      bookingSource: 'staff_entry',
      reasonForVisit: '',
      patientNotes: '',
      internalNotes: '',
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
      const conflict = getScheduleConflictDetail(values.date, values.startTime, values.endTime, undefined, values.providerId, values.branchId, values.operatoryId)
      if (conflict && 'appointment' in conflict) {
        const provider = conflict.appointment.providerId ? providerMap.get(conflict.appointment.providerId) : undefined
        setConflictError(`${provider?.displayName ?? 'The selected resource'} already has an appointment from ${formatAppointmentTime(conflict.appointment.startTime)} to ${formatAppointmentTime(conflict.appointment.endTime)}.`)
      } else if (conflict && 'block' in conflict) {
        setConflictError(`This time is blocked for ${conflict.block.reason || conflict.block.type.replace('_', ' ')}.`)
      } else if (checkScheduleConflict(values.date, values.startTime, values.endTime, undefined, values.providerId, values.branchId, values.operatoryId)) {
        setConflictError('This time overlaps an existing appointment. Please choose another slot.')
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
    if (!formValues.branchId) {
      setFormError('Please select a branch')
      return
    }
    if (!formValues.providerId) {
      setFormError('Please select a dentist or available time slot')
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

    const selectedService = services.find((service) => service.id === formValues.serviceId)
    const endTime = selectedService ? addMinutesToTime(formValues.startTime, selectedService.duration) : formValues.endTime
    const availableSlot = getAvailableAppointmentSlots({
      branchId: formValues.branchId,
      providerId: formValues.providerId,
      serviceId: formValues.serviceId,
      date: formValues.date,
    }).some((slot) => slot.startTime === formValues.startTime && slot.providerId === formValues.providerId)

    if (!availableSlot) {
      setFormError('That dentist is not available for the selected branch, date, time and service duration.')
      return
    }

    const result = createAppointment({
      ...formValues,
      endTime,
      durationMinutes: selectedService?.duration,
      estimatedAmountCents: selectedService?.price,
      depositStatus: formValues.depositStatus ?? 'not_required',
      depositRequiredCents: formValues.depositRequiredCents ?? 0,
      depositPaidCents: formValues.depositPaidCents ?? 0,
    }, user?.email ?? 'staff-entry')
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

    const result = transitionAppointmentStatus(selectedAppointment.id, status, {
      actor: user?.email ?? 'clinic-user',
      expectedUpdatedAt: selectedAppointment.updatedAt,
    })
    if (result.appointment) {
      setAppointments(getStoredAppointments())
      setSelectedAppointment(result.appointment)
    } else if (result.error) {
      alert(result.error)
    }
  }

  function handleApproveRequest(appointmentId: string) {
    const appointment = appointments.find((entry) => entry.id === appointmentId)
    if (!appointment) return
    const result = transitionAppointmentStatus(appointmentId, 'confirmed', {
      actor: user?.email ?? 'clinic-user',
      expectedUpdatedAt: appointment.updatedAt,
    })
    if (result.appointment) {
      setAppointments(getStoredAppointments())
    }
  }

  function handleDisapproveRequest(appointmentId: string) {
    const appointment = appointments.find((entry) => entry.id === appointmentId)
    if (!appointment) return
    const result = transitionAppointmentStatus(appointmentId, 'rejected', {
      actor: user?.email ?? 'clinic-user',
      expectedUpdatedAt: appointment.updatedAt,
      reason: 'Rejected from appointment requests',
    })
    if (result.appointment) {
      setAppointments(getStoredAppointments())
    }
  }

  function openOperationAction(appointment: Appointment, status: AppointmentStatus, label: string, requiresReason = false) {
    setOperationAction({ appointment, status, label, requiresReason })
    setOperationReason('')
    setOperationError(null)
  }

  function confirmOperationAction() {
    if (!operationAction) return
    if (operationAction.requiresReason && !operationReason.trim()) {
      setOperationError('Please enter a reason before continuing.')
      return
    }

    const result = transitionAppointmentStatus(operationAction.appointment.id, operationAction.status, {
      actor: user?.email ?? 'clinic-user',
      reason: operationReason.trim(),
      expectedUpdatedAt: operationAction.appointment.updatedAt,
    })
    if (result.error) {
      setOperationError(result.error)
      return
    }

    setAppointments(getStoredAppointments())
    setSelectedAppointment(result.appointment ?? null)
    setOperationAction(null)
    setOperationReason('')
    setOperationError(null)
  }

  function handleManualResend(appointment: Appointment, templateKey: CommunicationTemplateKey) {
    if (!['appointment_confirmed', 'appointment_reminder', 'appointment_rescheduled'].includes(templateKey)) return
    const result = resendAppointmentCommunication(
      appointment.id,
      templateKey as 'appointment_confirmed' | 'appointment_reminder' | 'appointment_rescheduled',
      user?.email ?? 'clinic-user',
    )
    if (result.error) {
      alert(result.error)
      return
    }
    setAppointments(getStoredAppointments())
    setSelectedAppointment(getStoredAppointments().find((entry) => entry.id === appointment.id) ?? appointment)
  }

  function openClinicalRecord(appointment: Appointment) {
    const record = createClinicalVisitFromAppointment(appointment, user?.email ?? 'clinic-user')
    setClinicalRecord(record)
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
          <h2>APPOINTMENTS</h2>
          <p>Manage clinic schedules and patient visits.</p>
        </div>
        {permissions.can('appointments.create') && (
          <Button icon={<Plus size={16} />} onClick={() => handleAddAppointment(new Date().toISOString().slice(0, 10))}>
            New Appointment
          </Button>
        )}
      </div>

      <div className="stats-grid compact-stats">
        <article className="stat-card">
          <span>Today's Appointments</span>
          <strong>{todayAppointments.length}</strong>
        </article>
        <article className="stat-card">
          <span>Waiting</span>
          <strong>{waitingCount}</strong>
        </article>
        <article className="stat-card">
          <span>In Treatment</span>
          <strong>{inTreatmentCount}</strong>
        </article>
        <article className="stat-card">
          <span>Completed</span>
          <strong>{completedTodayCount}</strong>
        </article>
      </div>

      <div className="view-tabs">
        <button
          type="button"
          className={`view-tab-button ${viewTab === 'queue' ? 'is-active' : ''}`}
          onClick={() => setViewTab('queue')}
        >
          Today's Patients
        </button>
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

      {viewTab === 'queue' && (
        <section className="operations-board">
          <div className="operations-board-header">
            <div>
              <p className="eyebrow">Daily operations</p>
              <h3>{new Date(`${today}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>
            </div>
            <div className="operations-flow">
              <span>{confirmedCount} confirmed</span>
              <span>{waitingCount} waiting</span>
              <span>{completedTodayCount} completed</span>
              <span>{noShowTodayCount} no show</span>
            </div>
          </div>

          <div className="operations-columns">
            {[
              { key: 'upcoming', label: 'Upcoming', statuses: ['confirmed'] as AppointmentStatus[] },
              { key: 'checked_in', label: 'Checked In', statuses: ['checked_in'] as AppointmentStatus[] },
              { key: 'waiting', label: 'Waiting', statuses: ['waiting'] as AppointmentStatus[] },
              { key: 'in_progress', label: 'In Treatment', statuses: ['in_progress'] as AppointmentStatus[] },
              { key: 'completed', label: 'Completed', statuses: ['completed'] as AppointmentStatus[] },
              { key: 'no_show', label: 'No Show', statuses: ['no_show'] as AppointmentStatus[] },
            ].map((column) => {
              const columnAppointments = filteredAppointments
                .filter((appointment) => appointment.date === today && column.statuses.includes(appointment.status))
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
              return (
                <div key={column.key} className="operations-column">
                  <div className="operations-column-header">
                    <strong>{column.label}</strong>
                    <span>{columnAppointments.length}</span>
                  </div>
                  <div className="operations-card-list">
                    {columnAppointments.map((appointment) => {
                      const patient = patientMap.get(appointment.patientId)
                      const service = serviceMap.get(appointment.serviceId)
                      const provider = appointment.providerId ? providerMap.get(appointment.providerId) : undefined
                      const waitStart = appointment.waitingAt ?? appointment.checkedInAt
                      const waitMinutes = waitStart ? Math.max(0, Math.floor((Date.now() - new Date(waitStart).getTime()) / 60000)) : null
                      return (
                        <article key={appointment.id} className={`operations-card status-${appointment.status}`}>
                          <div className="operations-card-time">
                            <strong>{appointment.startTime}</strong>
                            <span>{appointment.appointmentNumber ?? appointment.id}</span>
                          </div>
                          <div>
                            <h4>{patient ? `${patient.firstName} ${patient.lastName}` : 'Patient'}</h4>
                            <p>{patient?.patientId ?? appointment.patientId}</p>
                          </div>
                          <div className="operations-card-meta">
                            <span>{service?.name ?? 'Service'}</span>
                            <span>{provider?.displayName ?? 'No dentist'}</span>
                            {waitMinutes !== null && <span>Waiting {waitMinutes} min</span>}
                          </div>
                          <div className="operations-card-actions">
                            <button type="button" className="text-button" onClick={() => setSelectedAppointment(appointment)}>Details</button>
                            {appointment.status === 'confirmed' && permissions.can('appointments.check_in') && (
                              <button type="button" className="text-button" onClick={() => openOperationAction(appointment, 'checked_in', 'Check In')}>Check In</button>
                            )}
                            {appointment.status === 'checked_in' && permissions.can('appointments.check_in') && (
                              <button type="button" className="text-button" onClick={() => openOperationAction(appointment, 'waiting', 'Move to Waiting')}>Move to Waiting</button>
                            )}
                            {appointment.status === 'waiting' && permissions.can('appointments.start') && (
                              <button type="button" className="text-button" onClick={() => openOperationAction(appointment, 'in_progress', 'Start Visit')}>Start Visit</button>
                            )}
                            {appointment.status === 'in_progress' && permissions.can('appointments.complete') && (
                              <button type="button" className="text-button" onClick={() => openOperationAction(appointment, 'completed', 'Complete Visit')}>Complete</button>
                            )}
                            {appointment.status === 'confirmed' && permissions.can('appointments.mark_no_show') && (
                              <button type="button" className="text-button" onClick={() => openOperationAction(appointment, 'no_show', 'Mark No Show', true)}>No Show</button>
                            )}
                          </div>
                        </article>
                      )
                    })}
                    {columnAppointments.length === 0 && <div className="operations-empty">No patients in this stage.</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

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
                  setProviderFilter('all')
                  setSearchQuery('')
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
                  <option value="all">All branches</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>

              <div className="field-wrap">
                <label htmlFor="appointment-provider-filter">Dentist</label>
                <select
                  id="appointment-provider-filter"
                  value={providerFilter}
                  onChange={(event) => setProviderFilter(event.target.value)}
                >
                  <option value="all">All dentists</option>
                  {providers.filter((provider) => provider.status === 'active').map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.displayName}</option>
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

              <label className="toolbar-search" htmlFor="appointment-search">
                <Search size={16} className="search-icon" />
                <input
                  id="appointment-search"
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search patient, phone, appointment number"
                />
              </label>
            </div>
          </div>

          <AppointmentCalendar
            appointments={filteredAppointments}
            patients={patientMap}
            services={serviceMap}
            branches={branchMap}
            providers={providerMap}
            onSelectAppointment={setSelectedAppointment}
            onAddAppointment={handleAddAppointment}
            branchFilter={branchFilter === 'all' ? undefined : branchFilter}
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
                const branch = request.branchId ? branchMap.get(request.branchId) : undefined
                const provider = request.providerId ? providerMap.get(request.providerId) : undefined
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
                      <div className="detail-col">
                        <span className="detail-label">Branch</span>
                        <p>{branch?.name ?? 'No branch'}</p>
                      </div>
                      <div className="detail-col">
                        <span className="detail-label">Dentist</span>
                        <p>{provider?.displayName ?? 'Any available'}</p>
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
          branches={branches}
          providers={formValues.branchId ? getEligibleProviders(formValues.branchId) : []}
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
          branch={selectedAppointment.branchId ? branchMap.get(selectedAppointment.branchId) : undefined}
          provider={selectedAppointment.providerId ? providerMap.get(selectedAppointment.providerId) : undefined}
          operatory={selectedAppointment.operatoryId ? operatoryMap.get(selectedAppointment.operatoryId) : undefined}
          history={getAppointmentHistory(selectedAppointment.id)}
          canManage={Boolean(user && user.role !== 'patient')}
          onClose={() => setSelectedAppointment(null)}
          onStatusChange={handleStatusChange}
          onActionRequest={(appointment, status, label, requiresReason) => openOperationAction(appointment, status, label, requiresReason)}
          onManualResend={handleManualResend}
          onOpenPatientRecord={() => navigate('/app/patients')}
          onOpenClinicalRecord={openClinicalRecord}
        />
      )}

      {clinicalRecord && (
        <ClinicalVisitWorkspace
          record={clinicalRecord}
          patient={patientMap.get(clinicalRecord.patientId)!}
          appointment={clinicalRecord.relatedAppointmentId ? appointments.find((entry) => entry.id === clinicalRecord.relatedAppointmentId) : undefined}
          branch={clinicalRecord.branchId ? branchMap.get(clinicalRecord.branchId) : undefined}
          provider={clinicalRecord.providerId ? providerMap.get(clinicalRecord.providerId) : undefined}
          services={services}
          actor={user?.email ?? 'clinic-user'}
          canEditDraft={permissions.canAny(['clinical_records.edit_draft', 'clinical_records.edit'])}
          canFinalize={permissions.can('clinical_records.finalize')}
          canAmend={permissions.can('clinical_records.amend')}
          canCreateTreatment={permissions.can('treatments.create')}
          canCreatePrescription={permissions.can('prescriptions.create')}
          canUploadDocuments={permissions.can('documents.upload')}
          onClose={() => setClinicalRecord(null)}
          onRecordChange={setClinicalRecord}
        />
      )}

      {operationAction && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal operation-action-modal" role="dialog" aria-modal="true" aria-labelledby="operation-action-title">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Appointment operation</p>
                <h2 id="operation-action-title">{operationAction.label}</h2>
              </div>
              <button className="icon-button" type="button" aria-label="Close operation" onClick={() => setOperationAction(null)}>
                <XCircle size={18} />
              </button>
            </div>
            <div className="operation-confirm-body">
              <strong>{patientMap.get(operationAction.appointment.patientId)?.firstName} {patientMap.get(operationAction.appointment.patientId)?.lastName}</strong>
              <span>{operationAction.appointment.appointmentNumber ?? operationAction.appointment.id}</span>
              <span>{formatDate(operationAction.appointment.date)} - {operationAction.appointment.startTime}</span>
              <textarea
                value={operationReason}
                onChange={(event) => setOperationReason(event.target.value)}
                placeholder={operationAction.requiresReason ? 'Reason is required' : 'Optional note'}
                rows={4}
              />
              {operationError && <div className="inline-alert">{operationError}</div>}
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setOperationAction(null)}>Cancel</Button>
              <Button onClick={confirmOperationAction}>Confirm</Button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
