export type AppointmentStatus = 'pending' | 'confirmed' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'

export type Appointment = {
  id: string
  patientId: string
  serviceId: string
  date: string
  startTime: string
  endTime: string
  notes: string
  status: AppointmentStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type AppointmentFormValues = Omit<Appointment, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>

export type AppointmentSortKey = 'date' | 'patient' | 'status'
