import { Bell, Mail, MessageCircle, Phone } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import type { Patient } from '../patients/patientTypes'
import {
  getChannelAvailability,
  getCommunicationPreference,
  updateCommunicationPreference,
} from './communicationPreferencesStore'
import type { CommunicationChannel } from './communicationTypes'

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
  const availability = useMemo(() => getChannelAvailability(patient, preference), [patient, preference])

  function toggleChannel(channel: CommunicationChannel) {
    const field = channelField[channel]
    if (channel === 'in_app') return
    setPreference(updateCommunicationPreference(patient.patientId, { [field]: !preference[field] }, actor))
  }

  function setPreferredChannel(channel: CommunicationChannel) {
    setPreference(updateCommunicationPreference(patient.patientId, { preferredChannel: channel }, actor))
  }

  return (
    <div className="communication-preferences-panel">
      <div className="communication-panel-header">
        <div>
          <p className="eyebrow">Consent and reachability</p>
          <h4>Communication preferences</h4>
        </div>
        <Badge tone="info">In-app on</Badge>
      </div>

      <div className="communication-channel-grid">
        {availability.map((entry) => {
          const Icon = channelIcons[entry.channel]
          return (
            <article key={entry.channel} className="communication-channel-card">
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
                  onClick={() => setPreferredChannel(entry.channel)}
                  disabled={!canEdit || !entry.available}
                >
                  Preferred
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => toggleChannel(entry.channel)}
                  disabled={!canEdit || entry.channel === 'in_app'}
                >
                  {entry.enabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
            </article>
          )
        })}
      </div>

      <p className="communication-consent-note">
        Last consent update: {preference.consentUpdatedAt ? new Date(preference.consentUpdatedAt).toLocaleString() : 'No explicit channel consent recorded'}
      </p>
    </div>
  )
}
