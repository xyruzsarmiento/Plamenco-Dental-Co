import { upsertRemoteTableRows } from '../../lib/supabaseSync'
import type { Patient } from '../patients/patientTypes'
import { recordAuditEntry } from '../security/auditLogStore'
import type { ChannelAvailability, CommunicationChannel, CommunicationPreference } from './communicationTypes'

const PREFERENCES_STORAGE_KEY = 'plamenco.communication.preferences'

const nowIso = () => new Date().toISOString()

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) return globalThis.localStorage
  const globalWithMemory = globalThis as typeof globalThis & { __plamencoCommunicationPreferencesStorage?: Storage }
  if (globalWithMemory.__plamencoCommunicationPreferencesStorage) return globalWithMemory.__plamencoCommunicationPreferencesStorage
  const store = new Map<string, string>()
  const memory = {
    get length() { return store.size },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
  globalWithMemory.__plamencoCommunicationPreferencesStorage = memory
  return memory
}

function safeParsePreferences(value: string | null): CommunicationPreference[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as CommunicationPreference[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function normalizePhilippineMobileNumber(value: string) {
  const compact = value.replace(/[^\d+]/g, '')
  const digits = compact.startsWith('+') ? compact.slice(1) : compact
  let canonical = ''

  if (/^09\d{9}$/.test(digits)) canonical = `+63${digits.slice(1)}`
  else if (/^639\d{9}$/.test(digits)) canonical = `+${digits}`

  if (!canonical || !/^\+639\d{9}$/.test(canonical)) {
    return {
      valid: false,
      value: '',
      reason: 'Use a valid Philippine mobile number such as 09171234567 or +639171234567.',
    }
  }

  return { valid: true, value: canonical }
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function getDefaultCommunicationPreference(patientId: string): CommunicationPreference {
  const now = nowIso()
  return {
    patientId,
    smsEnabled: false,
    emailEnabled: false,
    messengerEnabled: false,
    inAppEnabled: true,
    preferredChannel: 'in_app',
    createdAt: now,
    updatedAt: now,
  }
}

export function getStoredCommunicationPreferences() {
  return safeParsePreferences(getStorage().getItem(PREFERENCES_STORAGE_KEY))
}

export function saveStoredCommunicationPreferences(preferences: CommunicationPreference[]) {
  getStorage().setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
}

export function getCommunicationPreference(patientId: string) {
  return getStoredCommunicationPreferences().find((preference) => preference.patientId === patientId)
    ?? getDefaultCommunicationPreference(patientId)
}

export function updateCommunicationPreference(
  patientId: string,
  updates: Partial<Omit<CommunicationPreference, 'patientId' | 'createdAt' | 'updatedAt'>>,
  actor: string,
) {
  const preferences = getStoredCommunicationPreferences()
  const index = preferences.findIndex((preference) => preference.patientId === patientId)
  const current = index >= 0 ? preferences[index] : getDefaultCommunicationPreference(patientId)
  const now = nowIso()
  const updated: CommunicationPreference = {
    ...current,
    ...updates,
    consentUpdatedAt: now,
    consentUpdatedBy: actor,
    updatedAt: now,
  }

  if (index >= 0) preferences[index] = updated
  else preferences.push(updated)
  saveStoredCommunicationPreferences(preferences)

  void upsertRemoteTableRows('communication_preferences', [mapPreferenceToRemoteRow(updated)])
  recordAuditEntry({
    user: actor,
    action: 'communication_preference_changed',
    entity: 'patient',
    entityId: patientId,
    metadata: {
      smsEnabled: updated.smsEnabled,
      emailEnabled: updated.emailEnabled,
      messengerEnabled: updated.messengerEnabled,
      inAppEnabled: updated.inAppEnabled,
      preferredChannel: updated.preferredChannel,
    },
  })

  return updated
}

export function getChannelAvailability(patient: Patient, preference = getCommunicationPreference(patient.patientId)): ChannelAvailability[] {
  const phone = normalizePhilippineMobileNumber(patient.phone)
  const email = patient.email.trim().toLowerCase()
  const messengerRecipient = preference.messengerRecipientId?.trim() ?? ''

  return [
    {
      channel: 'in_app',
      label: 'In-App',
      enabled: preference.inAppEnabled,
      available: preference.inAppEnabled && Boolean(patient.authUserId || patient.patientId),
      recipient: patient.authUserId ? 'Portal account connected' : patient.patientId,
      reason: preference.inAppEnabled ? undefined : 'In-app notifications disabled',
    },
    {
      channel: 'sms',
      label: 'SMS',
      enabled: preference.smsEnabled,
      available: preference.smsEnabled && phone.valid,
      recipient: phone.valid ? phone.value : patient.phone,
      reason: !preference.smsEnabled ? 'SMS not enabled by patient preference' : phone.reason,
    },
    {
      channel: 'email',
      label: 'Email',
      enabled: preference.emailEnabled,
      available: preference.emailEnabled && isValidEmail(email),
      recipient: email,
      reason: !preference.emailEnabled ? 'Email not enabled by patient preference' : email ? 'Email address is invalid' : 'No email recorded',
    },
    {
      channel: 'messenger',
      label: 'Messenger',
      enabled: preference.messengerEnabled,
      available: preference.messengerEnabled && Boolean(messengerRecipient),
      recipient: messengerRecipient,
      reason: !preference.messengerEnabled ? 'Messenger not enabled by patient preference' : 'Messenger is not connected',
    },
  ]
}

export function getOrderedChannels(preference: CommunicationPreference, defaults: CommunicationChannel[]) {
  const channels = [preference.preferredChannel, ...defaults, 'in_app'] as CommunicationChannel[]
  return [...new Set(channels)]
}

function mapPreferenceToRemoteRow(preference: CommunicationPreference) {
  return {
    patient_id: preference.patientId,
    sms_enabled: preference.smsEnabled,
    email_enabled: preference.emailEnabled,
    messenger_enabled: preference.messengerEnabled,
    in_app_enabled: preference.inAppEnabled,
    preferred_channel: preference.preferredChannel,
    messenger_recipient_id: preference.messengerRecipientId ?? null,
    messenger_connected_at: preference.messengerConnectedAt ?? null,
    consent_updated_at: preference.consentUpdatedAt ?? null,
    consent_updated_by: preference.consentUpdatedBy ?? '',
    updated_at: preference.updatedAt,
  }
}

export { PREFERENCES_STORAGE_KEY }
