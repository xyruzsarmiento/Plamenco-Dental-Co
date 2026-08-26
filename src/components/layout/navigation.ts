import {
  BarChart3,
  Building2,
  CalendarDays,
  DatabaseZap,
  ClipboardList,
  CreditCard,
  FileSignature,
  FileText,
  LayoutDashboard,
  PackageSearch,
  Pill,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserRound,
  UserRoundCog,
  UsersRound,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { PermissionKey } from '../../features/auth/permissions'

export type NavigationItem = {
  label: string
  path: string
  icon: ComponentType<{ size?: number }>
  anyOf?: PermissionKey[]
}

export type NavigationGroup = {
  title: string
  items: NavigationItem[]
}

export const navigationGroups: NavigationGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', path: '/app', icon: LayoutDashboard },
      { label: 'Appointments', path: '/app/appointments', icon: CalendarDays, anyOf: ['appointments.view'] },
      { label: 'Patients', path: '/app/patients', icon: UsersRound, anyOf: ['patients.view'] },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { label: 'Dental Records', path: '/app/dental-records', icon: FileText, anyOf: ['clinical_records.view'] },
      { label: 'Treatments', path: '/app/treatments', icon: FileText, anyOf: ['treatments.view'] },
      { label: 'Treatment Plans', path: '/app/treatment-plans', icon: ClipboardList, anyOf: ['treatments.view'] },
      { label: 'Prescriptions', path: '/app/prescriptions', icon: Pill, anyOf: ['prescriptions.view'] },
      { label: 'Documents', path: '/app/documents', icon: FileSignature, anyOf: ['documents.view', 'documents.upload'] },
      { label: 'Billing / Payments', path: '/app/billing', icon: CreditCard, anyOf: ['billing.view', 'payments.view'] },
      { label: 'Services', path: '/app/services', icon: ClipboardList, anyOf: ['services.view', 'services.manage'] },
      { label: 'Dentists', path: '/app/dentists', icon: UserRoundCog, anyOf: ['dentists.manage'] },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Reports', path: '/app/reports', icon: BarChart3, anyOf: ['reports.view', 'reports.view_limited'] },
      { label: 'Data Import', path: '/app/data-import', icon: DatabaseZap, anyOf: ['patients.import'] },
      { label: 'Inventory', path: '/app/inventory', icon: PackageSearch, anyOf: ['inventory.view'] },
      { label: 'Expenses', path: '/app/expenses', icon: ReceiptText, anyOf: ['expenses.view'] },
      { label: 'Team & Access', path: '/app/staff', icon: UserRoundCog, anyOf: ['staff.manage', 'dentists.manage'] },
      { label: 'Branches', path: '/app/branches', icon: Building2, anyOf: ['branches.view', 'branches.manage'] },
      { label: 'Forms & Consent', path: '/app/forms-consent', icon: FileSignature, anyOf: ['settings.manage'] },
      { label: 'System Administration', path: '/app/system-admin', icon: ShieldCheck, anyOf: ['system_admin.view'] },
    ],
  },
  {
    title: 'System / Account',
    items: [
      { label: 'Settings', path: '/app/settings', icon: Settings, anyOf: ['settings.manage'] },
      { label: 'Profile', path: '/app/profile', icon: UserRound },
    ],
  },
]

export const navigationItems = navigationGroups.flatMap((group) => group.items)
