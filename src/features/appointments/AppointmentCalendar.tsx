import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { Appointment } from './appointmentTypes'
import type { Patient } from '../patients/patientTypes'
import type { Service } from '../services/serviceTypes'

type CalendarViewType = 'day' | 'week' | 'month'

type AppointmentCalendarProps = {
  appointments: Appointment[]
  patients: Map<string, Patient>
  services: Map<string, Service>
  onSelectAppointment: (appointment: Appointment) => void
  onAddAppointment: (date: string, time?: string) => void
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatTime(timeStr: string): string {
  const [hour, minute] = timeStr.split(':')
  const h = Number.parseInt(hour, 10)
  const period = h >= 12 ? 'PM' : 'AM'
  const displayHour = h % 12 === 0 ? 12 : h % 12
  return `${displayHour}:${minute} ${period}`
}

export function AppointmentCalendar({
  appointments,
  onSelectAppointment,
  onAddAppointment,
  patients,
  services,
}: AppointmentCalendarProps) {
  const [view, setView] = useState<CalendarViewType>('month')
  const [currentDate, setCurrentDate] = useState(new Date())

  function goToPrevious() {
    const newDate = new Date(currentDate)
    if (view === 'day') {
      newDate.setDate(newDate.getDate() - 1)
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7)
    } else {
      newDate.setMonth(newDate.getMonth() - 1)
    }
    setCurrentDate(newDate)
  }

  function goToNext() {
    const newDate = new Date(currentDate)
    if (view === 'day') {
      newDate.setDate(newDate.getDate() + 1)
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7)
    } else {
      newDate.setMonth(newDate.getMonth() + 1)
    }
    setCurrentDate(newDate)
  }

  function goToToday() {
    setCurrentDate(new Date())
  }

  const sharedProps = {
    appointments,
    currentDate,
    patients,
    services,
    onSelectAppointment,
    onAddAppointment,
    onPrevious: goToPrevious,
    onNext: goToNext,
    onToday: goToToday,
    onChangeView: setView,
  }

  if (view === 'day') {
    return <DayView {...sharedProps} />
  }

  if (view === 'week') {
    return <WeekView {...sharedProps} />
  }

  return <MonthView {...sharedProps} />
}

function DayView({
  appointments,
  currentDate,
  onAddAppointment,
  onChangeView,
  onNext,
  onPrevious,
  onSelectAppointment,
  onToday,
  patients,
  services,
}: {
  currentDate: Date
  appointments: Appointment[]
  patients: Map<string, Patient>
  services: Map<string, Service>
  onSelectAppointment: (appointment: Appointment) => void
  onAddAppointment: (date: string, time?: string) => void
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onChangeView: (view: CalendarViewType) => void
}) {
  const dateStr = formatDate(currentDate)
  const dayAppointments = appointments
    .filter((appointment) => appointment.date === dateStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  const hours = Array.from({ length: 11 }, (_, index) => index + 8)

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <div className="calendar-nav">
          <button type="button" onClick={onPrevious} className="icon-button" aria-label="Previous day">
            <ChevronLeft size={18} />
          </button>
          <div className="calendar-title">
            <h3>{currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>
          </div>
          <button type="button" onClick={onNext} className="icon-button" aria-label="Next day">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="calendar-actions">
          <Button variant="secondary" size="sm" onClick={onToday}>
            Today
          </Button>
          <Button variant="secondary" size="sm" icon={<Plus size={16} />} onClick={() => onAddAppointment(dateStr)}>
            New
          </Button>
          <div className="view-toggle">
            {(['day', 'week', 'month'] as const).map((view) => (
              <button
                key={view}
                type="button"
                className={`view-btn ${view === 'day' ? 'is-active' : ''}`}
                onClick={() => onChangeView(view)}
              >
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="day-view">
        <div className="time-slots">
          {hours.map((hour) => {
            const timeStr = `${String(hour).padStart(2, '0')}:00`
            const slotAppointments = dayAppointments.filter(
              (appointment) => appointment.startTime >= timeStr && appointment.startTime < `${String(hour + 1).padStart(2, '0')}:00`
            )

            return (
              <div key={hour} className="time-slot">
                <div className="time-label">{formatTime(timeStr)}</div>
                <div className="slot-content">
                  {slotAppointments.map((appointment) => {
                    const patient = patients.get(appointment.patientId)
                    const service = services.get(appointment.serviceId)

                    return (
                      <div
                        key={appointment.id}
                        className={`appointment-block status-${appointment.status}`}
                        onClick={() => onSelectAppointment(appointment)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onSelectAppointment(appointment)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="appointment-time-row">
                          <span className="appointment-time">{formatTime(appointment.startTime)}</span>
                          <span className="status-pill">{appointment.status.replace('_', ' ')}</span>
                        </div>
                        <div className="appointment-patient">{patient ? `${patient.firstName} ${patient.lastName}` : 'Patient'}</div>
                        <div className="appointment-service">{service?.name ?? 'Service'}</div>
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    className="add-slot"
                    aria-label={`Add appointment for ${dateStr} at ${timeStr}`}
                    onClick={() => onAddAppointment(dateStr, timeStr)}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WeekView({
  appointments,
  currentDate,
  onAddAppointment,
  onChangeView,
  onNext,
  onPrevious,
  onSelectAppointment,
  onToday,
  patients,
}: {
  currentDate: Date
  appointments: Appointment[]
  patients: Map<string, Patient>
  services: Map<string, Service>
  onSelectAppointment: (appointment: Appointment) => void
  onAddAppointment: (date: string, time?: string) => void
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onChangeView: (view: CalendarViewType) => void
}) {
  const startOfWeek = new Date(currentDate)
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay())

  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startOfWeek)
    date.setDate(date.getDate() + index)
    return date
  })

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <div className="calendar-nav">
          <button type="button" onClick={onPrevious} className="icon-button" aria-label="Previous week">
            <ChevronLeft size={18} />
          </button>
          <div className="calendar-title">
            <h3>
              {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} -{' '}
              {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </h3>
          </div>
          <button type="button" onClick={onNext} className="icon-button" aria-label="Next week">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="calendar-actions">
          <Button variant="secondary" size="sm" onClick={onToday}>
            Today
          </Button>
          <div className="view-toggle">
            {(['day', 'week', 'month'] as const).map((view) => (
              <button
                key={view}
                type="button"
                className={`view-btn ${view === 'week' ? 'is-active' : ''}`}
                onClick={() => onChangeView(view)}
              >
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="week-view">
        <div className="week-grid">
          {weekDays.map((date) => {
            const dateStr = formatDate(date)
            const dayAppointments = appointments
              .filter((appointment) => appointment.date === dateStr)
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
            const isToday = dateStr === formatDate(new Date())

            return (
              <div key={dateStr} className="week-column">
                <div className="week-day-header">
                  <div className={`day-name ${isToday ? 'is-today' : ''}`}>
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className={`day-date ${isToday ? 'is-today' : ''}`}>
                    {date.getDate()}
                  </div>
                  <button type="button" className="week-add-button" onClick={() => onAddAppointment(dateStr)}>
                    <Plus size={12} /> Add
                  </button>
                </div>
                <div className="week-appointments">
                  {dayAppointments.map((appointment) => {
                    const patient = patients.get(appointment.patientId)

                    return (
                      <div
                        key={appointment.id}
                        className={`appointment-card status-${appointment.status}`}
                        onClick={() => onSelectAppointment(appointment)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onSelectAppointment(appointment)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="appointment-card-top">
                          <span className="appointment-time">{formatTime(appointment.startTime)}</span>
                          <span className="status-dot" aria-hidden="true" />
                        </div>
                        <div className="appointment-patient">{patient ? `${patient.firstName} ${patient.lastName}` : 'Patient'}</div>
                        <div className="appointment-service">{appointment.status.replace('_', ' ')}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthView({
  appointments,
  currentDate,
  onAddAppointment,
  onChangeView,
  onNext,
  onPrevious,
  onSelectAppointment,
  onToday,
  patients,
}: {
  currentDate: Date
  appointments: Appointment[]
  patients: Map<string, Patient>
  services: Map<string, Service>
  onSelectAppointment: (appointment: Appointment) => void
  onAddAppointment: (date: string, time?: string) => void
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onChangeView: (view: CalendarViewType) => void
}) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay()

  const days: Array<Date | null> = []
  for (let index = 0; index < startingDayOfWeek; index += 1) {
    days.push(null)
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, month, day))
  }

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <div className="calendar-nav">
          <button type="button" onClick={onPrevious} className="icon-button" aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div className="calendar-title">
            <h3>{currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
          </div>
          <button type="button" onClick={onNext} className="icon-button" aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="calendar-actions">
          <Button variant="secondary" size="sm" onClick={onToday}>
            Today
          </Button>
          <div className="view-toggle">
            {(['day', 'week', 'month'] as const).map((view) => (
              <button
                key={view}
                type="button"
                className={`view-btn ${view === 'month' ? 'is-active' : ''}`}
                onClick={() => onChangeView(view)}
              >
                {view.charAt(0).toUpperCase() + view.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="month-view">
        <div className="month-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="month-day-header">
              {day}
            </div>
          ))}

          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="month-cell empty" />
            }

            const dateStr = formatDate(date)
            const dayAppointments = appointments.filter((appointment) => appointment.date === dateStr)
            const isToday = dateStr === formatDate(new Date())

            return (
              <div key={dateStr} className={`month-cell ${isToday ? 'is-today' : ''}`}>
                <div className="month-cell-header">
                  <span className="month-cell-date">{date.getDate()}</span>
                  <button type="button" className="month-add-button" onClick={() => onAddAppointment(dateStr)} aria-label={`Add appointment on ${dateStr}`}>
                    <Plus size={12} />
                  </button>
                </div>

                <div className="month-cell-appointments">
                  {dayAppointments.slice(0, 2).map((appointment) => {
                    const patient = patients.get(appointment.patientId)
                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        className={`mini-appointment status-${appointment.status}`}
                        onClick={() => onSelectAppointment(appointment)}
                      >
                        {patient ? `${patient.firstName} ${patient.lastName}` : 'Patient'}
                      </button>
                    )
                  })}
                  {dayAppointments.length > 2 && (
                    <div className="mini-appointment-more">+{dayAppointments.length - 2} more</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}