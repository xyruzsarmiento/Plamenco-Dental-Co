import type { Patient } from './patientTypes'

export const PATIENT_AVATAR_SIZES = {
  compact: 24,
  small: 32,
  card: 40,
  identity: 56,
  large: 64,
  hero: 88,
} as const

export type PatientAvatarSize = keyof typeof PATIENT_AVATAR_SIZES | number

type PatientIdentity = Pick<Patient, 'firstName' | 'lastName' | 'fullName' | 'profileImage'>

export function getPatientAvatarInitials(patient: Pick<PatientIdentity, 'firstName' | 'lastName'>) {
  const firstInitial = patient.firstName.trim().charAt(0)
  const lastInitial = patient.lastName.trim().charAt(0)
  return `${firstInitial}${lastInitial}`.toUpperCase() || '?'
}

export function getPatientAvatarName(patient: Pick<PatientIdentity, 'firstName' | 'lastName' | 'fullName'>) {
  return [patient.firstName, patient.lastName].map((part) => part.trim()).filter(Boolean).join(' ')
    || patient.fullName?.trim()
    || 'Patient'
}

export function getPatientProfileImage(patient: Pick<PatientIdentity, 'profileImage'>) {
  return typeof patient.profileImage === 'string' ? patient.profileImage.trim() : ''
}

export function resolvePatientAvatarSize(size: PatientAvatarSize = 'card') {
  if (typeof size === 'number') {
    return Number.isFinite(size) && size > 0 ? Math.max(16, Math.round(size)) : PATIENT_AVATAR_SIZES.card
  }

  return PATIENT_AVATAR_SIZES[size]
}
