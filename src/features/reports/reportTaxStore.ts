import type { EnterpriseReportSnapshot } from './reportStore'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'

export type ReportTaxBasis = 'billed_revenue' | 'collections'

export type ReportTaxConfiguration = {
  enabled: boolean
  taxLabel: string
  ratePercent: number
  basis: ReportTaxBasis
  pricesIncludeTax: boolean
  notes: string
  updatedAt?: string
}

const STORAGE_KEY = 'plamenco.reports.taxConfiguration'

export const defaultReportTaxConfiguration: ReportTaxConfiguration = {
  enabled: false,
  taxLabel: 'Tax',
  ratePercent: 0,
  basis: 'billed_revenue',
  pricesIncludeTax: true,
  notes: '',
}

function normalize(input?: Partial<ReportTaxConfiguration> | null): ReportTaxConfiguration {
  const rate = Number(input?.ratePercent ?? 0)
  return {
    enabled: Boolean(input?.enabled),
    taxLabel: String(input?.taxLabel || 'Tax').trim() || 'Tax',
    ratePercent: Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0,
    basis: input?.basis === 'collections' ? 'collections' : 'billed_revenue',
    pricesIncludeTax: input?.pricesIncludeTax !== false,
    notes: String(input?.notes ?? '').trim(),
    updatedAt: input?.updatedAt,
  }
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

function cache(configuration: ReportTaxConfiguration) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configuration))
}

export async function loadReportTaxConfiguration(): Promise<ReportTaxConfiguration> {
  if (!isSupabaseConfigured || !supabase) return getStoredReportTaxConfiguration()
  const { data, error } = await supabase.from('report_tax_configuration').select('*').eq('id', 'clinic').maybeSingle()
  if (error || !data) return getStoredReportTaxConfiguration()
  const configuration = normalize({
    enabled: data.enabled,
    taxLabel: data.tax_label,
    ratePercent: Number(data.rate_percent ?? 0),
    basis: data.basis,
    pricesIncludeTax: data.prices_include_tax,
    notes: data.notes,
    updatedAt: data.updated_at,
  })
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
  const { data, error } = await supabase.from('report_tax_configuration').upsert({
    id: 'clinic',
    enabled: normalized.enabled,
    tax_label: normalized.taxLabel,
    rate_percent: normalized.ratePercent,
    basis: normalized.basis,
    prices_include_tax: normalized.pricesIncludeTax,
    notes: normalized.notes,
    updated_by: authData.user?.id ?? null,
  }).select('*').single()
  if (error) throw new Error(`Unable to save report tax settings: ${error.message}`)
  const saved = normalize({
    enabled: data.enabled,
    taxLabel: data.tax_label,
    ratePercent: Number(data.rate_percent ?? 0),
    basis: data.basis,
    pricesIncludeTax: data.prices_include_tax,
    notes: data.notes,
    updatedAt: data.updated_at,
  })
  cache(saved)
  return saved
}

export function calculateReportTax(snapshot: EnterpriseReportSnapshot, configuration: ReportTaxConfiguration) {
  const baseCents = configuration.basis === 'collections'
    ? snapshot.executive.collectedCashCents
    : snapshot.executive.billedRevenueCents
  const rate = configuration.enabled ? configuration.ratePercent / 100 : 0
  const estimatedTaxCents = rate <= 0
    ? 0
    : configuration.pricesIncludeTax
      ? Math.round(baseCents * (rate / (1 + rate)))
      : Math.round(baseCents * rate)
  const baseExcludingTaxCents = configuration.pricesIncludeTax ? baseCents - estimatedTaxCents : baseCents
  const baseIncludingTaxCents = configuration.pricesIncludeTax ? baseCents : baseCents + estimatedTaxCents
  return { baseCents, estimatedTaxCents, baseExcludingTaxCents, baseIncludingTaxCents }
}
