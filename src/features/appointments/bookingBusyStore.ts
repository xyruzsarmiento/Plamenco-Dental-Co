export type BookingBusyWindow = {
  appointmentId: string
  branchId: string
  providerId?: string
  operatoryId?: string
  date: string
  startTime: string
  endTime: string
  status: string
}

const BOOKING_BUSY_STORAGE_KEY = 'plamenco.booking.busyWindows'

export function getBookingBusyWindows(): BookingBusyWindow[] {
  try {
    const value = window.localStorage.getItem(BOOKING_BUSY_STORAGE_KEY)
    const rows = value ? JSON.parse(value) : []
    return Array.isArray(rows) ? rows : []
  } catch {
    return []
  }
}

export function saveBookingBusyWindows(rows: BookingBusyWindow[]) {
  window.localStorage.setItem(BOOKING_BUSY_STORAGE_KEY, JSON.stringify(rows))
}

export function isBookingBusy(input: {
  branchId: string
  providerId?: string
  operatoryId?: string
  date: string
  startTime: string
  endTime: string
  excludeAppointmentId?: string
}) {
  return getBookingBusyWindows().some((row) => {
    if (input.excludeAppointmentId && row.appointmentId === input.excludeAppointmentId) return false
    if (row.date !== input.date || row.branchId !== input.branchId) return false
    const sameResource = (Boolean(input.providerId) && row.providerId === input.providerId)
      || (Boolean(input.operatoryId) && row.operatoryId === input.operatoryId)
    if (!sameResource) return false
    return input.startTime < row.endTime && input.endTime > row.startTime
  })
}

export { BOOKING_BUSY_STORAGE_KEY }
