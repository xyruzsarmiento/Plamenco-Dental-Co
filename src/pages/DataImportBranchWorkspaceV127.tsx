import { useBranchContext } from '../features/branches/BranchContext'
import { DataImportPageV21 } from './DataImportPageV21'

function shortBranchName(name: string) {
  return name.replace(/^Plamenco Dental Co\.\s*-\s*/i, '') || name
}

export function DataImportBranchWorkspaceV127() {
  const { activeBranch, isAllBranchesMode } = useBranchContext()
  return (
    <section className="import127-page">
      <DataImportPageV21
        scopeLabel={isAllBranchesMode ? 'Clinic-wide identity imports only' : activeBranch ? `${shortBranchName(activeBranch.name)} operational target` : 'Branch target required'}
        isAllBranchesMode={isAllBranchesMode}
      />
    </section>
  )
}
