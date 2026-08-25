export type ClinicImportDomain = 'patients' | 'appointments' | 'treatments' | 'payments' | 'inventory' | 'expenses'

const BRANCH_SENSITIVE_IMPORTS = new Set<ClinicImportDomain>(['appointments', 'treatments', 'payments', 'inventory', 'expenses'])

export function importRequiresBranchTargetV127(domain: ClinicImportDomain) {
  return BRANCH_SENSITIVE_IMPORTS.has(domain)
}

export function assertImportTargetV127(domain: ClinicImportDomain, branchId: string | null | undefined, authorizedBranchIds: string[]) {
  if (!importRequiresBranchTargetV127(domain)) return
  if (!branchId) throw new Error('Choose a specific target branch before importing operational records.')
  if (!authorizedBranchIds.includes(branchId)) throw new Error('The selected import branch is not authorized for this account.')
}

export const branchSensitiveImportDomainsV127 = [...BRANCH_SENSITIVE_IMPORTS]
