import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { getStoredStaff, saveStoredStaff } from '../auth/staffStore'
import type { StaffMember, UserRole } from '../auth/authTypes'
import { permissionGroups, roleLabels, rolePermissions, type PermissionKey } from '../auth/permissions'
import { getStoredAppointments } from '../appointments/appointmentStore'
import { getStoredBranches } from '../branches/branchStore'
import { getStoredPayments } from '../billing/billingStore'
import { getCommunicationDeliveryLogs, getCommunicationSettings } from '../communications/communicationStore'
import { getStoredProviders } from '../dentists/dentistStore'
import { getExpenses } from '../expenses/expenseStore'
import { getInventoryOverview } from '../inventory/inventoryStore'
import { getStoredPatients } from '../patients/patientStore'
import { getRecentAuditLogs, recordAuditEntry } from '../security/auditLogStore'
import { getCurrentSessionUserName } from '../security/security'
import { getStoredServices } from '../services/serviceStore'

export type AdminSection =
  | 'overview'
  | 'accounts'
  | 'roles'
  | 'branches'
  | 'clinic'
  | 'services'
  | 'scheduling'
  | 'payments'
  | 'notifications'
  | 'integrations'
  | 'audit'
  | 'security'
  | 'health'

export type AccountInvitationStatus = 'pending' | 'sent' | 'failed' | 'accepted' | 'cancelled'

export type AccountInvitation = {
  id: string
  email: string
  name: string
  role: Exclude<UserRole, 'patient'>
  branchIds: string[]
  status: AccountInvitationStatus
  providerProfileRequired: boolean
  errorMessage?: string
  invitedBy: string
  invitedAt: string
  updatedAt: string
}

export type ClinicConfiguration = {
  clinicName: string
  primaryEmail: string
  primaryPhone: string
  website: string
  facebookPage: string
  address: string
  businessHours: string
  publicDescription: string
  updatedAt: string
  updatedBy: string
}

export type BookingConfiguration = {
  onlineBookingEnabled: boolean
  defaultSlotMinutes: number
  minimumLeadHours: number
  maximumAdvanceDays: number
  cancellationCutoffHours: number
  rescheduleCutoffHours: number
  updatedAt: string
  updatedBy: string
}

export type ClinicClosure = {
  id: string
  branchId?: string
  date: string
  reason: string
  type: 'holiday' | 'maintenance' | 'special_closure' | 'training' | 'other'
  createdBy: string
  createdAt: string
}

export type SystemDiagnostic = {
  id: string
  label: string
  status: 'healthy' | 'warning' | 'attention'
  detail: string
}

export type SystemAdminSnapshot = {
  activeUsers: number
  activeDentists: number
  activeStaff: number
  patientAccounts: number
  activeBranches: number
  activeServices: number
  pendingInvitations: number
  recentAdministrativeChanges: ReturnType<typeof getRecentAuditLogs>
  failedSystemOperations: number
  integrationDiagnostics: SystemDiagnostic[]
  securityDiagnostics: SystemDiagnostic[]
  dataIntegrityDiagnostics: SystemDiagnostic[]
  bookingConfiguration: BookingConfiguration
  clinicConfiguration: ClinicConfiguration
  closures: ClinicClosure[]
}

const INVITATION_KEY = 'plamenco.admin.accountInvitations'
const CLINIC_CONFIG_KEY = 'plamenco.admin.clinicConfiguration'
const BOOKING_CONFIG_KEY = 'plamenco.admin.bookingConfiguration'
const CLOSURE_KEY = 'plamenco.admin.clinicClosures'

function nowIso() {
  return new Date().toISOString()
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) return globalThis.localStorage
  const globalWithMemory = globalThis as typeof globalThis & { __plamencoAdminStorage?: Storage }
  if (globalWithMemory.__plamencoAdminStorage) return globalWithMemory.__plamencoAdminStorage
  const rows = new Map<string, string>()
  const storage = {
    get length() { return rows.size },
    clear: () => rows.clear(),
    getItem: (key: string) => (rows.has(key) ? rows.get(key)! : null),
    key: (index: number) => Array.from(rows.keys())[index] ?? null,
    removeItem: (key: string) => rows.delete(key),
    setItem: (key: string, value: string) => rows.set(key, value),
  } as Storage
  globalWithMemory.__plamencoAdminStorage = storage
  return storage
}

function safeParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function getList<T>(key: string): T[] {
  const parsed = safeParse<T[]>(getStorage().getItem(key))
  return Array.isArray(parsed) ? parsed : []
}

function saveList<T>(key: string, rows: T[]) {
  getStorage().setItem(key, JSON.stringify(rows))
}

function defaultClinicConfiguration(): ClinicConfiguration {
  return {
    clinicName: 'Plamenco Dental Co.',
    primaryEmail: '',
    primaryPhone: '',
    website: '',
    facebookPage: '',
    address: 'Pulilan and Plaridel, Bulacan',
    businessHours: 'Monday to Saturday, 9:00 AM - 6:00 PM',
    publicDescription: 'Dental care across Plamenco Dental Co. branches.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  }
}

function defaultBookingConfiguration(): BookingConfiguration {
  return {
    onlineBookingEnabled: true,
    defaultSlotMinutes: 30,
    minimumLeadHours: 2,
    maximumAdvanceDays: 60,
    cancellationCutoffHours: 12,
    rescheduleCutoffHours: 12,
    updatedAt: nowIso(),
    updatedBy: 'system',
  }
}

export function getAccountInvitations() {
  return getList<AccountInvitation>(INVITATION_KEY).sort((a, b) => new Date(b.invitedAt).getTime() - new Date(a.invitedAt).getTime())
}

export function getClinicConfiguration() {
  const parsed = safeParse<ClinicConfiguration | ClinicConfiguration[]>(getStorage().getItem(CLINIC_CONFIG_KEY))
  if (Array.isArray(parsed)) return parsed[0] ?? defaultClinicConfiguration()
  return parsed ?? defaultClinicConfiguration()
}

export function saveClinicConfiguration(input: ClinicConfiguration, actor = getCurrentSessionUserName()) {
  const config = { ...input, updatedAt: nowIso(), updatedBy: actor }
  getStorage().setItem(CLINIC_CONFIG_KEY, JSON.stringify(config))
  recordAuditEntry({ user: actor, action: 'settings_changed', entity: 'clinic_configuration', entityId: 'clinic', metadata: { clinicName: config.clinicName } })
  return config
}

export function getBookingConfiguration() {
  const parsed = safeParse<BookingConfiguration | BookingConfiguration[]>(getStorage().getItem(BOOKING_CONFIG_KEY))
  if (Array.isArray(parsed)) return parsed[0] ?? defaultBookingConfiguration()
  return parsed ?? defaultBookingConfiguration()
}

export function saveBookingConfiguration(input: BookingConfiguration, actor = getCurrentSessionUserName()) {
  const config = {
    ...input,
    defaultSlotMinutes: Math.max(5, input.defaultSlotMinutes),
    minimumLeadHours: Math.max(0, input.minimumLeadHours),
    maximumAdvanceDays: Math.max(1, input.maximumAdvanceDays),
    cancellationCutoffHours: Math.max(0, input.cancellationCutoffHours),
    rescheduleCutoffHours: Math.max(0, input.rescheduleCutoffHours),
    updatedAt: nowIso(),
    updatedBy: actor,
  }
  getStorage().setItem(BOOKING_CONFIG_KEY, JSON.stringify(config))
  recordAuditEntry({ user: actor, action: 'settings_changed', entity: 'booking_configuration', entityId: 'booking', metadata: { onlineBookingEnabled: config.onlineBookingEnabled } })
  return config
}

export function getClinicClosures() {
  return getList<ClinicClosure>(CLOSURE_KEY).sort((a, b) => a.date.localeCompare(b.date))
}

export function createClinicClosure(input: Omit<ClinicClosure, 'id' | 'createdAt'>) {
  if (!input.date || !input.reason.trim()) throw new Error('Closure date and reason are required.')
  const closure: ClinicClosure = { ...input, id: `closure-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: nowIso() }
  saveList(CLOSURE_KEY, [closure, ...getClinicClosures()])
  recordAuditEntry({ user: input.createdBy, action: 'settings_changed', entity: 'clinic_closure', entityId: closure.id, metadata: { branchId: closure.branchId ?? 'all', date: closure.date, type: closure.type } })
  return closure
}

export function getRolePermissionMatrix() {
  const roles = Object.keys(roleLabels) as UserRole[]
  return permissionGroups.map((group) => ({
    label: group.label,
    permissions: group.permissions.map((permission) => ({
      key: permission.key,
      label: permission.label,
      grants: roles.reduce<Record<UserRole, boolean>>((acc, role) => {
        acc[role] = rolePermissions[role].includes(permission.key as PermissionKey)
        return acc
      }, {} as Record<UserRole, boolean>),
    })),
  }))
}

export function canDeactivateInternalAccount(member: StaffMember, allStaff = getStoredStaff()) {
  if (member.role !== 'super_admin' || member.status !== 'active') return { allowed: true, reason: '' }
  const activeSuperAdmins = allStaff.filter((staff) => staff.role === 'super_admin' && staff.status === 'active')
  if (activeSuperAdmins.length <= 1) return { allowed: false, reason: 'At least one active Super Admin must remain.' }
  return { allowed: true, reason: '' }
}

export function updateInternalAccountStatus(staffId: string, status: StaffMember['status'], actor = getCurrentSessionUserName()) {
  const staff = getStoredStaff()
  const member = staff.find((entry) => entry.id === staffId)
  if (!member) throw new Error('Internal account not found.')
  if (status !== 'active') {
    const guard = canDeactivateInternalAccount(member, staff)
    if (!guard.allowed) throw new Error(guard.reason)
  }
  const next = staff.map((entry) => entry.id === staffId ? { ...entry, status, updatedAt: nowIso() } : entry)
  saveStoredStaff(next)
  recordAuditEntry({ user: actor, action: 'staff_account_changed', entity: 'staff', entityId: staffId, metadata: { status } })
  return next
}

export async function inviteInternalAccount(input: { email: string; name: string; role: Exclude<UserRole, 'patient'>; branchIds: string[]; providerProfileRequired?: boolean; invitedBy: string }) {
  if (!input.email.trim() || !input.name.trim()) throw new Error('Name and email are required.')
  if (input.role === 'super_admin' && getStoredStaff().some((member) => member.email.toLowerCase() === input.email.trim().toLowerCase())) throw new Error('That Super Admin email already exists.')

  const invitation: AccountInvitation = {
    id: `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    role: input.role,
    branchIds: input.branchIds,
    status: 'pending',
    providerProfileRequired: Boolean(input.providerProfileRequired || input.role === 'dentist' || input.role === 'associate_dentist'),
    invitedBy: input.invitedBy,
    invitedAt: nowIso(),
    updatedAt: nowIso(),
  }

  let nextInvitation = invitation
  if (supabase) {
    const { error } = await supabase.functions.invoke('invite-internal-account', {
      body: {
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        branchIds: invitation.branchIds,
        providerProfileRequired: invitation.providerProfileRequired,
      },
    })
    nextInvitation = {
      ...invitation,
      status: error ? 'failed' : 'sent',
      errorMessage: error?.message,
      updatedAt: nowIso(),
    }
  }

  saveList(INVITATION_KEY, [nextInvitation, ...getAccountInvitations()])
  recordAuditEntry({
    user: input.invitedBy,
    action: 'staff_account_changed',
    entity: 'account_invitation',
    entityId: nextInvitation.id,
    metadata: { email: nextInvitation.email, role: nextInvitation.role, status: nextInvitation.status },
  })
  return nextInvitation
}

export function getSystemAdminSnapshot(): SystemAdminSnapshot {
  const staff = getStoredStaff()
  const providers = getStoredProviders()
  const patients = getStoredPatients()
  const branches = getStoredBranches()
  const services = getStoredServices()
  const communicationSettings = getCommunicationSettings()
  const communicationLogs = getCommunicationDeliveryLogs()
  const inventoryOverview = getInventoryOverview()
  const failedOperations = communicationLogs.filter((log) => log.status === 'failed').length
  const activeStaff = staff.filter((member) => member.status === 'active')
  const activeSuperAdmins = activeStaff.filter((member) => member.role === 'super_admin')
  const paymentCount = getStoredPayments().length
  const expenseCount = getExpenses().length
  const appointmentCount = getStoredAppointments().length

  const integrationDiagnostics: SystemDiagnostic[] = [
    { id: 'supabase', label: 'Supabase project', status: isSupabaseConfigured ? 'healthy' : 'attention', detail: isSupabaseConfigured ? 'Anon client configuration is present.' : 'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.' },
    { id: 'sms', label: 'SMS provider', status: communicationSettings.smsConfigured ? 'healthy' : 'warning', detail: communicationSettings.smsConfigured ? `${communicationSettings.smsProvider} is marked configured.` : 'SMS provider is not configured.' },
    { id: 'email', label: 'Email provider', status: communicationSettings.emailConfigured ? 'healthy' : 'warning', detail: communicationSettings.emailConfigured ? communicationSettings.emailProvider.replaceAll('_', ' ') : 'Email provider is not configured.' },
    { id: 'messenger', label: 'Messenger provider', status: communicationSettings.messengerConfigured ? 'healthy' : 'warning', detail: communicationSettings.messengerConfigured ? communicationSettings.messengerProvider.replaceAll('_', ' ') : 'Messenger provider is not configured.' },
  ]
  const securityDiagnostics: SystemDiagnostic[] = [
    { id: 'super-admin', label: 'Active Super Admin', status: activeSuperAdmins.length ? 'healthy' : 'attention', detail: activeSuperAdmins.length ? `${activeSuperAdmins.length} active Super Admin account(s).` : 'No active Super Admin account is present in local account records.' },
    { id: 'plaintext-passwords', label: 'Password storage', status: staff.some((member) => member.password) ? 'attention' : 'healthy', detail: staff.some((member) => member.password) ? 'Legacy local staff records still contain password fields. Supabase Auth invitations should replace them before production.' : 'No local staff password values detected.' },
    { id: 'failed-communications', label: 'Failed operations', status: failedOperations ? 'warning' : 'healthy', detail: `${failedOperations} failed communication operation(s) recorded.` },
  ]
  const dataIntegrityDiagnostics: SystemDiagnostic[] = [
    { id: 'patients-auth', label: 'Patient auth linkage', status: patients.some((patient) => !patient.authUserId) ? 'warning' : 'healthy', detail: `${patients.filter((patient) => !patient.authUserId).length} patient record(s) without auth linkage.` },
    { id: 'provider-accounts', label: 'Provider accounts', status: providers.length && providers.some((provider) => !provider.profileId) ? 'warning' : 'healthy', detail: `${providers.filter((provider) => !provider.profileId).length} provider profile(s) without auth profile linkage.` },
    { id: 'operational-data', label: 'Operational records', status: appointmentCount || paymentCount || expenseCount ? 'healthy' : 'warning', detail: `${appointmentCount} appointments, ${paymentCount} payments, ${expenseCount} expenses available for administration checks.` },
    { id: 'inventory-health', label: 'Inventory health', status: inventoryOverview.outOfStockItems ? 'warning' : 'healthy', detail: `${inventoryOverview.lowStockItems} low-stock and ${inventoryOverview.outOfStockItems} out-of-stock item(s).` },
  ]

  return {
    activeUsers: activeStaff.length + patients.filter((patient) => patient.authUserId && patient.status === 'active').length,
    activeDentists: providers.filter((provider) => provider.status === 'active').length,
    activeStaff: activeStaff.filter((member) => member.role === 'staff' || member.role === 'admin' || member.role === 'super_admin').length,
    patientAccounts: patients.filter((patient) => patient.authUserId).length,
    activeBranches: branches.filter((branch) => branch.status === 'active').length,
    activeServices: services.filter((service) => service.status === 'active').length,
    pendingInvitations: getAccountInvitations().filter((invite) => invite.status === 'pending' || invite.status === 'failed').length,
    recentAdministrativeChanges: getRecentAuditLogs(20).filter((log) => ['staff', 'account_invitation', 'branch', 'settings', 'clinic_configuration', 'booking_configuration', 'service', 'payment_method'].includes(log.entity)),
    failedSystemOperations: failedOperations,
    integrationDiagnostics,
    securityDiagnostics,
    dataIntegrityDiagnostics,
    bookingConfiguration: getBookingConfiguration(),
    clinicConfiguration: getClinicConfiguration(),
    closures: getClinicClosures(),
  }
}
