import type { Patient, PatientSex } from './patientTypes'

export function getPatientName(patient: Pick<Patient, 'firstName' | 'middleName' | 'lastName'>) {
  return [patient.firstName, patient.middleName, patient.lastName].filter(Boolean).join(' ')
}

export function getPatientAge(dateOfBirth: string) {
  if (!dateOfBirth) {
    return null
  }

  const birthDate = new Date(`${dateOfBirth}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDelta = today.getMonth() - birthDate.getMonth()

  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return Number.isFinite(age) && age >= 0 ? age : null
}

export function formatSex(sex: PatientSex) {
  const labels: Record<PatientSex, string> = {
    female: 'Female',
    male: 'Male',
    other: 'Other',
    prefer_not_to_say: 'Prefer not to say',
  }

  return labels[sex]
}

export function formatDate(value: string) {
  if (!value) {
    return 'Not provided'
  }

  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}
