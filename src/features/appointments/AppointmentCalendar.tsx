import { Fragment, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { Branch } from '../branches/branchTypes'
import type { Provider } from '../dentists/dentistTypes'
import type { Patient } from '../patients/patientTypes'
import type { Service } from '../services/serviceTypes'
import type { Appointment } from './appointmentTypes'
import { formatAppointmentTime, getCalendarOperatingHours } from './availabilityEngine'
import { getProviderBranchAssignments } from '../dentists/dentistStore'
import { getPatientDisplayName } from '../patients/patientStore'

type CalendarViewType = 'day' | 'week' | 'month' | 'agenda'

type AppointmentCalendarProps = {
  appointments: Appointment[]
  patients: Map<string, Patient>
  services: Map<string, Service>
  branches: Map<string, Branch>
  providers: Map<string, Provider>
  branchFilter?: string
  onSelectAppointment: (appointment: Appointment) => void
  onAddAppointment: (date: string, time?: string) => void
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPatientName(patient?: Patient) {
  return patient ? getPatientDisplayName(patient) : 'Patient record unavailable'
}

function getDateLabel(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function AppointmentCalendar({
  appointments,
  branchFilter,
  branches,
  onAddAppointment,
  onSelectAppointment,
  patients,
  providers,
  services,
}: AppointmentCalendarProps) {
  const [view, setView] = useState<CalendarViewType>('week')
  const [currentDate, setCurrentDate] = useState(new Date())

  function goToPrevious() {
    if (view === 'day') setCurrentDate((current) => addDays(current, -1))
    else if (view === 'week' || view === 'agenda') setCurrentDate((current) => addDays(current, -7))
    else setCurrentDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
  }

  function goToNext() {
    if (view === 'day') setCurrentDate((current) => addDays(current, 1))
    else if (view === 'week' || view === 'agenda') setCurrentDate((current) => addDays(current, 7))
    else setCurrentDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
  }

  const sharedProps = {
    appointments,
    branchFilter,
    branches,
    currentDate,
    onAddAppointment,
    onChangeDate: setCurrentDate,
    onChangeView: setView,
    onNext: goToNext,
    onPrevious: goToPrevious,
    onSelectAppointment,
    onToday: () => setCurrentDate(new Date()),
    patients,
    providers,
    services,
    view,
  }

  if (view === 'day') return <DayView {...sharedProps} />
  if (view === 'week') return <WeekView {...sharedProps} />
  if (view === 'agenda') return <AgendaView {...sharedProps} />
  return <MonthView {...sharedProps} />
}

function CalendarShell({
  children,
  currentDate,
  onAddAppointment,
  onChangeView,
  onNext,
  onPrevious,
  onToday,
  title,
  view,
}: {
  children: React.ReactNode
  currentDate: Date
  onAddAppointment: (date: string) => void
  onChangeView: (view: CalendarViewType) => void
  onNext: () => void
  onPrevious: () => void
  onToday: () => void
  title: string
  view: CalendarViewType
}) {
  return (
    <div className="calendar-container advanced-calendar-container">
      <div className="calendar-header advanced-calendar-header">
        <div className="calendar-nav">
          <button type="button" onClick={onPrevious} className="icon-button" aria-label="Previous">
            <ChevronLeft size={18} />
          </button>
          <div className="calendar-title">
            <h3>{title}</h3>
          </div>
          <button type="button" onClick={onNext} className="icon-button" aria-label="Next">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="calendar-actions">
          <Button variant="secondary" size="sm" onClick={onToday}>Today</Button>
          <Button variant="secondary" size="sm" icon={<Plus size={16} />} onClick={() => onAddAppointment(formatDate(currentDate))}>New</Button>
          <div className="view-toggle">
            {(['day', 'week', 'month', 'agenda'] as const).map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={`view-btn ${view === candidate ? 'is-active' : ''}`}
                onClick={() => onChangeView(candidate)}
              >
                {candidate.charAt(0).toUpperCase() + candidate.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

type ViewProps = {
  appointments: Appointment[]
  branchFilter?: string
  branches: Map<string, Branch>
  currentDate: Date
  onAddAppointment: (date: string, time?: string) => void
  onChangeDate: (date: Date) => void
  onChangeView: (view: CalendarViewType) => void
  onNext: () => void
  onPrevious: () => void
  onSelectAppointment: (appointment: Appointment) => void
  onToday: () => void
  patients: Map<string, Patient>
  providers: Map<string, Provider>
  services: Map<string, Service>
  view: CalendarViewType
}

function AppointmentCard({
  appointment,
  branches,
  compact = false,
  onSelectAppointment,
  patients,
  providers,
  services,
}: {
  appointment: Appointment
  branches: Map<string, Branch>
  compact?: boolean
  onSelectAppointment: (appointment: Appointment) => void
  patients: Map<string, Patient>
  providers: Map<string, Provider>
  services: Map<string, Service>
}) {
  const patient = patients.get(appointment.patientId)
  const service = services.get(appointment.serviceId)
  const branch = appointment.branchId ? branches.get(appointment.branchId) : undefined
  const provider = appointment.providerId ? providers.get(appointment.providerId) : undefined

  return (
    <button type="button" className={`appointment-rich-block status-${appointment.status} ${compact ? 'is-compact' : ''}`} onClick={() => onSelectAppointment(appointment)}>
      <span>{formatAppointmentTime(appointment.startTime)}</span>
      <strong>{getPatientName(patient)}</strong>
      {!compact && <small>{service?.name ?? 'Service'} - {provider?.displayName ?? 'Any dentist'}</small>}
      {!compact && <small>{branch?.name ?? 'No branch'} - {appointment.status.replaceAll('_', ' ')}</small>}
    </button>
  )
}

function DayView(props: ViewProps) {
  const dateStr = formatDate(props.currentDate)
  const dayAppointments = props.appointments
    .filter((appointment) => appointment.date === dateStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
  const hours = getHours(props.branchFilter)
  const assignments = getProviderBranchAssignments()
  const providerColumns = Array.from(props.providers.values())
    .filter((provider) => provider.status === 'active')
    .filter((provider) => !props.branchFilter || props.branchFilter === 'all' || assignments.some((assignment) => assignment.providerId === provider.id && assignment.branchId === props.branchFilter && assignment.status === 'active'))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  const visibleProviders = providerColumns.length ? providerColumns : [{ id: 'unassigned', displayName: 'Unassigned', role: 'dentist' as const, email: '', phone: '', specialization: '', licenseNumber: '', bio: '', photoUrl: '', status: 'active' as const, createdAt: '', updatedAt: '' }]

  return (
    <CalendarShell {...props} title={getDateLabel(dateStr)}>
      <div className="provider-day-view" style={{ gridTemplateColumns: `92px repeat(${visibleProviders.length}, minmax(190px, 1fr))` }}>
        <div className="provider-day-corner">Time</div>
        {visibleProviders.map((provider) => (
          <div key={provider.id} className="provider-day-heading">
            <strong>{provider.displayName}</strong>
            <span>{provider.role.replace('_', ' ')}</span>
          </div>
        ))}
        {hours.map((hour) => {
          const time = `${String(hour).padStart(2, '0')}:00`
          const nextHour = `${String(hour + 1).padStart(2, '0')}:00`
          return (
            <Fragment key={`hour-${hour}`}>
              <div key={`label-${hour}`} className="provider-day-time">{formatAppointmentTime(time)}</div>
              {visibleProviders.map((provider) => {
                const slotAppointments = dayAppointments.filter((appointment) => (
                  appointment.startTime >= time &&
                  appointment.startTime < nextHour &&
                  (provider.id === 'unassigned' ? !appointment.providerId : appointment.providerId === provider.id)
                ))
                return (
                  <div key={`${provider.id}-${hour}`} className="provider-day-cell" onDoubleClick={() => props.onAddAppointment(dateStr, time)}>
                    {slotAppointments.map((appointment) => (
                      <AppointmentCard key={appointment.id} appointment={appointment} branches={props.branches} onSelectAppointment={props.onSelectAppointment} patients={props.patients} providers={props.providers} services={props.services} />
                    ))}
                    {slotAppointments.length === 0 && (
                      <button type="button" className="add-slot" onClick={() => props.onAddAppointment(dateStr, time)}>
                        <Plus size={14} /> Add
                      </button>
                    )}
                  </div>
                )
              })}
            </Fragment>
          )
        })}
      </div>
    </CalendarShell>
  )
}

function WeekView(props: ViewProps) {
  const startOfWeek = new Date(props.currentDate)
  startOfWeek.setDate(props.currentDate.getDate() - ((props.currentDate.getDay() + 6) % 7))
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek, index))
  const hours = getHours(props.branchFilter)

  return (
    <CalendarShell {...props} title={`${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}>
      <div className="advanced-week-view">
        <div className="week-time-axis" />
        {weekDays.map((date) => <div key={formatDate(date)} className="advanced-week-heading">{date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</div>)}
        {hours.map((hour) => (
          <>
            <div key={`label-${hour}`} className="week-time-axis">{formatAppointmentTime(`${String(hour).padStart(2, '0')}:00`)}</div>
            {weekDays.map((date) => {
              const dateStr = formatDate(date)
              const time = `${String(hour).padStart(2, '0')}:00`
              const slotAppointments = props.appointments.filter((appointment) => appointment.date === dateStr && appointment.startTime >= time && appointment.startTime < `${String(hour + 1).padStart(2, '0')}:00`)
              return (
                <div key={`${dateStr}-${hour}`} className="advanced-week-cell" onDoubleClick={() => props.onAddAppointment(dateStr, time)}>
                  {slotAppointments.map((appointment) => (
                    <AppointmentCard key={appointment.id} compact appointment={appointment} branches={props.branches} onSelectAppointment={props.onSelectAppointment} patients={props.patients} providers={props.providers} services={props.services} />
                  ))}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </CalendarShell>
  )
}

function MonthView(props: ViewProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const year = props.currentDate.getFullYear()
  const month = props.currentDate.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const days: Array<Date | null> = []
  for (let index = 0; index < firstDay.getDay(); index += 1) days.push(null)
  for (let day = 1; day <= lastDay.getDate(); day += 1) days.push(new Date(year, month, day))
  const selectedDayAppointments = selectedDay ? props.appointments.filter((appointment) => appointment.date === selectedDay).sort((a, b) => a.startTime.localeCompare(b.startTime)) : []

  return (
    <CalendarShell {...props} title={props.currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}>
      <div className="advanced-month-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="month-day-header">{day}</div>)}
        {days.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} className="month-cell empty" />
          const dateStr = formatDate(date)
          const dayAppointments = props.appointments.filter((appointment) => appointment.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime))
          const isToday = dateStr === formatDate(new Date())
          return (
            <button key={dateStr} type="button" className={`advanced-month-cell ${isToday ? 'is-today' : ''}`} onClick={() => setSelectedDay(dateStr)}>
              <span className="month-cell-date">{date.getDate()}</span>
              <small>{dayAppointments.length} appointments</small>
              {dayAppointments.slice(0, 3).map((appointment) => (
                <span key={appointment.id} className={`mini-appointment status-${appointment.status}`}>
                  {formatAppointmentTime(appointment.startTime)} {getPatientName(props.patients.get(appointment.patientId))}
                </span>
              ))}
              {dayAppointments.length > 3 && <span className="mini-appointment-more">+{dayAppointments.length - 3} more</span>}
            </button>
          )
        })}
      </div>

      {selectedDay && (
        <div className="day-panel-backdrop" onClick={() => setSelectedDay(null)}>
          <aside className="day-panel" onClick={(event) => event.stopPropagation()}>
            <div className="day-panel-header">
              <div>
                <p className="eyebrow">Day schedule</p>
                <h3>{getDateLabel(selectedDay)}</h3>
                <span>{selectedDayAppointments.length} appointments</span>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedDay(null)} aria-label="Close day schedule">
                <X size={18} />
              </button>
            </div>
            <div className="day-panel-list">
              {selectedDayAppointments.map((appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} branches={props.branches} onSelectAppointment={props.onSelectAppointment} patients={props.patients} providers={props.providers} services={props.services} />
              ))}
              {selectedDayAppointments.length === 0 && (
                <div className="empty-state-panel">
                  <CalendarDays size={24} />
                  <h3>No appointments</h3>
                  <p>This day has no scheduled appointments.</p>
                </div>
              )}
            </div>
            <Button icon={<Plus size={16} />} onClick={() => props.onAddAppointment(selectedDay)}>New appointment</Button>
          </aside>
        </div>
      )}
    </CalendarShell>
  )
}

function AgendaView(props: ViewProps) {
  const start = new Date(props.currentDate)
  const days = Array.from({ length: 14 }, (_, index) => formatDate(addDays(start, index)))

  return (
    <CalendarShell {...props} title={`Agenda from ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}>
      <div className="agenda-view">
        {days.map((date) => {
          const dayAppointments = props.appointments.filter((appointment) => appointment.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime))
          return (
            <section key={date} className="agenda-day">
              <div className="agenda-day-header">
                <h4>{getDateLabel(date)}</h4>
                <span>{dayAppointments.length}</span>
              </div>
              {dayAppointments.map((appointment) => (
                <AppointmentCard key={appointment.id} appointment={appointment} branches={props.branches} onSelectAppointment={props.onSelectAppointment} patients={props.patients} providers={props.providers} services={props.services} />
              ))}
              {dayAppointments.length === 0 && <div className="agenda-empty">No appointments scheduled.</div>}
            </section>
          )
        })}
      </div>
    </CalendarShell>
  )
}

function getHours(branchId?: string) {
  const { openingTime, closingTime } = getCalendarOperatingHours(branchId)
  const openingHour = Number(openingTime.slice(0, 2))
  const closingHour = Number(closingTime.slice(0, 2))
  return Array.from({ length: Math.max(closingHour - openingHour + 1, 1) }, (_, index) => openingHour + index)
}
