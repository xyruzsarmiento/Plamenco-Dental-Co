import { Bell, Mail, MessageCircle, Phone } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import type { Patient } from '../patients/patientTypes'
import {
  getChannelAvailability,
  getCommunicationPreference,
  loadCommunicationPreferenceForPatientFromSupabase,
  updateCommunicationPreferencePersisted,
} from './communicationPreferencesStore'
import type { CommunicationChannel } from './communicationTypes'
import '../../styles/communication-preferences-responsive-v1.css'

type CommunicationPreferencesPanelProps = {
  patient: Patient
  actor: string
  canEdit?: boolean
}

const channelIcons: Record<CommunicationChannel, typeof Phone> = {
  sms: Phone,
  email: Mail,
  messenger: MessageCircle,
  in_app: Bell,
}

const channelField: Record<CommunicationChannel, 'smsEnabled' | 'emailEnabled' | 'messengerEnabled' | 'inAppEnabled'> = {
  sms: 'smsEnabled',
  email: 'emailEnabled',
  messenger: 'messengerEnabled',
  in_app: 'inAppEnabled',
}

export function CommunicationPreferencesPanel({ patient, actor, canEdit = true }: CommunicationPreferencesPanelProps) {
  const [preference, setPreference] = useState(() => getCommunicationPreference(patient.patientId))
  const [isLoading, setIsLoading] = useState(true)
  const [savingChannel, setSavingChannel] = useState<CommunicationChannel | 'all_external' | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const availability = useMemo(() => getChannelAvailability(patient, preference), [patient, preference])

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setFeedback(null)

    void loadCommunicationPreferenceForPatientFromSupabase(patient.patientId)
      .then((saved) => {
        if (active) setPreference(saved)
      })
      .catch((cause) => {
        if (!active) return
        setFeedback({
          tone: 'error',
          message: cause instanceof Error ? cause.message : 'Notification preferences could not be refreshed.',
        })
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => { active = false }
  }, [patient.patientId])

  useEffect(() => {
    const refreshFromStore = () => setPreference(getCommunicationPreference(patient.patientId))
    window.addEventListener('plamenco:communication-preferences-updated', refreshFromStore)
    return () => window.removeEventListener('plamenco:communication-preferences-updated', refreshFromStore)
  }, [patient.patientId])

  async function toggleChannel(channel: CommunicationChannel) {
    if (!canEdit || channel === 'in_app' || savingChannel) return
    const field = channelField[channel]
    setSavingChannel(channel)
    setFeedback(null)
    try {
      const updated = await updateCommunicationPreferencePersisted(
        patient.patientId,
        { [field]: !preference[field] },
        actor,
      )
      setPreference(updated)
      setFeedback({
        tone: 'success',
        message: `${availability.find((entry) => entry.channel === channel)?.label ?? channel} preference saved.`,
      })
    } catch (cause) {
      setFeedback({
        tone: 'error',
        message: cause instanceof Error ? cause.message : 'Your notification preference was not saved.',
      })
    } finally {
      setSavingChannel(null)
    }
  }

  async function enableAllExternalChannels() {
    if (!canEdit || isLoading || savingChannel) return
    setSavingChannel('all_external')
    setFeedback(null)
    try {
      const updated = await updateCommunicationPreferencePersisted(
        patient.patientId,
        {
          smsEnabled: true,
          emailEnabled: true,
          messengerEnabled: true,
        },
        actor,
      )
      setPreference(updated)
      setFeedback({
        tone: 'success',
        message: 'SMS, Email and Messenger consent has been saved. You can turn off any channel individually below.',
      })
    } catch (cause) {
      setFeedback({
        tone: 'error',
        message: cause instanceof Error ? cause.message : 'Your channel choices could not be saved.',
      })
    } finally {
      setSavingChannel(null)
    }
  }

  async function setPreferredChannel(channel: CommunicationChannel) {
    if (!canEdit || savingChannel) return
    setSavingChannel(channel)
    setFeedback(null)
    try {
      const updated = await updateCommunicationPreferencePersisted(patient.patientId, { preferredChannel: channel }, actor)
      setPreference(updated)
      const channelLabel = availability.find((entry) => entry.channel === channel)?.label ?? 'Channel'
      setFeedback({ tone: 'success', message: `${channelLabel} is now your preferred channel.` })
    } catch (cause) {
      setFeedback({
        tone: 'error',
        message: cause instanceof Error ? cause.message : 'Your preferred channel was not saved.',
      })
    } finally {
      setSavingChannel(null)
    }
  }

  return (
    <div className="communication-preferences-panel communication-preferences-responsive-v1" aria-busy={isLoading || Boolean(savingChannel)}>
      <div className="communication-panel-header">
        <div>
          <p className="eyebrow">Consent and reachability</p>
          <h4>Communication preferences</h4>
          <small>Choose which channels the clinic may use for your updates.</small>
        </div>
        <Badge tone="info">In-app on</Badge>
      </div>

      {!(preference.smsEnabled && preference.emailEnabled && preference.messengerEnabled) && (
        <section className="communication-enable-all" aria-labelledby="communication-enable-all-title">
          <div>
            <strong id="communication-enable-all-title">Enable all external channels</strong>
            <p>
              Allow the clinic to send appointment and care updates by SMS, email and Messenger.
              These channels use the contact details and Messenger account linked to your profile.
              You can turn off any channel below at any time. This does not include promotional messages.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => void enableAllExternalChannels()}
            disabled={isLoading || Boolean(savingChannel) || !canEdit}
            type="button"
          >
            {savingChannel === 'all_external' ? 'Saving consent…' : 'Enable SMS, Email & Messenger'}
          </Button>
        </section>
      )}

      {feedback && (
        <p className={`communication-preferences-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}>
          {feedback.message}
        </p>
      )}

      {isLoading && <p className="communication-preferences-loading" role="status">Checking your saved preferences…</p>}

      <div className="communication-channel-grid">
        {availability.map((entry) => {
          const Icon = channelIcons[entry.channel]
          const isSaving = savingChannel === entry.channel
          return (
            <article key={entry.channel} className={`communication-channel-card ${entry.enabled ? 'is-enabled' : 'is-disabled'}`}>
              <div className="communication-channel-topline">
                <div>
                  <Icon size={17} />
                  <strong>{entry.label}</strong>
                </div>
                <Badge tone={entry.available ? 'success' : entry.enabled ? 'warning' : 'neutral'}>
                  {entry.available ? 'Available' : entry.enabled ? 'Needs data' : 'Off'}
                </Badge>
              </div>
              <p>{entry.available ? entry.recipient : entry.reason}</p>
              <div className="communication-card-actions">
                <Button
                  size="sm"
                  variant={preference.preferredChannel === entry.channel ? 'primary' : 'secondary'}
                  onClick={() => void setPreferredChannel(entry.channel)}
                  disabled={isLoading || Boolean(savingChannel) || !canEdit || !entry.available}
                  title={!entry.available ? entry.reason : `Set ${entry.label} as preferred`}
                >
                  {isSaving ? 'Saving…' : 'Preferred'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void toggleChannel(entry.channel)}
                  disabled={isLoading || Boolean(savingChannel) || !canEdit || entry.channel === 'in_app'}
                  title={entry.channel === 'in_app' ? 'In-app notifications stay enabled for your portal account' : `${entry.enabled ? 'Disable' : 'Enable'} ${entry.label}`}
                >
                  {isSaving ? 'Saving…' : entry.channel === 'in_app' ? 'Always on' : entry.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </article>
          )
        })}
      </div>

      <p className="communication-consent-note">
        Preferred channel: <strong>{availability.find((entry) => entry.channel === preference.preferredChannel)?.label ?? 'In-app'}</strong>
        <span>Last consent update: {preference.consentUpdatedAt ? new Date(preference.consentUpdatedAt).toLocaleString('en-PH') : 'No external channel consent recorded'}</span>
      </p>
    </div>
  )
}
