export type DentalCondition =
  | 'healthy'
  | 'caries'
  | 'filled'
  | 'missing'
  | 'crown'
  | 'root_canal'
  | 'extraction'
  | 'implant'
  | 'other'

export type DentalToothStatus = 'active' | 'monitoring' | 'follow_up' | 'completed'

export type DentalChartHistoryEntry = {
  id: string
  date: string
  condition: DentalCondition
  treatment: string
  notes: string
  status: DentalToothStatus
}

export type DentalToothEntry = {
  toothNumber: number
  condition: DentalCondition
  treatment: string
  notes: string
  date: string
  status: DentalToothStatus
  history: DentalChartHistoryEntry[]
}

export const DENTAL_CONDITION_META: Record<
  DentalCondition,
  { label: string; short: string; description: string }
> = {
  healthy: { label: 'Healthy', short: 'H', description: 'No active treatment needs' },
  caries: { label: 'Caries', short: 'C', description: 'Cavity or active decay' },
  filled: { label: 'Filled', short: 'F', description: 'Restoration present' },
  missing: { label: 'Missing', short: 'M', description: 'Tooth absent' },
  crown: { label: 'Crown', short: 'CR', description: 'Crown on the tooth' },
  root_canal: { label: 'Root Canal', short: 'R', description: 'Endodontic treatment completed' },
  extraction: { label: 'Extraction', short: 'X', description: 'Previously extracted' },
  implant: { label: 'Implant', short: 'I', description: 'Implant present' },
  other: { label: 'Other', short: 'O', description: 'Other condition' },
}

export const FDI_UPPER_LEFT = [18, 17, 16, 15, 14, 13, 12, 11]
export const FDI_UPPER_RIGHT = [21, 22, 23, 24, 25, 26, 27, 28]
export const FDI_LOWER_LEFT = [48, 47, 46, 45, 44, 43, 42, 41]
export const FDI_LOWER_RIGHT = [31, 32, 33, 34, 35, 36, 37, 38]

export const DENTAL_CHART_TOOTH_NUMBERS = [
  ...FDI_UPPER_LEFT,
  ...FDI_UPPER_RIGHT,
  ...FDI_LOWER_RIGHT,
  ...FDI_LOWER_LEFT,
]
