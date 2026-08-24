import type { EnterpriseReportSnapshot } from './reportStore'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export type ReportTaxProfile =
  | 'non_vat_percentage'
  | 'vat_registered'
  | 'corporate_income_tax'
  | 'individual_professional'

export type ReportTaxEntityType = 'corporation' | 'individual_professional' | 'partnership'
export type ReportTaxVatStatus = 'non_vat' | 'vat_registered' | 'unknown'

export type ReportTaxConfiguration = {
  enabled: boolean
  taxProfile: ReportTaxProfile
  entityType: ReportTaxEntityType
  vatStatus: ReportTaxVatStatus
  percentageTaxRate: number
  corporateIncomeTaxRate: number
  vatRate: number
  vatThresholdCents: number | null
  effectiveDate: string
  notes: string
  updatedAt?: string
}

export type ReportTaxCalculation = {
  profileLabel: string
  basisLabel: string
  revenueBasisCents: number
  expenseBasisCents: number
  taxableIncomeCents: number
  estimatedTaxCents: number | null
  ratePercent: number | null
  supported: boolean
  statusLabel: string
  explanation: string
}

const STORAGE_KEY = 'plamenco.reports.taxConfiguration'
const DEFAULT_EFFECTIVE_DATE = '2026-01-01'

export const TAX_PLANNING_DISCLAIMER = "Planning estimate only. Actual tax liability depends on the clinic's registration, entity type, deductions and applicable BIR rules."

export const defaultReportTaxConfiguration: ReportTaxConfiguration = {
  enabled: true,
  taxProfile: 'non_vat_percentage',
  entityType: 'individual_professional',
  vatStatus: 'non_vat',
  percentageTaxRate: 3,
  corporateIncomeTaxRate: 25,
  vatRate: 12,
  vatThresholdCents: 300000000,
  effectiveDate: DEFAULT_EFFECTIVE_DATE,
  notes: 'Default non-VAT management profile uses a configurable 3% gross revenue percentage-tax assumption.',
}

function clampRate(value: unknown, fallback: number) {
  const rate = Number(value ?? fallback)
  return Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : fallback
}

function normalizeProfile(value: unknown): ReportTaxProfile {
  if (value === 'vat_registered' || value === 'corporate_income_tax' || value === 'individual_professional' || value === 'non_vat_percentage') return value
  return 'non_vat_percentage'
}

function normalizeEntityType(value: unknown): ReportTaxEntityType {
  if (value === 'corporation' || value === 'partnership' || value === 'individual_professional') return value
  return 'individual_professional'
}

function normalizeVatStatus(value: unknown): ReportTaxVatStatus {
  if (value === 'vat_registered' || value === 'non_vat' || value === 'unknown') return value
  return 'non_vat'
}

function normalize(input?: Partial<ReportTaxConfiguration> & Record<string, unknown> | null): ReportTaxConfiguration {
  const legacyRate = input?.ratePercent
  const profile = normalizeProfile(input?.taxProfile ?? input?.tax_profile)
  return {
    enabled: input?.enabled !== false,
    taxProfile: profile,
    entityType: normalizeEntityType(input?.entityType ?? input?.entity_type),
    vatStatus: normalizeVatStatus(input?.vatStatus ?? input?.vat_status),
    percentageTaxRate: clampRate(input?.percentageTaxRate ?? input?.percentage_tax_rate ?? (profile === 'non_vat_percentage' ? legacyRate : undefined), defaultReportTaxConfiguration.percentageTaxRate),
    corporateIncomeTaxRate: clampRate(input?.corporateIncomeTaxRate ?? input?.corporate_income_tax_rate, defaultReportTaxConfiguration.corporateIncomeTaxRate),
    vatRate: clampRate(input?.vatRate ?? input?.vat_rate, defaultReportTaxConfiguration.vatRate),
    vatThresholdCents: input?.vatThresholdCents === null || input?.vat_threshold_cents === null
      ? null
      : Math.max(0, Number(input?.vatThresholdCents ?? input?.vat_threshold_cents ?? defaultReportTaxConfiguration.vatThresholdCents)),
    effectiveDate: String(input?.effectiveDate ?? input?.effective_date ?? DEFAULT_EFFECTIVE_DATE),
    notes: String(input?.notes ?? '').trim(),
    updatedAt: String(input?.updatedAt ?? input?.updated_at ?? ''),
  }
}

function toSupabaseRow(configuration: ReportTaxConfiguration, updatedBy: string | null) {
  return {
    id: 'clinic',
    enabled: configuration.enabled,
    tax_profile: configuration.taxProfile,
    entity_type: configuration.entityType,
    vat_status: configuration.vatStatus,
    percentage_tax_rate: configuration.percentageTaxRate,
    corporate_income_tax_rate: configuration.corporateIncomeTaxRate,
    vat_rate: configuration.vatRate,
    vat_threshold_cents: configuration.vatThresholdCents,
    effective_date: configuration.effectiveDate,
    notes: configuration.notes,
    updated_by: updatedBy,
  }
}

function fromSupabaseRow(data: Record<string, unknown>): ReportTaxConfiguration {
  return normalize({
    enabled: data.enabled,
    tax_profile: data.tax_profile,
    entity_type: data.entity_type,
    vat_status: data.vat_status,
    percentage_tax_rate: data.percentage_tax_rate ?? data.rate_percent ?? defaultReportTaxConfiguration.percentageTaxRate,
    corporate_income_tax_rate: data.corporate_income_tax_rate ?? defaultReportTaxConfiguration.corporateIncomeTaxRate,
    vat_rate: data.vat_rate ?? defaultReportTaxConfiguration.vatRate,
    vat_threshold_cents: data.vat_threshold_cents === null ? null : data.vat_threshold_cents ?? defaultReportTaxConfiguration.vatThresholdCents,
    effective_date: data.effective_date,
    notes: data.notes,
    updated_at: data.updated_at,
  } as Record<string, unknown>)
}

export function getReportTaxProfileLabel(profile: ReportTaxProfile) {
  switch (profile) {
    case 'non_vat_percentage': return 'Non-VAT percentage tax'
    case 'vat_registered': return 'VAT-registered reporting'
    case 'corporate_income_tax': return 'Corporate income tax'
    case 'individual_professional': return 'Individual/professional practice'
  }
}

function cache(configuration: ReportTaxConfiguration) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configuration))
}

export function getStoredReportTaxConfiguration(): ReportTaxConfiguration {
  if (typeof window === 'undefined') return defaultReportTaxConfiguration
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') as Partial<ReportTaxConfiguration> | null
    return normalize(parsed)
  } catch {
    return defaultReportTaxConfiguration
  }
}

export async function loadReportTaxConfiguration(): Promise<ReportTaxConfiguration> {
  if (!isSupabaseConfigured || !supabase) return getStoredReportTaxConfiguration()
  const { data, error } = await supabase.from('report_tax_configuration').select('*').eq('id', 'clinic').maybeSingle()
  if (error || !data) return getStoredReportTaxConfiguration()
  const configuration = fromSupabaseRow(data as Record<string, unknown>)
  cache(configuration)
  return configuration
}

export async function saveReportTaxConfiguration(configuration: ReportTaxConfiguration): Promise<ReportTaxConfiguration> {
  const normalized = normalize(configuration)
  if (!isSupabaseConfigured || !supabase) {
    cache(normalized)
    return normalized
  }
  const { data: authData } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('report_tax_configuration')
    .upsert(toSupabaseRow(normalized, authData.user?.id ?? null))
    .select('*')
    .single()
  if (error) throw new Error(`Unable to save report tax settings: ${error.message}`)
  const saved = fromSupabaseRow(data as Record<string, unknown>)
  cache(saved)
  return saved
}

export function calculateReportTax(snapshot: EnterpriseReportSnapshot, configuration: ReportTaxConfiguration): ReportTaxCalculation {
  const revenueBasisCents = snapshot.executive.billedRevenueCents
  const expenseBasisCents = snapshot.executive.operatingExpensesCents
  const taxableIncomeCents = Math.max(0, revenueBasisCents - expenseBasisCents)
  const profileLabel = getReportTaxProfileLabel(configuration.taxProfile)

  if (!configuration.enabled) {
    return {
      profileLabel,
      basisLabel: 'Disabled',
      revenueBasisCents,
      expenseBasisCents,
      taxableIncomeCents,
      estimatedTaxCents: 0,
      ratePercent: null,
      supported: true,
      statusLabel: 'Disabled',
      explanation: 'Management tax estimates are disabled for this report.',
    }
  }

  if (configuration.taxProfile === 'non_vat_percentage') {
    return {
      profileLabel,
      basisLabel: 'Gross sales/revenue',
      revenueBasisCents,
      expenseBasisCents: 0,
      taxableIncomeCents: revenueBasisCents,
      estimatedTaxCents: Math.round(revenueBasisCents * (configuration.percentageTaxRate / 100)),
      ratePercent: configuration.percentageTaxRate,
      supported: true,
      statusLabel: 'Estimated',
      explanation: 'Uses configured non-VAT percentage tax rate against recorded gross billed revenue for the selected report range.',
    }
  }

  if (configuration.taxProfile === 'corporate_income_tax') {
    const supported = configuration.entityType === 'corporation'
    return {
      profileLabel,
      basisLabel: 'Recorded revenue minus recorded expenses',
      revenueBasisCents,
      expenseBasisCents,
      taxableIncomeCents,
      estimatedTaxCents: supported ? Math.round(taxableIncomeCents * (configuration.corporateIncomeTaxRate / 100)) : null,
      ratePercent: supported ? configuration.corporateIncomeTaxRate : null,
      supported,
      statusLabel: supported ? 'Estimated' : 'Configuration required',
      explanation: supported
        ? 'Uses configured corporate income tax rate against recorded revenue less recorded operating expenses in the selected report range.'
        : 'Corporate income tax is only calculated when the clinic entity type is configured as corporation.',
    }
  }

  if (configuration.taxProfile === 'vat_registered') {
    return {
      profileLabel,
      basisLabel: 'VAT output/input data required',
      revenueBasisCents,
      expenseBasisCents,
      taxableIncomeCents,
      estimatedTaxCents: null,
      ratePercent: configuration.vatRate,
      supported: false,
      statusLabel: 'VAT data required',
      explanation: 'The current report data does not distinguish VAT-exclusive sales, output VAT, purchase VAT, or input VAT credits, so a VAT payable estimate is not generated.',
    }
  }

  return {
    profileLabel,
    basisLabel: 'Individual tax configuration required',
    revenueBasisCents,
    expenseBasisCents,
    taxableIncomeCents,
    estimatedTaxCents: null,
    ratePercent: null,
    supported: false,
    statusLabel: 'Configuration required',
    explanation: 'Individual/professional practice income tax depends on elected tax treatment and brackets that are not configured in this reporting workspace.',
  }
}
