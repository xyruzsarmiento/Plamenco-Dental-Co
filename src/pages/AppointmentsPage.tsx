import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  Clock,
  Filter,
  HeartPulse,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  UserRound,
  UserRoundCheck,
  UsersRound,
  XCircle,
} from 'lucide-react'
import { AppointmentCalendar } from '../features/appointments/AppointmentCalendar'
import { AppointmentDetails } from '../features/appointments/AppointmentDetails'
import { AppointmentFormModal } from '../features/appointments/AppointmentFormModal'
import { ClinicalVisitWorkspace } from '../features/dentalRecords/ClinicalVisitWorkspace'
import { StatusBadge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { useAuth } from '../features/auth/AuthContext'
import type { Appointment, AppointmentFormValues, AppointmentStatus } from '../features/appointments/appointmentTypes'
import {
  addMinutesToTime,
  checkScheduleConflict,
  getOperatories,
  getScheduleConflictDetail,
  getStoredAppointments,
  getAppointmentHistory,
  resendAppointmentCommunicationPersisted,
} from '../features/appointments/appointmentStore'
import {
  assignAppointmentProviderPersisted,
  createAppointmentPersisted,
  loadAppointmentsFromSupabase,
  rescheduleAppointmentPersisted,
  transitionAppointmentStatusPersisted,
} from '../features/appointments/appointmentPersistence'
import { createClinicalVisitFromAppointment } from '../features/dentalRecords/dentalRecordStore'
import type { DentalRecord } from '../features/dentalRecords/dentalRecordTypes'
import { formatAppointmentTime, getAvailableAppointmentSlots, getEligibleProviders } from '../features/appointments/availabilityEngine'
import { usePermissions } from '../features/auth/permissions'
import { getStoredBranches } from '../features/branches/branchStore'
import type { Branch } from '../features/branches/branchTypes'
import { getStoredProviders } from '../features/dentists/dentistStore'
import type { Provider } from '../features/dentists/dentistTypes'
import { getStoredPatients } from '../features/patients/patientStore'
import { loadPatientsFromSupabase } from '../features/patients/patientPersistence'
import type { Patient } from '../features/patients/patientTypes'
import { getStoredServices } from '../features/services/serviceStore'
import type { Service } from '../features/services/serviceTypes'
import type { CommunicationTemplateKey } from '../features/communications/communicationTypes'
import { completeRecall, linkRecallToAppointment, listPatientRecalls, type RecallQueueItem } from '../features/recalls/recallStore'

type ViewTab = 'queue' | 'calendar' | 'requests'
type OperationAction = {
  appointment: Appointment
  status: AppointmentStatus
  label: string
  requiresReason?: boolean
} | null

type RescheduleDraft = {
  date: string
  startTime: string
  providerId: string
}

type TrendPoint = { label: string; value: number }

type StatusDatum = { label: string; value: number; key: string }
type CommunicationFeedback = { appointmentId: string; tone: 'success' | 'warning' | 'danger' | 'info'; message: string } | null

function manilaDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function manilaDateOffset(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function shortDateLabel(date: string) {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    day: 'numeric',
  })
}

function patientInitials(patient?: Patient) {
  if (!patient) return 'P'
  return `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase() || 'P'
}

function AppointmentTrendChart({ data }: { data: TrendPoint[] }) {
  const width = 760
  const height = 250
  const left = 38
  const right = 22
  const top = 22
  const bottom = 42
  const max = Math.max(1, ...data.map((item) => item.value))
  const usableWidth = width - left - right
  const usableHeight = height - top - bottom
  const points = data.map((item, index) => ({
    ...item,
    x: data.length <= 1 ? width / 2 : left + (usableWidth * index) / (data.length - 1),
    y: top + usableHeight - (item.value / max) * usableHeight,
  }))
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const area = points.length
    ? `${line} L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x} ${height - bottom} Z`
    : ''

  return (
    <section className="sa-appointments-chart-card sa-appointments-trend-card">
      <div className="sa-appointments-card-heading">
        <div>
          <span className="sa-appointments-kicker">7-day activity</span>
          <h3>Appointment volume</h3>
          <p>Actual appointments recorded per clinic business day.</p>
        </div>
        <span className="sa-appointments-icon-tile"><BarChart3 size={18} /></span>
      </div>
      <div className="sa-appointments-chart-scroll">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={data.map((item) => `${item.label}: ${item.value}`).join(', ')}>
          {[0, 1, 2, 3].map((lineIndex) => {
            const y = top + (usableHeight * lineIndex) / 3
            return <line key={lineIndex} x1={left} x2={width - right} y1={y} y2={y} className="sa-appointments-chart-gridline" />
          })}
          <path d={area} className="sa-appointments-chart-area" />
          <path d={line} className="sa-appointments-chart-line" />
          {points.map((point) => (
            <g key={point.label}>
              <circle cx={point.x} cy={point.y} r="5" className="sa-appointments-chart-point" />
              <text x={point.x} y={height - 15} textAnchor="middle" className="sa-appointments-chart-label">{point.label}</text>
              <text x={point.x} y={Math.max(14, point.y - 12)} textAnchor="middle" className="sa-appointments-chart-value">{point.value}</text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}

function AppointmentStatusDonut({ data }: { data: StatusDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const radius = 52
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <section className="sa-appointments-chart-card sa-appointments-status-card">
      <div className="sa-appointments-card-heading">
        <div>
          <span className="sa-appointments-kicker">Today's flow</span>
          <h3>Visit status</h3>
          <p>Live distribution from today’s recorded appointment states.</p>
        </div>
        <span className="sa-appointments-icon-tile"><Activity size={18} /></span>
      </div>
      <div className="sa-appointments-donut-layout">
        <div className="sa-appointments-donut-wrap">
          <svg viewBox="0 0 140 140" role="img" aria-label={data.map((item) => `${item.label}: ${item.value}`).join(', ')}>
            <circle cx="70" cy="70" r={radius} className="sa-appointments-donut-base" />
            {data.map((item) => {
              const length = total ? (item.value / total) * circumference : 0
              const segment = (
                <circle
                  key={item.key}
                  cx="70"
                  cy="70"
                  r={radius}
                  className={`sa-appointments-donut-segment status-${item.key}`}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                />
              )
              offset += length
              return segment
            })}
          </svg>
          <div className="sa-appointments-donut-center"><strong>{total}</strong><span>today</span></div>
        </div>
        <div className="sa-appointments-status-legend">
          {data.map((item) => (
            <div key={item.key}><span className={`sa-appointments-legend-dot status-${item.key}`} /><span>{item.label}</span><strong>{item.value}</strong></div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function AppointmentsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const permissions = usePermissions()
  const canAssignDentist = permissions.can('appointments.assign_dentist')
  const [appointments, setAppointments] = useState<Appointment[]>(getStoredAppointments())
  const [patients, setPatients] = useState<Patient[]>(getStoredPatients())
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
    date: manilaDate(),
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
  const [rescheduleDraft, setRescheduleDraft] = useState<RescheduleDraft>({ date: '', startTime: '', providerId: '' })
  const [operationError, setOperationError] = useState<string | null>(null)
  const [clinicalRecord, setClinicalRecord] = useState<DentalRecord | null>(null)
  const [pendingFollowUpRecall, setPendingFollowUpRecall] = useState<RecallQueueItem | null>(null)
  const [selectedFollowUpRecommendation, setSelectedFollowUpRecommendation] = useState<RecallQueueItem | null>(null)

  useEffect(() => {
    let active = true
    void loadPatientsFromSupabase()
      .then((rows) => {
        if (active) setPatients(rows)
      })
      .catch((error) => {
        if (import.meta.env.DEV) console.warn('[appointments] patient refresh failed', error)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    void loadAppointmentsFromSupabase({ strict: true })
      .then((rows) => {
        if (active) setAppointments(rows)
      })
      .catch((error) => {
        if (active) setOperationError(error instanceof Error ? error.message : 'Unable to load appointments from Supabase.')
      })
    return () => { active = false }
  }, [user?.id])
  const [isAppointmentSaving, setIsAppointmentSaving] = useState(false)
  const [communicationPendingKey, setCommunicationPendingKey] = useState<string | null>(null)
  const [communicationFeedback, setCommunicationFeedback] = useState<CommunicationFeedback>(null)
  const [requestProviderDrafts, setRequestProviderDrafts] = useState<Record<string, string>>({})

  const confirmedCount = appointments.filter((appointment) => appointment.status === 'confirmed').length
  const pendingCount = appointments.filter((appointment) => appointment.status === 'pending').length
  const today = manilaDate()
  const todayAppointments = appointments.filter((appointment) => appointment.date === today)
  const waitingCount = todayAppointments.filter((appointment) => appointment.status === 'waiting' || appointment.status === 'checked_in').length
  const inTreatmentCount = todayAppointments.filter((appointment) => appointment.status === 'in_progress').length
  const completedTodayCount = todayAppointments.filter((appointment) => appointment.status === 'completed').length
  const noShowTodayCount = todayAppointments.filter((appointment) => appointment.status === 'no_show').length
  const confirmedTodayCount = todayAppointments.filter((appointment) => appointment.status === 'confirmed').length
  const checkedInTodayCount = todayAppointments.filter((appointment) => appointment.status === 'checked_in').length

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

  function openPatientRecordForAppointment(appointment: Appointment) {
    const patient = patientMap.get(appointment.patientId)
    if (!patient) {
      if (import.meta.env.DEV) {
        console.warn('[appointments] unresolved appointment patient reference', {
          appointmentId: appointment.id,
          appointmentNumber: appointment.appointmentNumber,
          patientId: appointment.patientId,
        })
      }
      window.alert('Patient record could not be found.')
      return
    }
    navigate(`/app/patients/${encodeURIComponent(patient.patientId)}`)
  }

  const trendData = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = manilaDateOffset(index - 6)
    return {
      label: shortDateLabel(date),
      value: appointments.filter((appointment) => appointment.date === date).length,
    }
  }), [appointments])

  const statusData: StatusDatum[] = [
    { key: 'confirmed', label: 'Confirmed', value: confirmedTodayCount },
    { key: 'waiting', label: 'Waiting', value: waitingCount },
    { key: 'in_progress', label: 'In treatment', value: inTreatmentCount },
    { key: 'completed', label: 'Completed', value: completedTodayCount },
    { key: 'no_show', label: 'No show', value: noShowTodayCount },
  ]

  const branchLoad = useMemo(() => branches.map((branch) => ({
    branch,
    total: todayAppointments.filter((appointment) => appointment.branchId === branch.id).length,
    active: todayAppointments.filter((appointment) => appointment.branchId === branch.id && ['checked_in', 'waiting', 'in_progress'].includes(appointment.status)).length,
  })).sort((a, b) => b.total - a.total), [branches, todayAppointments])

  const upcomingWeek = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = manilaDateOffset(index)
    const dayAppointments = appointments.filter((appointment) => appointment.date === date)
    return {
      date,
      label: new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' }),
      day: new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', { day: 'numeric', timeZone: 'Asia/Manila' }),
      count: dayAppointments.length,
    }
  }), [appointments])

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

  function handleBookFollowUpAppointment(appointment: Appointment, recall: RecallQueueItem) {
    setSelectedAppointment(null)
    setPendingFollowUpRecall(recall)
    setFormValues({
      patientId: appointment.patientId,
      branchId: appointment.branchId || (branchFilter !== 'all' ? branchFilter : branches[0]?.id ?? ''),
      providerId: appointment.providerId ?? '',
      serviceId: appointment.serviceId,
      date: recall.dueDate || manilaDate(),
      startTime: '09:00',
      endTime: '09:30',
      durationMinutes: appointment.durationMinutes,
      estimatedAmountCents: appointment.estimatedAmountCents,
      paymentStatus: 'not_billed',
      depositStatus: 'not_required',
      depositRequiredCents: 0,
      depositPaidCents: 0,
      bookingSource: 'staff_entry',
      reasonForVisit: recall.reason || 'Follow-up appointment',
      patientNotes: '',
      internalNotes: `Booked from clinical follow-up recommendation ${recall.id} linked to ${appointment.appointmentNumber ?? appointment.id}.`,
      notes: '',
      status: 'pending',
    })
    setFormError(null)
    setConflictError(null)
    setShowForm(true)
  }

  function handleFormValueChange(values: AppointmentFormValues) {
    setFormValues(values)

    if (values.date && values.startTime && values.endTime) {
      const conflict = values.providerId || values.operatoryId
        ? getScheduleConflictDetail(values.date, values.startTime, values.endTime, undefined, values.providerId, values.branchId, values.operatoryId)
        : null
      if (conflict && 'appointment' in conflict) {
        const provider = conflict.appointment.providerId ? providerMap.get(conflict.appointment.providerId) : undefined
        setConflictError(`${provider?.displayName ?? 'The selected resource'} already has an appointment from ${formatAppointmentTime(conflict.appointment.startTime)} to ${formatAppointmentTime(conflict.appointment.endTime)}.`)
      } else if (checkScheduleConflict(values.date, values.startTime, values.endTime, undefined, values.providerId, values.branchId, values.operatoryId)) {
        setConflictError('This time overlaps an existing appointment. Please choose another slot.')
      } else {
        setConflictError(null)
      }
    }
  }

  async function handleSubmitForm() {
    if (isAppointmentSaving) return
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
      providerId: formValues.providerId || undefined,
      serviceId: formValues.serviceId,
      date: formValues.date,
    }).some((slot) => slot.startTime === formValues.startTime && (!formValues.providerId || slot.providerId === formValues.providerId))

    if (!availableSlot) {
      setFormError('That clinic time is no longer available. Please choose another time.')
      return
    }

    setIsAppointmentSaving(true)
    setFormError(null)
    try {
      const confirmed = await createAppointmentPersisted({
        ...formValues,
        endTime,
        durationMinutes: selectedService?.duration,
        estimatedAmountCents: undefined,
        depositStatus: formValues.depositStatus ?? 'not_required',
        depositRequiredCents: formValues.depositRequiredCents ?? 0,
        depositPaidCents: formValues.depositPaidCents ?? 0,
      }, user?.email ?? 'staff-entry')

      if (pendingFollowUpRecall) {
        await linkRecallToAppointment(pendingFollowUpRecall.id, confirmed.id)
        await listPatientRecalls(confirmed.patientId)
      }
      setAppointments(getStoredAppointments())
      setShowForm(false)
      setConflictError(null)
      setPendingFollowUpRecall(null)
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'The appointment could not be saved.')
    } finally {
      setIsAppointmentSaving(false)
    }
  }

  async function handleStatusChange(status: AppointmentStatus) {
    if (!selectedAppointment || isAppointmentSaving) return
    if (status === 'confirmed' && !selectedAppointment.providerId) {
      alert('Assign a dentist before confirming this appointment.')
      return
    }
    setIsAppointmentSaving(true)
    try {
      const updated = await transitionAppointmentStatusPersisted(selectedAppointment.id, status, {
        actor: user?.email ?? 'clinic-user',
        expectedUpdatedAt: selectedAppointment.updatedAt,
      })
      await completeLinkedRecallIfNeeded(updated)
      setAppointments(getStoredAppointments())
      setSelectedAppointment(updated)
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : 'The appointment status could not be changed.')
    } finally {
      setIsAppointmentSaving(false)
    }
  }

  async function handleAssignRequestProvider(appointmentId: string) {
    if (isAppointmentSaving) return
    const appointment = appointments.find((entry) => entry.id === appointmentId)
    if (!appointment) return
    const providerId = requestProviderDrafts[appointmentId] || appointment.proposedProviderId || ''
    if (!providerId) {
      setOperationError('Choose an eligible dentist before confirming this appointment request.')
      return
    }
    setIsAppointmentSaving(true)
    try {
      const updated = await assignAppointmentProviderPersisted({
        appointmentId,
        providerId,
        actor: user?.email ?? 'clinic-user',
        expectedUpdatedAt: appointment.updatedAt,
      })
      setAppointments(await loadAppointmentsFromSupabase({ strict: true }))
      setOperationError(`Appointment ${updated.appointmentNumber ?? updated.id} confirmed.`)
      setRequestProviderDrafts((current) => {
        const next = { ...current }
        delete next[appointmentId]
        return next
      })
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : 'The dentist could not be assigned.')
    } finally {
      setIsAppointmentSaving(false)
    }
  }

  async function handleRejectRequest(appointmentId: string) {
    if (isAppointmentSaving) return
    const appointment = appointments.find((entry) => entry.id === appointmentId)
    if (!appointment) return
    setIsAppointmentSaving(true)
    try {
      await transitionAppointmentStatusPersisted(appointmentId, 'rejected', {
        actor: user?.email ?? 'clinic-user',
        expectedUpdatedAt: appointment.updatedAt,
        reason: 'Rejected from appointment requests',
      })
      setAppointments(getStoredAppointments())
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : 'The request could not be rejected.')
    } finally {
      setIsAppointmentSaving(false)
    }
  }

  function openOperationAction(appointment: Appointment, status: AppointmentStatus, label: string, requiresReason = false) {
    setOperationAction({ appointment, status, label, requiresReason })
    setOperationReason('')
    setRescheduleDraft({
      date: appointment.date,
      startTime: appointment.startTime,
      providerId: appointment.providerId ?? '',
    })
    setOperationError(null)
  }

  async function confirmOperationAction() {
    if (!operationAction || isAppointmentSaving) return
    if (operationAction.requiresReason && !operationReason.trim()) {
      setOperationError('Please enter a reason before continuing.')
      return
    }

    setIsAppointmentSaving(true)
    setOperationError(null)
    try {
      const updated = operationAction.status === 'rescheduled'
        ? await confirmRescheduleOperation(operationAction.appointment)
        : await transitionAppointmentStatusPersisted(operationAction.appointment.id, operationAction.status, {
          actor: user?.email ?? 'clinic-user',
          reason: operationReason.trim(),
          expectedUpdatedAt: operationAction.appointment.updatedAt,
        })
      await completeLinkedRecallIfNeeded(updated)
      setAppointments(getStoredAppointments())
      setSelectedAppointment(updated)
      setOperationAction(null)
      setOperationReason('')
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : 'The appointment could not be updated.')
    } finally {
      setIsAppointmentSaving(false)
    }
  }

  async function confirmRescheduleOperation(appointment: Appointment) {
    const service = serviceMap.get(appointment.serviceId)
    const branchId = appointment.branchId ?? ''
    const providerId = rescheduleDraft.providerId.trim()
    const date = rescheduleDraft.date
    const startTime = rescheduleDraft.startTime
    const duration = service?.duration ?? appointment.durationMinutes ?? 30
    const endTime = addMinutesToTime(startTime, duration)

    if (!date) throw new Error('Choose a new appointment date.')
    if (!startTime) throw new Error('Choose a new appointment time.')
    if (!providerId) throw new Error('Choose the dentist for this rescheduled appointment.')

    const conflict = getScheduleConflictDetail(date, startTime, endTime, appointment.id, providerId, branchId, appointment.operatoryId)
    const unchangedSlot = date === appointment.date && startTime === appointment.startTime && providerId === appointment.providerId
    if (unchangedSlot) {
      throw new Error('Choose a new date, time, or dentist before confirming the reschedule.')
    }

    if (conflict && 'appointment' in conflict) {
      const provider = conflict.appointment.providerId ? providerMap.get(conflict.appointment.providerId) : undefined
      throw new Error(`${provider?.displayName ?? 'The selected dentist'} already has an appointment from ${formatAppointmentTime(conflict.appointment.startTime)} to ${formatAppointmentTime(conflict.appointment.endTime)}.`)
    }
    if (conflict && 'block' in conflict) {
      throw new Error(`This time is blocked for ${conflict.block.reason || conflict.block.type.replaceAll('_', ' ')}.`)
    }

    const availableSlot = getAvailableAppointmentSlots({
      branchId,
      providerId,
      serviceId: appointment.serviceId,
      date,
      excludeAppointmentId: appointment.id,
      operatoryId: appointment.operatoryId,
    }).some((slot) => slot.startTime === startTime && slot.providerId === providerId)

    if (!availableSlot) {
      throw new Error('The selected dentist is not available for that date and time.')
    }

    return rescheduleAppointmentPersisted(appointment.id, {
      branchId,
      providerId,
      date,
      startTime,
      endTime,
    }, {
      actor: user?.email ?? 'clinic-user',
      reason: operationReason.trim(),
      expectedUpdatedAt: appointment.updatedAt,
    })
  }

  async function handleManualResend(appointment: Appointment, templateKey: CommunicationTemplateKey) {
    if (!['appointment_confirmed', 'appointment_reminder', 'appointment_rescheduled'].includes(templateKey)) return
    const actionKey = `${appointment.id}:${templateKey}`
    if (communicationPendingKey) return

    setCommunicationPendingKey(actionKey)
    setCommunicationFeedback(null)
    try {
      const result = await resendAppointmentCommunicationPersisted(
        appointment.id,
        templateKey as 'appointment_confirmed' | 'appointment_reminder' | 'appointment_rescheduled',
        user?.email ?? 'clinic-user',
      )
      if (result.error) {
        setCommunicationFeedback({ appointmentId: appointment.id, tone: 'warning', message: result.error })
        return
      }

      const logs = result.logs ?? []
      const sentOrQueued = logs.filter((log) => ['sent', 'queued', 'delivered'].includes(log.status)).length
      const skipped = logs.filter((log) => log.status === 'skipped').length
      const failed = logs.filter((log) => log.status === 'failed').length
      const latest = logs[0]
      const summary = sentOrQueued
        ? `${sentOrQueued} channel${sentOrQueued === 1 ? '' : 's'} sent or queued.`
        : skipped
          ? `${skipped} channel${skipped === 1 ? '' : 's'} skipped by patient preferences, contact availability, or provider setup.`
          : 'No communication channel was eligible.'
      setCommunicationFeedback({
        appointmentId: appointment.id,
        tone: failed ? 'danger' : sentOrQueued ? 'success' : 'warning',
        message: latest ? `${summary} Last recorded: ${new Date(latest.createdAt).toLocaleString('en-PH')}.` : summary,
      })
      setAppointments(getStoredAppointments())
      setSelectedAppointment(getStoredAppointments().find((entry) => entry.id === appointment.id) ?? appointment)
    } catch (cause) {
      setCommunicationFeedback({ appointmentId: appointment.id, tone: 'danger', message: cause instanceof Error ? cause.message : 'The communication could not be recorded.' })
    } finally {
      setCommunicationPendingKey(null)
    }
  }

  async function openClinicalRecord(appointment: Appointment) {
    if (isAppointmentSaving) return
    setIsAppointmentSaving(true)
    try {
      const record = await createClinicalVisitFromAppointment(appointment, user?.email ?? 'clinic-user')
      setClinicalRecord(record)
    } catch (cause) {
      alert(cause instanceof Error ? cause.message : 'The clinical record could not be opened.')
    } finally {
      setIsAppointmentSaving(false)
    }
  }

  async function completeLinkedRecallIfNeeded(appointment: Appointment) {
    if (appointment.status !== 'completed') return
    try {
      const recalls = await listPatientRecalls(appointment.patientId)
      const linkedRecall = recalls.find((recall) => recall.linkedAppointmentId === appointment.id && recall.status === 'booked')
      if (linkedRecall) {
        await completeRecall(linkedRecall.id, appointment.id)
        await listPatientRecalls(appointment.patientId)
      }
    } catch (cause) {
      setOperationError(cause instanceof Error ? cause.message : 'The linked follow-up could not be marked complete.')
    }
  }

  function formatCurrency(cents: number) {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
    }).format(cents / 100)
  }

  function formatDate(dateString: string) {
    return new Date(`${dateString}T00:00:00+08:00`).toLocaleDateString('en-PH', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function handleCloseForm() {
    if (isAppointmentSaving) return
    setShowForm(false)
    setPendingFollowUpRecall(null)
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
    <section className="page-stack premium-appointments-page sa-appointments-page-v8">
      <header className="sa-appointments-header">
        <div className="sa-appointments-header-copy">
          <span className="sa-appointments-kicker">Scheduling command center</span>
          <h2>Appointments</h2>
          <p>Coordinate multi-branch appointments, patient flow, requests, and dentist assignments from one operational workspace.</p>
        </div>
        <div className="sa-appointments-header-actions">
          <button type="button" className="sa-appointments-date-chip" onClick={() => setViewTab('calendar')}>
            <CalendarDays size={17} />
            <span>{formatDate(today)}</span>
          </button>
          {permissions.can('appointments.create') && (
            <Button icon={<Plus size={16} />} onClick={() => handleAddAppointment(today)} disabled={isAppointmentSaving}>
              New appointment
            </Button>
          )}
        </div>
      </header>

      <section className="sa-appointments-kpi-grid" aria-label="Appointment overview">
        <article className="sa-appointments-kpi is-primary">
          <span className="sa-appointments-kpi-icon"><CalendarDays size={18} /></span>
          <div><span>Appointments today</span><strong>{todayAppointments.length}</strong><small>{confirmedTodayCount} confirmed before check-in</small></div>
        </article>
        <article className="sa-appointments-kpi">
          <span className="sa-appointments-kpi-icon"><UsersRound size={18} /></span>
          <div><span>Waiting / checked in</span><strong>{waitingCount}</strong><small>{checkedInTodayCount} currently checked in</small></div>
        </article>
        <article className="sa-appointments-kpi">
          <span className="sa-appointments-kpi-icon"><Stethoscope size={18} /></span>
          <div><span>In treatment</span><strong>{inTreatmentCount}</strong><small>Visits currently in progress</small></div>
        </article>
        <article className="sa-appointments-kpi">
          <span className="sa-appointments-kpi-icon"><CheckCircle2 size={18} /></span>
          <div><span>Completed today</span><strong>{completedTodayCount}</strong><small>{noShowTodayCount} recorded no-show</small></div>
        </article>
        <article className="sa-appointments-kpi">
          <span className="sa-appointments-kpi-icon"><Clock size={18} /></span>
          <div><span>Pending requests</span><strong>{pendingCount}</strong><small>Awaiting scheduling decision</small></div>
        </article>
      </section>

      <section className="sa-appointments-insights-grid">
        <AppointmentTrendChart data={trendData} />
        <AppointmentStatusDonut data={statusData} />
      </section>

      <section className="sa-appointments-overview-grid">
        <div className="sa-appointments-week-card">
          <div className="sa-appointments-card-heading">
            <div><span className="sa-appointments-kicker">Next 7 days</span><h3>Schedule pulse</h3><p>Select a day to open the calendar with that date.</p></div>
          </div>
          <div className="sa-appointments-week-strip">
            {upcomingWeek.map((day, index) => (
              <button
                key={day.date}
                type="button"
                className={index === 0 ? 'is-today' : ''}
                onClick={() => {
                  setDateFilter(day.date)
                  setViewTab('calendar')
                }}
              >
                <span>{day.label}</span><strong>{day.day}</strong><small>{day.count} {day.count === 1 ? 'visit' : 'visits'}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="sa-appointments-branch-card">
          <div className="sa-appointments-card-heading">
            <div><span className="sa-appointments-kicker">Branch load</span><h3>Today by location</h3><p>Current appointment volume and active in-clinic flow.</p></div>
          </div>
          <div className="sa-appointments-branch-list">
            {branchLoad.map(({ branch, total, active }) => {
              const maxBranch = Math.max(1, ...branchLoad.map((item) => item.total))
              return (
                <button key={branch.id} type="button" onClick={() => { setBranchFilter(branch.id); setViewTab('calendar') }}>
                  <div><strong>{branch.name}</strong><span>{active} active in clinic</span></div>
                  <div className="sa-appointments-branch-bar"><span style={{ width: `${(total / maxBranch) * 100}%` }} /></div>
                  <b>{total}</b>
                </button>
              )
            })}
            {!branchLoad.length && <div className="sa-appointments-empty-inline">No active branches are configured.</div>}
          </div>
        </div>
      </section>

      <div className="sa-appointments-view-switcher" role="tablist" aria-label="Appointment workspace view">
        <button type="button" role="tab" aria-selected={viewTab === 'queue'} className={viewTab === 'queue' ? 'is-active' : ''} onClick={() => setViewTab('queue')}>
          <UserRoundCheck size={16} /><span>Today’s flow</span>
        </button>
        <button type="button" role="tab" aria-selected={viewTab === 'calendar'} className={viewTab === 'calendar' ? 'is-active' : ''} onClick={() => setViewTab('calendar')}>
          <CalendarDays size={16} /><span>Calendar</span>
        </button>
        <button type="button" role="tab" aria-selected={viewTab === 'requests'} className={viewTab === 'requests' ? 'is-active' : ''} onClick={() => setViewTab('requests')}>
          <Clock size={16} /><span>Requests</span>{pendingCount > 0 && <b>{pendingCount}</b>}
        </button>
      </div>

      {viewTab === 'queue' && (
        <section className="operations-board sa-appointments-flow-board">
          <div className="operations-board-header sa-appointments-flow-header">
            <div>
              <span className="sa-appointments-kicker">Today’s patient journey</span>
              <h3>{new Date(`${today}T00:00:00+08:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}</h3>
              <p>Move patients through the existing appointment states without leaving the scheduling workspace.</p>
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
                <div key={column.key} className={`operations-column sa-appointments-flow-column column-${column.key}`}>
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
                      const openDetails = () => setSelectedAppointment(appointment)
                      const onCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openDetails()
                        }
                      }
                      return (
                        <article
                          key={appointment.id}
                          className={`operations-card sa-appointments-flow-card status-${appointment.status}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open appointment workspace for ${patient ? `${patient.firstName} ${patient.lastName}` : appointment.patientId}`}
                          onClick={openDetails}
                          onKeyDown={onCardKeyDown}
                        >
                          <div className="journey-card-main">
                            <div className="journey-patient-block">
                              <span className="journey-avatar" style={patient?.profileImage ? { backgroundImage: `url(${patient.profileImage})` } : undefined}>
                                {!patient?.profileImage && patientInitials(patient)}
                              </span>
                              <span className="journey-patient-copy">
                                <strong>{patient ? `${patient.firstName} ${patient.lastName}` : 'Patient'}</strong>
                                <small>{patient?.patientId ?? appointment.patientId}</small>
                              </span>
                            </div>
                            <div className="journey-care-block">
                              <strong>{service?.name ?? 'Service not assigned'}</strong>
                              <span><Stethoscope size={13} />{provider?.displayName ?? 'Dentist not assigned'}</span>
                              {waitMinutes !== null && <em>{appointment.status === 'waiting' ? 'Waiting' : 'In clinic'} {waitMinutes} min</em>}
                            </div>
                            <div className="journey-schedule-block">
                              <strong>{formatAppointmentTime(appointment.startTime)}</strong>
                              <span>{appointment.appointmentNumber ?? appointment.id}</span>
                            </div>
                          </div>
                          <div className="operations-card-actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                            {appointment.status === 'confirmed' && permissions.can('appointments.check_in') && (
                              <button type="button" className="text-button operations-card-action operations-card-action-primary" disabled={isAppointmentSaving} onClick={() => openOperationAction(appointment, 'checked_in', 'Check In')}>Check In</button>
                            )}
                            {appointment.status === 'checked_in' && permissions.can('appointments.check_in') && (
                              <button type="button" className="text-button operations-card-action operations-card-action-primary" disabled={isAppointmentSaving} onClick={() => openOperationAction(appointment, 'waiting', 'Move to Waiting')}>Move to Waiting</button>
                            )}
                            {appointment.status === 'waiting' && permissions.can('appointments.start') && (
                              <button type="button" className="text-button operations-card-action operations-card-action-primary" disabled={isAppointmentSaving} onClick={() => openOperationAction(appointment, 'in_progress', 'Start Visit')}>Start Visit</button>
                            )}
                            {appointment.status === 'in_progress' && permissions.can('appointments.complete') && (
                              <button type="button" className="text-button operations-card-action operations-card-action-primary" disabled={isAppointmentSaving} onClick={() => openOperationAction(appointment, 'completed', 'Complete Visit')}>Complete</button>
                            )}
                            {appointment.status === 'confirmed' && permissions.can('appointments.mark_no_show') && (
                              <button type="button" className="text-button operations-card-action operations-card-action-danger" disabled={isAppointmentSaving} onClick={() => openOperationAction(appointment, 'no_show', 'Mark No Show', true)}>No Show</button>
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
        <section className="sa-appointments-calendar-workspace">
          <div className="calendar-filter-bar sa-appointments-filter-bar">
            <div className="calendar-filter-header">
              <div><span className="sa-appointments-kicker"><Filter size={13} /> Schedule filters</span><p>Refine the calendar without changing underlying appointment data.</p></div>
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
                Clear filters
              </Button>
            </div>

            <div className="calendar-filter-grid">
              <div className="field-wrap">
                <label htmlFor="appointment-branch-filter">Branch</label>
                <select id="appointment-branch-filter" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
                  <option value="all">All branches</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </div>
              <div className="field-wrap">
                <label htmlFor="appointment-provider-filter">Dentist</label>
                <select id="appointment-provider-filter" value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)}>
                  <option value="all">All dentists</option>
                  {providers.filter((provider) => provider.status === 'active').map((provider) => <option key={provider.id} value={provider.id}>{provider.displayName}</option>)}
                </select>
              </div>
              <div className="field-wrap">
                <label htmlFor="appointment-status-filter">Status</label>
                <select id="appointment-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AppointmentStatus | 'all')}>
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="checked_in">Checked in</option>
                  <option value="waiting">Waiting</option>
                  <option value="in_progress">In treatment</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No show</option>
                </select>
              </div>
              <div className="field-wrap">
                <label htmlFor="appointment-service-filter">Service</label>
                <select id="appointment-service-filter" value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>
                  <option value="all">All services</option>
                  {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
              </div>
              <div className="field-wrap">
                <label htmlFor="appointment-date-filter">Date</label>
                <input id="appointment-date-filter" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
              </div>
              <label className="toolbar-search" htmlFor="appointment-search">
                <Search size={16} className="search-icon" />
                <input id="appointment-search" type="text" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Patient, phone or appointment number" />
              </label>
            </div>
          </div>

          <div className="sa-appointments-calendar-shell">
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
          </div>
        </section>
      )}

      {viewTab === 'requests' && (
        <section className="appointment-requests-panel sa-appointments-requests-panel">
          <div className="sa-appointments-requests-heading">
            <div><span className="sa-appointments-kicker">Decision queue</span><h3>Appointment requests</h3><p>Review patient requests using their recorded branch, provider, service, and appointment details.</p></div>
            <span className="sa-appointments-request-count">{pendingRequests.length}</span>
          </div>
          {operationError && <div className="inline-alert" role="alert">{operationError}</div>}
          {pendingRequests.length === 0 ? (
            <div className="empty-state-panel sa-appointments-empty-state">
              <Clock size={28} />
              <h3>No pending requests</h3>
              <p>All appointment requests have been reviewed.</p>
            </div>
          ) : (
            <div className="request-list sa-appointments-request-grid">
              {pendingRequests.map((request) => {
                const patient = patientMap.get(request.patientId)
                const service = serviceMap.get(request.serviceId)
                const branch = request.branchId ? branchMap.get(request.branchId) : undefined
                const eligibleDentists = request.branchId ? getEligibleProviders(request.branchId) : []
                const selectedRequestProviderId = requestProviderDrafts[request.id] || request.proposedProviderId || ''
                return (
                  <article
                    key={request.id}
                    className="request-card sa-appointments-request-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedAppointment(request)}
                    onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelectedAppointment(request)
                      }
                    }}
                  >
                    <div className="request-header">
                      <div className="request-main">
                        <div className="request-patient"><strong>{patient?.firstName} {patient?.lastName}</strong><small>{patient?.patientId}</small></div>
                        <div className="request-service"><p>{service?.name}</p></div>
                      </div>
                      <StatusBadge status="pending" />
                    </div>

                    <div className="request-details">
                      <div className="detail-col"><span className="detail-label">Date & Time</span><p>{formatDate(request.date)} • {request.startTime}</p></div>
                      <div className="detail-col"><span className="detail-label">Duration</span><p>{service?.duration ?? 30} minutes</p></div>
                      <div className="detail-col"><span className="detail-label">Price</span><strong>{service ? formatCurrency(service.price) : '—'}</strong></div>
                      <div className="detail-col"><span className="detail-label">Contact</span><p>{patient?.phone}</p></div>
                      <div className="detail-col"><span className="detail-label">Branch</span><p>{branch?.name ?? 'No branch'}</p></div>
                      <div className="detail-col"><span className="detail-label">Assigned dentist</span><p>None yet</p></div>
                    </div>

                    {canAssignDentist ? (
                      <label className="request-provider-select">
                        <span>Assign dentist</span>
                        <select
                          value={selectedRequestProviderId}
                          disabled={isAppointmentSaving || !eligibleDentists.length}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            event.stopPropagation()
                            const value = event.target.value
                            setRequestProviderDrafts((current) => ({ ...current, [request.id]: value }))
                            setOperationError(null)
                          }}
                        >
                          <option value="">{eligibleDentists.length ? 'Choose dentist' : 'No active dentist assigned to this branch'}</option>
                          {eligibleDentists.map((dentist) => <option key={dentist.id} value={dentist.id}>{dentist.displayName}</option>)}
                        </select>
                        <small>Active dentists assigned to this branch are shown. Supabase checks appointment conflicts before confirming.</small>
                      </label>
                    ) : (
                      <div className="request-provider-select" aria-label="Dentist assignment status">
                        <span>Dentist assignment</span>
                        <strong>Not assigned yet</strong>
                        <small>An authorized staff member can accept and assign this request.</small>
                      </div>
                    )}

                    {request.notes && <div className="request-notes"><span className="detail-label">Notes</span><p>{request.notes}</p></div>}

                    <div className="request-actions">
                      {canAssignDentist && <Button disabled={isAppointmentSaving || !selectedRequestProviderId} onClick={(event) => { event.stopPropagation(); void handleAssignRequestProvider(request.id) }}><CheckCircle2 size={16} />Accept & Assign Dentist</Button>}
                      {permissions.can('appointments.reject') && <Button disabled={isAppointmentSaving} variant="secondary" onClick={(event) => { event.stopPropagation(); void handleRejectRequest(request.id) }} className="btn-danger"><XCircle size={16} />Reject request</Button>}
                    </div>
                  </article>
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
          onSubmit={() => void handleSubmitForm()}
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
          onStatusChange={(status) => void handleStatusChange(status)}
          onActionRequest={(appointment, status, label, requiresReason) => openOperationAction(appointment, status, label, requiresReason)}
          onManualResend={handleManualResend}
          communicationPendingKey={communicationPendingKey}
          communicationFeedback={communicationFeedback?.appointmentId === selectedAppointment.id ? communicationFeedback : null}
          onOpenPatientRecord={openPatientRecordForAppointment}
          onOpenClinicalRecord={(appointment) => void openClinicalRecord(appointment)}
          onBookFollowUp={handleBookFollowUpAppointment}
          onViewFollowUpRecommendation={setSelectedFollowUpRecommendation}
        />
      )}

      {selectedFollowUpRecommendation && createPortal(
        <div className="modal-backdrop modal-layer-child followup-recommendation-backdrop-v7" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedFollowUpRecommendation(null) }}>
          <section className="modal followup-recommendation-modal-v7" role="dialog" aria-modal="true" aria-labelledby="followup-recommendation-title">
            <header>
              <span><HeartPulse size={21} /></span>
              <div>
                <p className="eyebrow">Clinical follow-up</p>
                <h2 id="followup-recommendation-title">Follow-up recommendation</h2>
                <p>{selectedFollowUpRecommendation.patientName || selectedFollowUpRecommendation.patientId}</p>
              </div>
              <button type="button" aria-label="Close recommendation" onClick={() => setSelectedFollowUpRecommendation(null)}><XCircle size={18} /></button>
            </header>
            <div className="followup-recommendation-body-v7">
              <div><span>Recommended date</span><strong>{selectedFollowUpRecommendation.dueDate ? formatDate(selectedFollowUpRecommendation.dueDate) : 'No date recorded'}</strong></div>
              <div><span>Status</span><strong>{selectedFollowUpRecommendation.status.replaceAll('_', ' ')}</strong></div>
              <div><span>Dentist</span><strong>{selectedFollowUpRecommendation.providerName || 'Dental care team'}</strong></div>
              <div><span>Type</span><strong>{selectedFollowUpRecommendation.kind.replaceAll('_', ' ')}</strong></div>
              <section>
                <span>Clinical reason</span>
                <p>{selectedFollowUpRecommendation.reason || 'Clinical follow-up recommended.'}</p>
              </section>
              {selectedFollowUpRecommendation.patientMessage && <section><span>Patient message</span><p>{selectedFollowUpRecommendation.patientMessage}</p></section>}
              {selectedFollowUpRecommendation.linkedAppointmentId && <section><span>Linked appointment</span><p>{selectedFollowUpRecommendation.linkedAppointmentId}</p></section>}
            </div>
            <footer>
              {selectedFollowUpRecommendation.status !== 'booked' && !selectedFollowUpRecommendation.linkedAppointmentId && selectedAppointment && (
                <Button onClick={() => {
                  handleBookFollowUpAppointment(selectedAppointment, selectedFollowUpRecommendation)
                  setSelectedFollowUpRecommendation(null)
                }}>Book follow-up</Button>
              )}
              <Button variant="secondary" onClick={() => setSelectedFollowUpRecommendation(null)}>Close</Button>
            </footer>
          </section>
        </div>,
        document.body
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

      {operationAction && createPortal(
        <div className="modal-backdrop modal-layer-child operation-action-backdrop" role="presentation">
          {(() => {
            const appointment = operationAction.appointment
            const patient = patientMap.get(appointment.patientId)
            const service = serviceMap.get(appointment.serviceId)
            const provider = appointment.providerId ? providerMap.get(appointment.providerId) : undefined
            const branch = appointment.branchId ? branchMap.get(appointment.branchId) : undefined
            const duration = service?.duration ?? appointment.durationMinutes ?? 30
            const rescheduleEndTime = rescheduleDraft.startTime ? addMinutesToTime(rescheduleDraft.startTime, duration) : appointment.endTime
            const eligibleProviders = appointment.branchId ? getEligibleProviders(appointment.branchId) : providers.filter((entry) => entry.status === 'active')
            const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'Patient appointment'
            const appointmentNumber = appointment.appointmentNumber ?? appointment.id
            const isReschedule = operationAction.status === 'rescheduled'
            const isCancel = operationAction.status === 'cancelled'
            const isNoShow = operationAction.status === 'no_show'
            const toneClass = isCancel || isNoShow ? 'is-danger' : isReschedule ? 'is-reschedule' : 'is-neutral'
            const title = isReschedule ? 'Reschedule appointment' : isCancel ? 'Cancel appointment' : isNoShow ? 'Mark as no show' : operationAction.label
            const kicker = isReschedule ? 'Schedule change' : isCancel ? 'Destructive action' : isNoShow ? 'Attendance exception' : 'Appointment operation'
            const explanation = isReschedule
              ? 'Choose a new date, time, and dentist. The system will check appointment conflicts before saving.'
              : isCancel
                ? 'This will cancel the appointment and remove it from active clinic flow. Keep the reason clear for audit history.'
                : isNoShow
                  ? 'Use this only when the patient did not attend the scheduled appointment. This is separate from cancellation.'
                  : 'Confirm this appointment workflow update.'
            const closeLabel = isReschedule ? 'Keep current appointment' : isCancel ? 'Keep appointment' : isNoShow ? 'Go back' : 'Cancel'
            const primaryLabel = isReschedule ? 'Confirm reschedule' : isCancel ? 'Cancel appointment' : isNoShow ? 'Mark as no show' : 'Confirm'

            return (
              <section className={`modal operation-action-modal operation-dialog-v55 ${toneClass}`} role="dialog" aria-modal="true" aria-labelledby="operation-action-title" aria-describedby="operation-action-description">
                <div className="operation-dialog-v55-header">
                  <span className="operation-dialog-v55-icon" aria-hidden="true">
                    {isReschedule ? <RefreshCw size={22} /> : isCancel ? <CalendarX2 size={22} /> : isNoShow ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
                  </span>
                  <div>
                    <p className="eyebrow">{kicker}</p>
                    <h2 id="operation-action-title">{title}</h2>
                    <p id="operation-action-description">{explanation}</p>
                  </div>
                  <button className="operation-dialog-v55-close" type="button" aria-label="Close" disabled={isAppointmentSaving} onClick={() => setOperationAction(null)}><XCircle size={18} /></button>
                </div>

                <div className="operation-dialog-v55-body">
                  <section className="operation-dialog-v55-context" aria-label="Appointment context">
                    <div className="operation-dialog-v55-patient">
                      <span><UserRound size={18} /></span>
                      <div>
                        <strong>{patientName}</strong>
                        <small>{patient?.patientId ?? appointment.patientId} - {appointmentNumber}</small>
                      </div>
                    </div>
                    <dl>
                      <div><dt>Current date</dt><dd>{formatDate(appointment.date)}</dd></div>
                      <div><dt>Current time</dt><dd>{formatAppointmentTime(appointment.startTime)} - {formatAppointmentTime(appointment.endTime)}</dd></div>
                      <div><dt>Dentist</dt><dd>{provider?.displayName ?? 'Not assigned'}</dd></div>
                      <div><dt>Service</dt><dd>{service?.name ?? 'Service not assigned'}</dd></div>
                      <div><dt>Branch</dt><dd>{branch?.name ?? 'No branch assigned'}</dd></div>
                    </dl>
                  </section>

                  {isReschedule && (
                    <section className="operation-dialog-v55-form" aria-label="New appointment schedule">
                      <div className="operation-dialog-v55-field-grid">
                        <label>
                          <span>New date</span>
                          <input disabled={isAppointmentSaving} type="date" value={rescheduleDraft.date} onChange={(event) => setRescheduleDraft((draft) => ({ ...draft, date: event.target.value }))} />
                        </label>
                        <label>
                          <span>New time</span>
                          <input disabled={isAppointmentSaving} type="time" value={rescheduleDraft.startTime} onChange={(event) => setRescheduleDraft((draft) => ({ ...draft, startTime: event.target.value }))} />
                        </label>
                      </div>
                      <label>
                        <span>Dentist</span>
                        <select disabled={isAppointmentSaving} value={rescheduleDraft.providerId} onChange={(event) => setRescheduleDraft((draft) => ({ ...draft, providerId: event.target.value }))}>
                          <option value="">Select dentist</option>
                          {eligibleProviders.map((entry) => <option key={entry.id} value={entry.id}>{entry.displayName}</option>)}
                        </select>
                      </label>
                      <div className="operation-dialog-v55-new-slot">
                        <CalendarDays size={15} />
                        <span>{rescheduleDraft.date || 'No date selected'} - {rescheduleDraft.startTime ? `${formatAppointmentTime(rescheduleDraft.startTime)} - ${formatAppointmentTime(rescheduleEndTime)}` : 'No time selected'}</span>
                      </div>
                    </section>
                  )}

                  <label className="operation-dialog-v55-note">
                    <span>{operationAction.requiresReason || isCancel || isNoShow ? 'Reason' : 'Note'}</span>
                    <textarea
                      disabled={isAppointmentSaving}
                      value={operationReason}
                      onChange={(event) => setOperationReason(event.target.value)}
                      placeholder={isReschedule ? 'Reason for the schedule change' : isCancel ? 'Reason for cancellation' : isNoShow ? 'Optional note about the missed visit' : 'Optional note'}
                      rows={4}
                    />
                  </label>

                  {operationError && <div className="inline-alert operation-dialog-v55-alert" role="alert">{operationError}</div>}
                </div>

                <div className="operation-dialog-v55-actions">
                  <Button variant="secondary" disabled={isAppointmentSaving} onClick={() => setOperationAction(null)}>{closeLabel}</Button>
                  <Button variant={isCancel || isNoShow ? 'danger' : 'primary'} disabled={isAppointmentSaving} onClick={() => void confirmOperationAction()}>{isAppointmentSaving ? 'Saving...' : primaryLabel}</Button>
                </div>
              </section>
            )
          })()}
        </div>,
        document.body
      )}
    </section>
  )
}
