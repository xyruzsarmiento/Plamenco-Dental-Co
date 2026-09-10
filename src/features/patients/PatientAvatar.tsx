import { useState, type CSSProperties } from 'react'
import type { Patient } from './patientTypes'
import {
  getPatientAvatarInitials,
  getPatientAvatarName,
  getPatientProfileImage,
  resolvePatientAvatarSize,
  type PatientAvatarSize,
} from './patientAvatarUtils'
import './patient-avatar.css'

type PatientAvatarPatient = Pick<Patient, 'firstName' | 'lastName' | 'fullName' | 'profileImage'>

export type PatientAvatarProps = {
  patient: PatientAvatarPatient
  size?: PatientAvatarSize
  className?: string
  alt?: string
  decorative?: boolean
  loading?: 'eager' | 'lazy'
}

export function PatientAvatar({
  patient,
  size = 'card',
  className = '',
  alt,
  decorative = false,
  loading = 'lazy',
}: PatientAvatarProps) {
  const source = getPatientProfileImage(patient)
  const name = getPatientAvatarName(patient)
  const initials = getPatientAvatarInitials(patient)
  const pixelSize = resolvePatientAvatarSize(size)
  const [loadedSource, setLoadedSource] = useState('')
  const [failedSource, setFailedSource] = useState('')
  const shouldRenderImage = Boolean(source) && failedSource !== source
  const imageIsLoaded = shouldRenderImage && loadedSource === source
  const isDecorative = decorative || alt === ''
  const imageAlt = isDecorative ? '' : alt ?? `${name} profile photo`
  const fallbackIsSemantic = !isDecorative && !shouldRenderImage
  const style = { '--patient-avatar-size': `${pixelSize}px` } as CSSProperties

  return (
    <span
      className={`patient-avatar${imageIsLoaded ? ' has-loaded-image' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden={isDecorative || undefined}
      aria-label={fallbackIsSemantic ? `${name} profile` : undefined}
      role={fallbackIsSemantic ? 'img' : undefined}
    >
      <span className="patient-avatar-initials" aria-hidden="true">{initials}</span>
      {shouldRenderImage && (
        <img
          className="patient-avatar-image"
          src={source}
          alt={imageAlt}
          width={pixelSize}
          height={pixelSize}
          loading={loading}
          decoding="async"
          onLoad={() => {
            setFailedSource('')
            setLoadedSource(source)
          }}
          onError={() => {
            setLoadedSource('')
            setFailedSource(source)
          }}
        />
      )}
    </span>
  )
}
