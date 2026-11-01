import { upsertRemoteTableRows } from '../../lib/supabaseSync'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
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

function mapRemotePreference(row: Record<string, any>): CommunicationPreference {
  return {
    patientId: String(row.patient_id ?? ''),
    smsEnabled: Boolean(row.sms_enabled),
    emailEnabled: Boolean(row.email_enabled),
    messengerEnabled: Boolean(row.messenger_enabled),
    inAppEnabled: Boolean(row.in_app_enabled ?? true),
    preferredChannel: row.preferred_channel ?? 'in_app',
    messengerRecipientId: row.messenger_recipient_id ?? undefined,
    messengerConnectedAt: row.messenger_connected_at ?? undefined,
    consentUpdatedAt: row.consent_updated_at ?? undefined,
    consentUpdatedBy: row.consent_updated_by ?? '',
    createdAt: row.created_at ?? nowIso(),
    updatedAt: row.updated_at ?? row.created_at ?? nowIso(),
  }
}

function replaceStoredPreference(preference: CommunicationPreference) {
  const preferences = getStoredCommunicationPreferences().filter((entry) => entry.patientId !== preference.patientId)
  saveStoredCommunicationPreferences([...preferences, preference])
}

export async function loadCommunicationPreferencesFromSupabase() {
  if (!isSupabaseConfigured || !supabase) return false
  const { data, error } = await supabase.from('communication_preferences').select('*')
  if (error || !Array.isArray(data)) {
    if (error) console.error('[communication preferences] Supabase load failed:', error.message)
    return false
  }

  // RLS can legitimately return no rows for authenticated users who do not
  // have permission to read the whole consent table. Never erase a warm cache
  // merely because this role received an empty, policy-filtered result.
  if (data.length > 0) {
    saveStoredCommunicationPreferences(data.map((row) => mapRemotePreference(row)))
  }
  return true
}

/** Load one patient's preference through the patient's own RLS-scoped row. */
export async function loadCommunicationPreferenceForPatientFromSupabase(patientId: string) {
  if (!isSupabaseConfigured || !supabase) return getCommunicationPreference(patientId)

  const { data, error } = await supabase
    .from('communication_preferences')
    .select('*')
    .eq('patient_id', patientId)
    .maybeSingle()

  if (error) {
    throw new Error(`Unable to load your notification preferences: ${error.message}`)
  }

  const preference = data
    ? mapRemotePreference(data)
    : getDefaultCommunicationPreference(patientId)

  replaceStoredPreference(preference)
  return preference
}

export function getStoredCommunicationPreferences() {
  return safeParsePreferences(getStorage().getItem(PREFERENCES_STORAGE_KEY))
}

export function saveStoredCommunicationPreferences(preferences: CommunicationPreference[]) {
  getStorage().setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('plamenco:communication-preferences-updated'))
  }
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

/** Persist a patient's consent and preferred channel before treating the change as saved. */
export async function updateCommunicationPreferencePersisted(
  patientId: string,
  updates: Partial<Omit<CommunicationPreference, 'patientId' | 'createdAt' | 'updatedAt'>>,
  actor: string,
) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('The clinic database is unavailable. Your notification preferences were not saved.')
  }

  const current = getCommunicationPreference(patientId)
  const now = nowIso()
  const updated: CommunicationPreference = {
    ...current,
    ...updates,
    patientId,
    consentUpdatedAt: now,
    consentUpdatedBy: actor,
    updatedAt: now,
  }

  const { data, error } = await supabase
    .from('communication_preferences')
    .upsert(mapPreferenceToRemoteRow(updated), { onConflict: 'patient_id' })
    .select('*')
    .single()

  if (error || !data) {
    throw new Error(`Your notification preferences could not be saved: ${error?.message ?? 'No saved row was returned.'}`)
  }

  const confirmed = mapRemotePreference(data)
  replaceStoredPreference(confirmed)
  recordAuditEntry({
    user: actor,
    action: 'communication_preference_changed',
    entity: 'patient',
    entityId: patientId,
    metadata: {
      smsEnabled: confirmed.smsEnabled,
      emailEnabled: confirmed.emailEnabled,
      messengerEnabled: confirmed.messengerEnabled,
      inAppEnabled: confirmed.inAppEnabled,
      preferredChannel: confirmed.preferredChannel,
    },
  })
  return confirmed
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
