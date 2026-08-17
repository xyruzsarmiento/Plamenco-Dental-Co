import {
  BarChart3,
  BellRing,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Settings,
  UserRoundCog,
  UsersRound,
} from 'lucide-react'

export const navigationGroups = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', path: '/app', icon: LayoutDashboard },
      { label: 'Appointments', path: '/app/appointments', icon: CalendarDays },
      { label: 'Patients', path: '/app/patients', icon: UsersRound },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { label: 'Dental Records', path: '/app/dental-records', icon: FileText },
      { label: 'Treatments', path: '/app/treatments', icon: FileText },
      { label: 'Billing / Payments', path: '/app/billing', icon: CreditCard },
      { label: 'Services', path: '/app/services', icon: ClipboardList },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Reports', path: '/app/reports', icon: BarChart3 },
      { label: 'Announcements / Notifications', path: '/app/notifications', icon: BellRing },
      { label: 'Doctors / Dentists', path: '/app/staff', icon: UserRoundCog, adminOnly: true },
      { label: 'Settings', path: '/app/settings', icon: Settings, adminOnly: true },
    ],
  },
]

export const navigationItems = navigationGroups.flatMap((group) => group.items)
