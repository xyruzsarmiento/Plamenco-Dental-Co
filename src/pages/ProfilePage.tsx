import { AlertCircle, BadgeCheck, BriefcaseBusiness, Camera, CheckCircle2, IdCard, Mail, MapPin, Phone, Save, ShieldCheck, Stethoscope, UserRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ProfileSkeleton } from '../components/ui/DesignSystem'
import { AccountSecurityPanel } from '../features/auth/AccountSecurityPanel'
import { useAuth } from '../features/auth/AuthContext'
import { roleLabels } from '../features/auth/permissions'
import {
  getAvatarDisplayUrl,
  getInitials,
  loadDentistProfessionalProfile,
  loadOwnInternalProfile,
  type DentistProfessionalProfile,
  type InternalProfile,
  syncOwnInternalProfileEmail,
  updateOwnInternalProfile,
  uploadOwnAvatar,
  validateAvatarFile,
} from '../features/profiles/profileStore'

type FormState = {
  fullName: string
  phone: string
  jobTitle: string
  address: string
}

function profileToForm(profile: InternalProfile): FormState {
  return {
    fullName: profile.fullName,
    phone: profile.phone,
    jobTitle: profile.jobTitle,
    address: profile.address,
  }
}

function InfoItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="internal-profile-info-item">
      <span><Icon size={17} /></span>
      <div>
        <small>{label}</small>
        <strong>{value || 'Not provided'}</strong>
      </div>
    </div>
  )
}

export function ProfilePage() {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [profile, setProfile] = useState<InternalProfile | null>(null)
  const [professional, setProfessional] = useState<DentistProfessionalProfile | null>(null)
  const [form, setForm] = useState<FormState>({ fullName: '', phone: '', jobTitle: '', address: '' })
  const [isEditing, setIsEditing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const avatarUrl = useMemo(() => getAvatarDisplayUrl(profile?.avatarPath ?? ''), [profile?.avatarPath])
  const initials = getInitials(profile?.fullName || user?.name || '', profile?.email || user?.email || '')
  const isDentist = user?.role === 'dentist' || user?.role === 'associate_dentist'

  useEffect(() => {
    let active = true
    async function loadProfile() {
      if (!user?.id || user.role === 'patient') return
      setIsLoading(true)
      setFeedback(null)
      try {
        const nextProfile = await loadOwnInternalProfile(user.id)
        const nextProfessional = isDentist ? await loadDentistProfessionalProfile(user.id) : null
        if (!active) return
        setProfile(nextProfile)
        setProfessional(nextProfessional)
        setForm(profileToForm(nextProfile))
      } catch (error) {
        if (active) setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to load profile.' })
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void loadProfile()
    return () => { active = false }
  }, [isDentist, user?.id, user?.role])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setFeedback(null)
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function saveProfile() {
    if (!profile) return
    if (!form.fullName.trim()) {
      setFeedback({ tone: 'error', message: 'Full name is required.' })
      return
    }
    setIsSaving(true)
    setFeedback(null)
    try {
      const nextProfile = await updateOwnInternalProfile(profile.id, form)
      setProfile(nextProfile)
      setForm(profileToForm(nextProfile))
      setIsEditing(false)
      window.dispatchEvent(new Event('plamenco-profile-updated'))
      setFeedback({ tone: 'success', message: 'Profile updated.' })
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to save profile.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleAvatarChange(file?: File) {
    if (!file || !profile) return
    const validationError = validateAvatarFile(file)
    if (validationError) {
      setFeedback({ tone: 'error', message: validationError })
      return
    }
    setIsUploading(true)
    setFeedback(null)
    try {
      const nextProfile = await uploadOwnAvatar(profile.id, file, profile.avatarPath)
      setProfile(nextProfile)
      window.dispatchEvent(new Event('plamenco-profile-updated'))
      setFeedback({ tone: 'success', message: 'Profile photo updated.' })
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to upload profile photo.' })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (isLoading) {
    return (
      <section className="internal-profile-page">
        <ProfileSkeleton />
      </section>
    )
  }

  if (!profile) {
    return (
      <section className="internal-profile-page">
        <div className="internal-profile-empty">
          <AlertCircle size={28} />
          <h2>Profile unavailable</h2>
          <p>{feedback?.message || 'Your authenticated account does not have an internal profile record.'}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="internal-profile-page">
      <header className="internal-profile-hero">
        <div className="internal-profile-identity">
          <div className="internal-profile-avatar-wrap">
            <span className="internal-profile-avatar" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}>
              {!avatarUrl && initials}
            </span>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleAvatarChange(event.target.files?.[0])} />
          </div>
          <div className="internal-profile-title">
            <span className="internal-profile-kicker">Internal account</span>
            <h2>{profile.fullName || user?.name || 'Signed in user'}</h2>
            <p>{profile.jobTitle || professional?.displayName || roleLabels[profile.role] || 'Clinic team member'}</p>
            <div className="internal-profile-meta">
              <Badge tone="info">{roleLabels[profile.role] ?? profile.role}</Badge>
              <span><ShieldCheck size={14} /> {profile.status}</span>
              <span><Mail size={14} /> {profile.email || user?.email || 'No email'}</span>
            </div>
          </div>
        </div>
        <div className="internal-profile-actions">
          <button type="button" className="internal-profile-photo-action" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <Camera size={16} />
            {isUploading ? 'Uploading photo' : avatarUrl ? 'Change photo' : 'Add photo'}
          </button>
          {isEditing ? (
            <>
              <Button variant="secondary" icon={<X size={16} />} disabled={isSaving} onClick={() => { setForm(profileToForm(profile)); setIsEditing(false); setFeedback(null) }}>Cancel</Button>
              <Button icon={<Save size={16} />} disabled={isSaving} onClick={() => void saveProfile()}>{isSaving ? 'Saving' : 'Save'}</Button>
            </>
          ) : (
            <Button icon={<UserRound size={16} />} onClick={() => setIsEditing(true)}>Edit profile</Button>
          )}
        </div>
      </header>

      {feedback && (
        <div className={`internal-profile-feedback ${feedback.tone}`}>
          {feedback.tone === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="internal-profile-grid">
        <section className="internal-profile-panel internal-profile-panel-wide">
          <header><span><UserRound size={18} /></span><div><h3>Personal information</h3><p>Your name and internal display details used across the clinic workspace.</p></div></header>
          {isEditing ? (
            <div className="internal-profile-form">
              <label><span>Full name</span><input value={form.fullName} onChange={(event) => updateField('fullName', event.target.value)} /></label>
              <label><span>Job title / position</span><input value={form.jobTitle} onChange={(event) => updateField('jobTitle', event.target.value)} /></label>
              <label><span>Phone number</span><input type="tel" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} /></label>
              <label><span>Email</span><input value={profile.email || user?.email || ''} disabled /></label>
              <label className="is-wide"><span>Address</span><textarea value={form.address} onChange={(event) => updateField('address', event.target.value)} rows={3} /></label>
            </div>
          ) : (
            <div className="internal-profile-info-grid">
              <InfoItem icon={UserRound} label="Full name" value={profile.fullName} />
              <InfoItem icon={BriefcaseBusiness} label="Position" value={profile.jobTitle} />
              <InfoItem icon={Mail} label="Email" value={profile.email || user?.email || ''} />
              <InfoItem icon={Phone} label="Phone" value={profile.phone} />
              <InfoItem icon={MapPin} label="Address" value={profile.address} />
            </div>
          )}
        </section>

        <section className="internal-profile-panel">
          <header><span><IdCard size={18} /></span><div><h3>Account information</h3><p>Authentication and role context for this internal profile.</p></div></header>
          <div className="internal-profile-account-list">
            <div><small>Account ID</small><strong>{profile.id}</strong></div>
            <div><small>Role</small><strong>{roleLabels[profile.role] ?? profile.role}</strong></div>
            <div><small>Status</small><strong>{profile.status}</strong></div>
            <div><small>Last updated</small><strong>{profile.updatedAt ? new Date(profile.updatedAt).toLocaleString() : 'Not available'}</strong></div>
          </div>
        </section>

        <AccountSecurityPanel
          currentEmail={profile.email || user?.email || ''}
          onEmailSynced={async (email) => {
            const nextProfile = await syncOwnInternalProfileEmail(profile.id, email)
            setProfile(nextProfile)
            window.dispatchEvent(new Event('plamenco-profile-updated'))
          }}
        />

        {isDentist && (
          <section className="internal-profile-panel">
            <header><span><Stethoscope size={18} /></span><div><h3>Professional information</h3><p>Provider details linked to your dentist profile.</p></div></header>
            {professional ? (
              <div className="internal-profile-info-grid">
                <InfoItem icon={BadgeCheck} label="Dentist name" value={professional.displayName} />
                <InfoItem icon={Stethoscope} label="Specialization" value={professional.specialization} />
                <InfoItem icon={IdCard} label="License number" value={professional.licenseNumber} />
                <InfoItem icon={BriefcaseBusiness} label="Professional title" value={roleLabels[profile.role] ?? professional.role} />
              </div>
            ) : (
              <div className="internal-profile-note">No provider profile is linked to this account yet.</div>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
