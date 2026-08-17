import { recordAuditEntry } from '../security/auditLogStore'
import type { CommunicationChannel, CommunicationTemplate, CommunicationTemplateKey } from './communicationTypes'

const TEMPLATE_STORAGE_KEY = 'plamenco.communication.templates'

const allowedVariables = new Set([
  'first_name',
  'appointment_number',
  'appointment_date',
  'appointment_time',
  'branch_name',
  'dentist_name',
  'service_name',
  'appointment_status',
  'clinic_name',
  'estimated_price',
  'old_appointment_date',
  'old_appointment_time',
  'reason',
  'portal_guidance',
])

const nowIso = () => new Date().toISOString()

export const defaultCommunicationTemplates: CommunicationTemplate[] = [
  {
    key: 'appointment_requested',
    channel: 'in_app',
    title: 'Appointment request received',
    body: 'Hi {{first_name}}, we received your appointment request for {{appointment_date}} at {{appointment_time}}. We will notify you once it is reviewed.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_confirmed',
    channel: 'sms',
    title: 'Appointment confirmed',
    body: 'Plamenco Dental Co.: Hi {{first_name}}, your appointment {{appointment_number}} on {{appointment_date}} at {{appointment_time}} at {{branch_name}} is confirmed.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_confirmed',
    channel: 'email',
    title: 'Appointment confirmed',
    subject: 'Your Plamenco Dental Co. appointment is confirmed',
    body: 'Hi {{first_name}}, your appointment {{appointment_number}} is confirmed.\n\nBranch: {{branch_name}}\nDentist: {{dentist_name}}\nService: {{service_name}}\nDate and time: {{appointment_date}} at {{appointment_time}}\nEstimated price: {{estimated_price}}\nStatus: {{appointment_status}}\n\n{{portal_guidance}}',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_confirmed',
    channel: 'messenger',
    title: 'Appointment confirmed',
    body: 'Hi {{first_name}}, your Plamenco Dental Co. appointment on {{appointment_date}} at {{appointment_time}} is confirmed.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_confirmed',
    channel: 'in_app',
    title: 'Appointment confirmed',
    body: 'Your appointment {{appointment_number}} on {{appointment_date}} at {{appointment_time}} has been confirmed.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_rejected',
    channel: 'sms',
    title: 'Appointment request update',
    body: 'Plamenco Dental Co.: Hi {{first_name}}, we could not approve your requested appointment. Please contact the clinic or use the portal to request another time.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_rejected',
    channel: 'email',
    title: 'Appointment request update',
    subject: 'Update on your Plamenco Dental Co. appointment request',
    body: 'Hi {{first_name}}, we could not approve your requested appointment for {{appointment_date}} at {{appointment_time}}. {{reason}}\n\n{{portal_guidance}}',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_rejected',
    channel: 'in_app',
    title: 'Appointment request update',
    body: 'Your appointment request for {{appointment_date}} at {{appointment_time}} was not approved. {{portal_guidance}}',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_rescheduled',
    channel: 'sms',
    title: 'Appointment rescheduled',
    body: 'Plamenco Dental Co.: Hi {{first_name}}, your appointment moved from {{old_appointment_date}} {{old_appointment_time}} to {{appointment_date}} at {{appointment_time}}.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_rescheduled',
    channel: 'email',
    title: 'Appointment rescheduled',
    subject: 'Your Plamenco Dental Co. appointment was rescheduled',
    body: 'Hi {{first_name}}, your appointment {{appointment_number}} was rescheduled.\n\nPrevious: {{old_appointment_date}} at {{old_appointment_time}}\nNew: {{appointment_date}} at {{appointment_time}}\nBranch: {{branch_name}}\nDentist: {{dentist_name}}\nService: {{service_name}}\n\n{{portal_guidance}}',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_rescheduled',
    channel: 'in_app',
    title: 'Appointment rescheduled',
    body: 'Your appointment is now scheduled for {{appointment_date}} at {{appointment_time}}.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_cancelled',
    channel: 'sms',
    title: 'Appointment cancelled',
    body: 'Plamenco Dental Co.: Hi {{first_name}}, your appointment {{appointment_number}} on {{appointment_date}} at {{appointment_time}} has been cancelled.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_cancelled',
    channel: 'email',
    title: 'Appointment cancelled',
    subject: 'Your Plamenco Dental Co. appointment was cancelled',
    body: 'Hi {{first_name}}, your appointment {{appointment_number}} on {{appointment_date}} at {{appointment_time}} has been cancelled. {{reason}}\n\n{{portal_guidance}}',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_cancelled',
    channel: 'in_app',
    title: 'Appointment cancelled',
    body: 'Your appointment {{appointment_number}} on {{appointment_date}} at {{appointment_time}} has been cancelled.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_reminder',
    channel: 'sms',
    title: 'Appointment reminder',
    body: 'Plamenco Dental Co.: Hi {{first_name}}, reminder for appointment {{appointment_number}} on {{appointment_date}} at {{appointment_time}} at {{branch_name}}.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_reminder',
    channel: 'email',
    title: 'Appointment reminder',
    subject: 'Reminder for your Plamenco Dental Co. appointment',
    body: 'Hi {{first_name}}, this is a reminder for appointment {{appointment_number}}.\n\nBranch: {{branch_name}}\nDentist: {{dentist_name}}\nService: {{service_name}}\nDate and time: {{appointment_date}} at {{appointment_time}}\n\n{{portal_guidance}}',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_reminder',
    channel: 'in_app',
    title: 'Appointment reminder',
    body: 'Reminder: your appointment is on {{appointment_date}} at {{appointment_time}}.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'appointment_no_show',
    channel: 'in_app',
    title: 'Missed appointment recorded',
    body: 'Your appointment on {{appointment_date}} at {{appointment_time}} was marked no show.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'no_show_follow_up',
    channel: 'sms',
    title: 'Missed appointment follow-up',
    body: 'Plamenco Dental Co.: Hi {{first_name}}, we missed you at your appointment today. You may reschedule through your patient portal or contact the clinic.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'no_show_follow_up',
    channel: 'email',
    title: 'Missed appointment follow-up',
    subject: 'We missed you at your appointment',
    body: 'Hi {{first_name}}, we missed you at your appointment on {{appointment_date}} at {{appointment_time}}. You may reschedule through the authenticated patient portal or contact the clinic for assistance.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
  {
    key: 'no_show_follow_up',
    channel: 'in_app',
    title: 'Missed appointment follow-up',
    body: 'We missed you at your appointment today. You may request a new appointment from the patient portal.',
    updatedAt: nowIso(),
    updatedBy: 'system',
  },
]

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) return globalThis.localStorage
  const globalWithMemory = globalThis as typeof globalThis & { __plamencoCommunicationTemplateStorage?: Storage }
  if (globalWithMemory.__plamencoCommunicationTemplateStorage) return globalWithMemory.__plamencoCommunicationTemplateStorage
  const store = new Map<string, string>()
  const memory = {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
  globalWithMemory.__plamencoCommunicationTemplateStorage = memory
  return memory
}

function safeParseTemplates(value: string | null): CommunicationTemplate[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as CommunicationTemplate[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getStoredCommunicationTemplates() {
  const stored = safeParseTemplates(getStorage().getItem(TEMPLATE_STORAGE_KEY))
  if (stored.length) return stored
  getStorage().setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(defaultCommunicationTemplates))
  return defaultCommunicationTemplates
}

export function getCommunicationTemplate(key: CommunicationTemplateKey, channel: CommunicationChannel) {
  return getStoredCommunicationTemplates().find((template) => template.key === key && template.channel === channel)
}

export function updateCommunicationTemplate(
  key: CommunicationTemplateKey,
  channel: CommunicationChannel,
  updates: Pick<CommunicationTemplate, 'title' | 'subject' | 'body'>,
  actor: string,
) {
  const templates = getStoredCommunicationTemplates()
  const index = templates.findIndex((template) => template.key === key && template.channel === channel)
  const updated: CommunicationTemplate = {
    key,
    channel,
    ...updates,
    updatedAt: nowIso(),
    updatedBy: actor,
  }

  if (index >= 0) templates[index] = updated
  else templates.push(updated)
  getStorage().setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(templates))

  recordAuditEntry({
    user: actor,
    action: 'communication_template_updated',
    entity: 'communication_template',
    entityId: `${key}:${channel}`,
    metadata: { key, channel },
  })

  return updated
}

export function renderCommunicationTemplate(
  template: CommunicationTemplate,
  variables: Record<string, string | number | undefined>,
) {
  const render = (value = '') =>
    value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, variable: string) => {
      if (!allowedVariables.has(variable)) return ''
      return String(variables[variable] ?? '')
    })

  return {
    title: render(template.title),
    subject: render(template.subject),
    body: render(template.body),
  }
}

export { TEMPLATE_STORAGE_KEY, allowedVariables }
