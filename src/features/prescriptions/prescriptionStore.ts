export type Prescription = {
  id: string
  patientId: string
  medication: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
  prescribedBy: string
  prescriptionDate: string
  createdAt: string
  updatedAt: string
}

type PrescriptionInput = {
  patientId: string
  medication: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
  prescribedBy: string
}

const PRESCRIPTION_STORAGE_KEY = 'plamenco.prescriptions'

function safeParse<T>(value: string | null): T | null {
  if (!value) return null

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  } as Storage
}

function getStorage(): Storage {
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
    return globalThis.localStorage
  }

  const globalWithMemory = globalThis as typeof globalThis & {
    __plamencoPrescriptionMemoryStorage?: Storage
  }

  if (globalWithMemory.__plamencoPrescriptionMemoryStorage) {
    return globalWithMemory.__plamencoPrescriptionMemoryStorage
  }

  const memory = createMemoryStorage()
  globalWithMemory.__plamencoPrescriptionMemoryStorage = memory
  return memory
}

export function getStoredPrescriptions(): Prescription[] {
  const stored = safeParse<Prescription[]>(getStorage().getItem(PRESCRIPTION_STORAGE_KEY))
  if (stored?.length) {
    return stored
  }

  const seedPrescriptions: Prescription[] = []

  getStorage().setItem(PRESCRIPTION_STORAGE_KEY, JSON.stringify(seedPrescriptions))
  return seedPrescriptions
}

export function saveStoredPrescriptions(prescriptions: Prescription[]) {
  getStorage().setItem(PRESCRIPTION_STORAGE_KEY, JSON.stringify(prescriptions))
}

export function getPrescriptionsByPatient(patientId: string): Prescription[] {
  return getStoredPrescriptions()
    .filter((prescription) => prescription.patientId === patientId)
    .sort((a, b) => new Date(b.prescriptionDate).getTime() - new Date(a.prescriptionDate).getTime())
}

export function createPrescription({ patientId, medication, dosage, frequency, duration, instructions, prescribedBy }: PrescriptionInput): Prescription {
  if (!patientId.trim()) throw new Error('Patient is required.')
  if (!medication.trim()) throw new Error('Medication is required.')
  if (!dosage.trim()) throw new Error('Dosage is required.')
  if (!frequency.trim()) throw new Error('Frequency is required.')
  if (!duration.trim()) throw new Error('Duration is required.')
  if (!prescribedBy.trim()) throw new Error('Prescriber is required.')

  const now = new Date().toISOString()
  const prescription: Prescription = {
    id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    patientId,
    medication: medication.trim(),
    dosage: dosage.trim(),
    frequency: frequency.trim(),
    duration: duration.trim(),
    instructions: instructions.trim() || 'Follow medication instructions as directed.',
    prescribedBy: prescribedBy.trim(),
    prescriptionDate: now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
  }

  const prescriptions = getStoredPrescriptions()
  prescriptions.push(prescription)
  saveStoredPrescriptions(prescriptions)
  return prescription
}

export function getPrescriptionPrintableText(prescription: Prescription): string {
  return [
    'Plamenco Dental Co',
    'Prescription',
    `Patient ID: ${prescription.patientId}`,
    `Medication: ${prescription.medication}`,
    `Dosage: ${prescription.dosage}`,
    `Frequency: ${prescription.frequency}`,
    `Duration: ${prescription.duration}`,
    `Instructions: ${prescription.instructions}`,
    `Prescribed by: ${prescription.prescribedBy}`,
    `Date: ${prescription.prescriptionDate}`,
  ].join('\n')
}

export { PRESCRIPTION_STORAGE_KEY }
