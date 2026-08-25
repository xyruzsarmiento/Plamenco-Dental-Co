import { Building2, ChevronDown, Layers3 } from 'lucide-react'
import { useBranchContext } from '../../features/branches/BranchContext'

function workspaceLabel(code: string) {
  const normalized = code.trim().replace(/[-_]+/g, ' ')
  if (!normalized) return 'BRANCH WORKSPACE'
  return `${normalized.toUpperCase()} WORKSPACE`
}

function branchShortLabel(name: string, code: string) {
  const normalizedCode = code.trim().replace(/[-_]+/g, ' ')
  if (normalizedCode) return `${normalizedCode.replace(/\b\w/g, (letter) => letter.toUpperCase())} Branch`
  const location = name.split(' - ').pop()?.trim()
  return location ? `${location} Branch` : 'Branch workspace'
}

export function BranchContextIndicator() {
  const {
    activeBranch,
    availableBranches,
    canViewAllBranches,
    isAllBranchesMode,
    isLoading,
    error,
    hasBranchAccess,
    setActiveBranch,
    setAllBranches,
  } = useBranchContext()

  if (isLoading) {
    return (
      <div className="branch-context-indicator is-loading" aria-live="polite">
        <Building2 size={16} aria-hidden="true" />
        <span className="branch-context-indicator__copy">
          <small>BRANCH WORKSPACE</small>
          <strong>Loading branch access…</strong>
        </span>
      </div>
    )
  }

  if (error || !hasBranchAccess) {
    return (
      <div className="branch-context-indicator has-error" role="status">
        <Building2 size={16} aria-hidden="true" />
        <span className="branch-context-indicator__copy">
          <small>BRANCH WORKSPACE</small>
          <strong>{error ?? 'No active branch assignment'}</strong>
        </span>
      </div>
    )
  }

  const selectValue = isAllBranchesMode ? '__all__' : activeBranch?.id ?? ''
  const headline = isAllBranchesMode ? 'All Branches' : activeBranch?.name ?? 'Choose branch'
  const helper = isAllBranchesMode
    ? 'Executive overview'
    : activeBranch
      ? branchShortLabel(activeBranch.name, activeBranch.code)
      : 'Operational workspace'

  return (
    <label className={`branch-context-indicator ${isAllBranchesMode ? 'is-all-branches' : ''}`}>
      {isAllBranchesMode ? <Layers3 size={16} aria-hidden="true" /> : <Building2 size={16} aria-hidden="true" />}
      <span className="branch-context-indicator__copy">
        <small>{isAllBranchesMode ? 'ALL BRANCHES' : workspaceLabel(activeBranch?.code ?? '')}</small>
        <strong>{headline}</strong>
        <span>{helper}</span>
      </span>
      <ChevronDown className="branch-context-indicator__chevron" size={17} aria-hidden="true" />
      <select
        aria-label="Current branch workspace"
        value={selectValue}
        onChange={(event) => {
          if (event.target.value === '__all__') setAllBranches()
          else setActiveBranch(event.target.value)
        }}
      >
        {canViewAllBranches && <option value="__all__">All Branches — Executive overview</option>}
        {availableBranches.map((branch) => (
          <option key={branch.id} value={branch.id}>{branch.name}</option>
        ))}
      </select>
    </label>
  )
}
