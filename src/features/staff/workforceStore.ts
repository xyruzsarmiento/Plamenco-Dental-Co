import { getStoredAppointments } from '../appointments/appointmentStore'
import { getStoredStaff } from '../auth/staffStore'
import { getProviderAvailabilityOverrides, getProviderBranchAssignments, getProviderScheduleBlocks, getStoredProviders } from '../dentists/dentistStore'
import { createExpense } from '../expenses/expenseStore'
import { recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { getStoredTreatments } from '../treatments/treatmentStore'
import { insertRemoteTableRow, updateRemoteTableRow } from '../../lib/supabaseSync'

export type ShiftStatus = 'planned' | 'cancelled'
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'on_leave'
export type CompensationBasis = 'percentage' | 'fixed_per_treatment' | 'none'
export type PayoutStatus = 'draft' | 'approved' | 'processed' | 'void'

export type StaffShiftPlan = {
  id: string
  staffId: string
  branchId: string
  workDate: string
  startTime: string
  endTime: string
  status: ShiftStatus
  notes: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type AttendanceRecord = {
  id: string
  staffId: string
  branchId: string
  workDate: string
  shiftStartTime?: string
  shiftEndTime?: string
  timeIn?: string
  timeOut?: string
  status: AttendanceStatus
  minutesLate: number
  reason?: string
  recordedBy: string
  createdAt: string
  updatedAt: string
}

export type ProviderCompensationRule = {
  id: string
  providerId: string
  branchId?: string
  basis: CompensationBasis
  commissionRatePercent: number
  fixedAmountCents: number
  status: 'active' | 'inactive'
  notes: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type ProviderPayout = {
  id: string
  payoutNumber: string
  providerId: string
  branchId: string
  periodStart: string
  periodEnd: string
  treatmentCount: number
  grossTreatmentValueCents: number
  commissionRatePercent: number
  fixedAmountCents: number
  payoutAmountCents: number
  status: PayoutStatus
  expenseId?: string
  approvedBy?: string
  processedBy?: string
  processedAt?: string
  notes: string
  createdAt: string
  updatedAt: string
}

const SHIFT_KEY = 'plamenco.workforce.shifts'
const ATTENDANCE_KEY = 'plamenco.workforce.attendance'
const COMP_RULE_KEY = 'plamenco.workforce.compensationRules'
const PAYOUT_KEY = 'plamenco.workforce.providerPayouts'
const LATE_GRACE_MINUTES = 10

function nowIso() {
  return new Date().toISOString()
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) return globalThis.localStorage
  const globalWithMemory = globalThis as typeof globalThis & { __plamencoWorkforceStorage?: Storage }
  if (globalWithMemory.__plamencoWorkforceStorage) return globalWithMemory.__plamencoWorkforceStorage
  const created = createMemoryStorage()
  globalWithMemory.__plamencoWorkforceStorage = created
  return created
}

function getList<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(getStorage().getItem(key) ?? '[]') as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveList<T>(key: string, rows: T[]) {
  getStorage().setItem(key, JSON.stringify(rows))
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function nextNumber(prefix: string, existing: string[]) {
  const next = existing.reduce((max, value) => {
    const match = value.match(new RegExp(`^${prefix}-(\\d+)$`))
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1
  return `${prefix}-${String(next).padStart(6, '0')}`
}

function minutesBetween(date: string, from?: string, to?: string) {
  if (!from || !to) return 0
  return Math.max(Math.round((new Date(`${date}T${to}`).getTime() - new Date(`${date}T${from}`).getTime()) / 60000), 0)
}

function audit(action: Parameters<typeof recordAuditEntry>[0]['action'], entity: string, entityId: string, metadata?: Record<string, string | number | boolean | null | undefined>) {
  recordAuditEntry({ user: getCurrentSessionUserName(), action, entity, entityId, metadata })
}

export function getStaffShiftPlans() {
  return getList<StaffShiftPlan>(SHIFT_KEY).sort((a, b) => `${b.workDate}${b.startTime}`.localeCompare(`${a.workDate}${a.startTime}`))
}

export function getAttendanceRecords() {
  return getList<AttendanceRecord>(ATTENDANCE_KEY).sort((a, b) => `${b.workDate}${b.timeIn ?? ''}`.localeCompare(`${a.workDate}${a.timeIn ?? ''}`))
}

export function getProviderCompensationRules() {
  return getList<ProviderCompensationRule>(COMP_RULE_KEY)
}

export function getProviderPayouts() {
  return getList<ProviderPayout>(PAYOUT_KEY).sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())
}

export function resetWorkforceState() {
  for (const key of [SHIFT_KEY, ATTENDANCE_KEY, COMP_RULE_KEY, PAYOUT_KEY]) getStorage().removeItem(key)
}

export function createStaffShiftPlan(input: Omit<StaffShiftPlan, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { status?: ShiftStatus }) {
  if (!getStoredStaff().some((staff) => staff.id === input.staffId)) throw new Error('Staff member not found.')
  if (!input.branchId.trim()) throw new Error('Branch is required for a staff shift.')
  const now = nowIso()
  const shift: StaffShiftPlan = { ...input, id: makeId('staff-shift'), status: input.status ?? 'planned', createdAt: now, updatedAt: now }
  saveList(SHIFT_KEY, [shift, ...getStaffShiftPlans()])
  void insertRemoteTableRow('staff_shift_plans', mapShift(shift))
  audit('staff_shift_planned', 'staff_shift', shift.id, { staffId: shift.staffId, branchId: shift.branchId, workDate: shift.workDate })
  return shift
}

export function clockInStaff(input: { staffId: string; branchId: string; workDate: string; timeIn: string; recordedBy: string }) {
  const shifts = getStaffShiftPlans()
  const shift = shifts.find((entry) => entry.staffId === input.staffId && entry.branchId === input.branchId && entry.workDate === input.workDate && entry.status === 'planned')
  const existing = getAttendanceRecords().find((entry) => entry.staffId === input.staffId && entry.workDate === input.workDate && entry.timeIn)
  if (existing) return existing
  const minutesLate = shift ? Math.max(minutesBetween(input.workDate, shift.startTime, input.timeIn) - LATE_GRACE_MINUTES, 0) : 0
  const now = nowIso()
  const attendance: AttendanceRecord = {
    id: makeId('attendance'),
    staffId: input.staffId,
    branchId: input.branchId,
    workDate: input.workDate,
    shiftStartTime: shift?.startTime,
    shiftEndTime: shift?.endTime,
    timeIn: input.timeIn,
    status: minutesLate > 0 ? 'late' : 'present',
    minutesLate,
    recordedBy: input.recordedBy,
    createdAt: now,
    updatedAt: now,
  }
  saveList(ATTENDANCE_KEY, [attendance, ...getAttendanceRecords()])
  void insertRemoteTableRow('staff_attendance', mapAttendance(attendance))
  audit('staff_attendance_recorded', 'attendance', attendance.id, { staffId: attendance.staffId, branchId: attendance.branchId, status: attendance.status })
  return attendance
}

export function clockOutStaff(attendanceId: string, timeOut: string) {
  const records = getAttendanceRecords()
  const index = records.findIndex((entry) => entry.id === attendanceId)
  if (index === -1) throw new Error('Attendance record not found.')
  const updated = { ...records[index], timeOut, updatedAt: nowIso() }
  records[index] = updated
  saveList(ATTENDANCE_KEY, records)
  void updateRemoteTableRow('staff_attendance', updated.id, mapAttendance(updated))
  audit('staff_attendance_recorded', 'attendance', updated.id, { staffId: updated.staffId, timeOut })
  return updated
}

export function markStaffAttendance(input: Omit<AttendanceRecord, 'id' | 'minutesLate' | 'createdAt' | 'updatedAt'> & { minutesLate?: number }) {
  const now = nowIso()
  const attendance: AttendanceRecord = { ...input, id: makeId('attendance'), minutesLate: input.minutesLate ?? 0, createdAt: now, updatedAt: now }
  saveList(ATTENDANCE_KEY, [attendance, ...getAttendanceRecords()])
  void insertRemoteTableRow('staff_attendance', mapAttendance(attendance))
  audit('staff_attendance_recorded', 'attendance', attendance.id, { staffId: attendance.staffId, branchId: attendance.branchId, status: attendance.status })
  return attendance
}

export function createProviderCompensationRule(input: Omit<ProviderCompensationRule, 'id' | 'createdAt' | 'updatedAt'>) {
  if (!getStoredProviders().some((provider) => provider.id === input.providerId)) throw new Error('Provider not found.')
  const now = nowIso()
  const rule: ProviderCompensationRule = { ...input, id: makeId('provider-comp-rule'), createdAt: now, updatedAt: now }
  saveList(COMP_RULE_KEY, [rule, ...getProviderCompensationRules()])
  void insertRemoteTableRow('provider_compensation_rules', mapCompensationRule(rule))
  audit('provider_compensation_rule_changed', 'provider_compensation_rule', rule.id, { providerId: rule.providerId, basis: rule.basis, branchId: rule.branchId })
  return rule
}

export function getProviderWorkload(providerId: string, startDate: string, endDate: string, branchId?: string) {
  const inRange = (date: string) => date >= startDate && date <= endDate
  const appointments = getStoredAppointments().filter((appointment) => appointment.providerId === providerId && inRange(appointment.date) && (!branchId || appointment.branchId === branchId))
  const treatments = getStoredTreatments().filter((treatment) => treatment.providerId === providerId && inRange(treatment.treatmentDate) && (!branchId || treatment.branchId === branchId))
  const completedTreatments = treatments.filter((treatment) => treatment.status === 'completed')
  const grossTreatmentValueCents = completedTreatments.reduce((sum, treatment) => sum + (treatment.priceSnapshotCents * (treatment.quantity ?? 1)), 0)
  return {
    providerId,
    branchId,
    startDate,
    endDate,
    appointmentsCount: appointments.length,
    completedAppointments: appointments.filter((appointment) => appointment.status === 'completed').length,
    patientCount: new Set(appointments.map((appointment) => appointment.patientId)).size,
    treatmentCount: completedTreatments.length,
    grossTreatmentValueCents,
    treatments: completedTreatments,
  }
}

export function createProviderPayout(input: { providerId: string; branchId: string; periodStart: string; periodEnd: string; createdBy: string; notes?: string }) {
  const workload = getProviderWorkload(input.providerId, input.periodStart, input.periodEnd, input.branchId)
  const existing = getProviderPayouts().find((payout) => payout.providerId === input.providerId && payout.branchId === input.branchId && payout.periodStart === input.periodStart && payout.periodEnd === input.periodEnd && payout.status !== 'void')
  if (existing) return existing
  const rule = getProviderCompensationRules().find((entry) => entry.providerId === input.providerId && entry.status === 'active' && (!entry.branchId || entry.branchId === input.branchId))
  const commissionRatePercent = rule?.basis === 'percentage' ? rule.commissionRatePercent : 0
  const fixedAmountCents = rule?.basis === 'fixed_per_treatment' ? rule.fixedAmountCents : 0
  const payoutAmountCents = Math.round(workload.grossTreatmentValueCents * commissionRatePercent / 100) + (fixedAmountCents * workload.treatmentCount)
  const now = nowIso()
  const payout: ProviderPayout = {
    id: makeId('provider-payout'),
    payoutNumber: nextNumber('PPO', getProviderPayouts().map((entry) => entry.payoutNumber)),
    providerId: input.providerId,
    branchId: input.branchId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    treatmentCount: workload.treatmentCount,
    grossTreatmentValueCents: workload.grossTreatmentValueCents,
    commissionRatePercent,
    fixedAmountCents,
    payoutAmountCents,
    status: 'draft',
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  }
  saveList(PAYOUT_KEY, [payout, ...getProviderPayouts()])
  void insertRemoteTableRow('provider_payouts', mapPayout(payout))
  audit('provider_payout_created', 'provider_payout', payout.id, { providerId: payout.providerId, branchId: payout.branchId, payoutAmountCents })
  return payout
}

export function processProviderPayout(payoutId: string, processedBy: string) {
  const payouts = getProviderPayouts()
  const index = payouts.findIndex((entry) => entry.id === payoutId)
  if (index === -1) throw new Error('Provider payout not found.')
  const payout = payouts[index]
  if (payout.status === 'processed') return payout
  const provider = getStoredProviders().find((entry) => entry.id === payout.providerId)
  const expense = createExpense({
    scope: 'branch',
    branchId: payout.branchId,
    categoryId: 'payroll_compensation',
    payeeName: provider?.displayName ?? 'Clinical provider',
    description: `Provider payout ${payout.payoutNumber}`,
    expenseDate: payout.periodEnd,
    dueDate: payout.periodEnd,
    subtotalCents: payout.payoutAmountCents,
    taxCents: 0,
    sourceType: 'other',
    sourceId: payout.id,
    notes: 'Generated from provider compensation workflow. Do not manually duplicate.',
    createdBy: processedBy,
  })
  const updated: ProviderPayout = { ...payout, status: 'processed', expenseId: expense.id, processedBy, processedAt: nowIso(), updatedAt: nowIso() }
  payouts[index] = updated
  saveList(PAYOUT_KEY, payouts)
  void updateRemoteTableRow('provider_payouts', updated.id, mapPayout(updated))
  audit('provider_payout_processed', 'provider_payout', updated.id, { providerId: updated.providerId, expenseId: expense.id, payoutAmountCents: updated.payoutAmountCents })
  return updated
}

export function getWorkforceOverview(date = new Date().toISOString().slice(0, 10)) {
  const staff = getStoredStaff()
  const shifts = getStaffShiftPlans().filter((shift) => shift.workDate === date && shift.status === 'planned')
  const attendance = getAttendanceRecords().filter((record) => record.workDate === date)
  const providers = getStoredProviders()
  const day = new Date(`${date}T00:00:00`).getDay()
  const providerSchedule = getProviderScheduleBlocks().filter((block) => block.dayOfWeek === day && block.status === 'active')
  const leaveProviderIds = new Set(getProviderAvailabilityOverrides().filter((override) => override.date === date && override.type === 'leave').map((override) => override.providerId))
  return {
    date,
    staffCount: staff.length,
    scheduledToday: shifts.length,
    clockedIn: attendance.filter((record) => record.timeIn && record.status !== 'absent' && record.status !== 'on_leave').length,
    late: attendance.filter((record) => record.status === 'late').length,
    absent: attendance.filter((record) => record.status === 'absent').length,
    onLeave: attendance.filter((record) => record.status === 'on_leave').length + leaveProviderIds.size,
    providersAvailable: providers.filter((provider) => provider.status === 'active' && providerSchedule.some((block) => block.providerId === provider.id) && !leaveProviderIds.has(provider.id)).length,
    pendingPayoutsCents: getProviderPayouts().filter((payout) => payout.status !== 'processed' && payout.status !== 'void').reduce((sum, payout) => sum + payout.payoutAmountCents, 0),
    activeProviderAssignments: getProviderBranchAssignments().filter((assignment) => assignment.status === 'active').length,
  }
}

function mapShift(shift: StaffShiftPlan) {
  return { id: shift.id, staff_id: shift.staffId, branch_id: shift.branchId, work_date: shift.workDate, start_time: shift.startTime, end_time: shift.endTime, status: shift.status, notes: shift.notes, created_by: shift.createdBy }
}

function mapAttendance(record: AttendanceRecord) {
  return { id: record.id, staff_id: record.staffId, branch_id: record.branchId, work_date: record.workDate, shift_start_time: record.shiftStartTime ?? null, shift_end_time: record.shiftEndTime ?? null, time_in: record.timeIn ?? null, time_out: record.timeOut ?? null, status: record.status, minutes_late: record.minutesLate, reason: record.reason ?? '', recorded_by: record.recordedBy }
}

function mapCompensationRule(rule: ProviderCompensationRule) {
  return { id: rule.id, provider_id: rule.providerId, branch_id: rule.branchId ?? null, basis: rule.basis, commission_rate_percent: rule.commissionRatePercent, fixed_amount_cents: rule.fixedAmountCents, status: rule.status, notes: rule.notes, created_by: rule.createdBy }
}

function mapPayout(payout: ProviderPayout) {
  return { id: payout.id, payout_number: payout.payoutNumber, provider_id: payout.providerId, branch_id: payout.branchId, period_start: payout.periodStart, period_end: payout.periodEnd, treatment_count: payout.treatmentCount, gross_treatment_value_cents: payout.grossTreatmentValueCents, commission_rate_percent: payout.commissionRatePercent, fixed_amount_cents: payout.fixedAmountCents, payout_amount_cents: payout.payoutAmountCents, status: payout.status, expense_id: payout.expenseId ?? null, approved_by: payout.approvedBy ?? '', processed_by: payout.processedBy ?? '', processed_at: payout.processedAt ?? null, notes: payout.notes }
}

export { ATTENDANCE_KEY, COMP_RULE_KEY, LATE_GRACE_MINUTES, PAYOUT_KEY, SHIFT_KEY }
