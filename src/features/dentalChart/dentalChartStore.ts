import type {
  DentalChartHistoryEntry,
  DentalCondition,
  DentalToothEntry,
  DentalToothStatus,
} from './dentalChartTypes'
import { DENTAL_CHART_TOOTH_NUMBERS, FDI_LOWER_LEFT, FDI_LOWER_RIGHT, FDI_UPPER_LEFT, FDI_UPPER_RIGHT } from './dentalChartTypes'

const DENTAL_CHART_STORAGE_KEY = 'plamenco.dentalChart'

function createDefaultHistory(date: string): DentalChartHistoryEntry[] {
  return [
    {
      id: `history-${date}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      condition: 'healthy',
      treatment: 'Initial assessment',
      notes: 'No active treatment indicated.',
      status: 'completed',
    },
  ]
}

function createDefaultTooth(toothNumber: number): DentalToothEntry {
  const today = new Date().toISOString().split('T')[0]

  return {
    toothNumber,
    condition: 'healthy',
    treatment: 'No active treatment',
    notes: 'No active findings.',
    date: today,
    status: 'completed',
    history: createDefaultHistory(today),
  }
}

const seedChartByPatient: Record<string, DentalToothEntry[]> = {}

function getAllDefaultTeeth(): DentalToothEntry[] {
  return DENTAL_CHART_TOOTH_NUMBERS.map((toothNumber) => createDefaultTooth(toothNumber))
}

function safeParseChart(value: string | null): Record<string, DentalToothEntry[]> | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Record<string, DentalToothEntry[]>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function getStoredDentalChart(): Record<string, DentalToothEntry[]> {
  const stored = safeParseChart(window.localStorage.getItem(DENTAL_CHART_STORAGE_KEY))
  if (stored) return stored

  window.localStorage.setItem(DENTAL_CHART_STORAGE_KEY, JSON.stringify(seedChartByPatient))
  return seedChartByPatient
}

export function getDentalChartForPatient(patientId: string): DentalToothEntry[] {
  const stored = getStoredDentalChart()
  const patientChart = stored[patientId]

  if (patientChart?.length) {
    return patientChart
  }

  const defaultTeeth = getAllDefaultTeeth()
  stored[patientId] = defaultTeeth
  window.localStorage.setItem(DENTAL_CHART_STORAGE_KEY, JSON.stringify(stored))
  return defaultTeeth
}

export function saveDentalChartForPatient(patientId: string, teeth: DentalToothEntry[]) {
  const current = getStoredDentalChart()
  current[patientId] = teeth
  window.localStorage.setItem(DENTAL_CHART_STORAGE_KEY, JSON.stringify(current))
}

export function upsertDentalTooth(
  patientId: string,
  toothNumber: number,
  values: {
    condition: DentalCondition
    treatment: string
    notes: string
    date: string
    status: DentalToothStatus
  }
): DentalToothEntry {
  const chart = getDentalChartForPatient(patientId)
  const existing = chart.find((tooth) => tooth.toothNumber === toothNumber)
  const entryDate = values.date || new Date().toISOString().split('T')[0]
  const nextHistoryEntry: DentalChartHistoryEntry = {
    id: `history-${toothNumber}-${Date.now()}`,
    date: entryDate,
    condition: values.condition,
    treatment: values.treatment || 'No treatment recorded',
    notes: values.notes || 'No notes recorded.',
    status: values.status,
  }

  const nextEntry: DentalToothEntry = existing
    ? {
        ...existing,
        condition: values.condition,
        treatment: values.treatment,
        notes: values.notes,
        date: entryDate,
        status: values.status,
        history: [nextHistoryEntry, ...existing.history].slice(0, 12),
      }
    : {
        toothNumber,
        condition: values.condition,
        treatment: values.treatment,
        notes: values.notes,
        date: entryDate,
        status: values.status,
        history: [nextHistoryEntry],
      }

  const nextChart = existing
    ? chart.map((tooth) => (tooth.toothNumber === toothNumber ? nextEntry : tooth))
    : [...chart, nextEntry]

  saveDentalChartForPatient(patientId, nextChart)
  return nextEntry
}

export function getToothEntry(patientId: string, toothNumber: number): DentalToothEntry | undefined {
  return getDentalChartForPatient(patientId).find((tooth) => tooth.toothNumber === toothNumber)
}

export function getDentalChartLayout() {
  return {
    upper: {
      left: FDI_UPPER_LEFT,
      right: FDI_UPPER_RIGHT,
    },
    lower: {
      left: FDI_LOWER_LEFT,
      right: FDI_LOWER_RIGHT,
    },
  }
}

export { DENTAL_CHART_STORAGE_KEY }
