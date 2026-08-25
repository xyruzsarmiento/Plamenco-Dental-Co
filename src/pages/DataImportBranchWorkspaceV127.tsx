import { Building2, Database, ShieldCheck } from 'lucide-react'
import { useBranchContext } from '../features/branches/BranchContext'
import { DataImportPageV21 } from './DataImportPageV21'

function shortBranchName(name: string) {
  return name.replace(/^Plamenco Dental Co\.\s*-\s*/i, '') || name
}

export function DataImportBranchWorkspaceV127() {
  const { activeBranch, isAllBranchesMode } = useBranchContext()
  return (
    <section className="import127-page">
      <div className="import127-scope">
        <div className="import127-scope-icon"><Database size={19} /></div>
        <div>
          <span>IMPORT SCOPE</span>
          <strong>{isAllBranchesMode ? 'Clinic-wide identity imports only' : activeBranch ? `${shortBranchName(activeBranch.name)} operational target` : 'Branch target required'}</strong>
          <p>Patient identity imports remain clinic-wide. Appointment, treatment, payment, inventory, and expense imports must use an explicit authorized branch when those import types are enabled.</p>
        </div>
        <div className="import127-badge">{isAllBranchesMode ? <><ShieldCheck size={15} /> No implicit branch</> : <><Building2 size={15} /> {activeBranch ? shortBranchName(activeBranch.name) : 'No branch'}</>}</div>
      </div>
      {isAllBranchesMode && <div className="import127-note"><ShieldCheck size={17} /><span><strong>All Branches never becomes an import destination.</strong> Future branch-sensitive import workflows must ask for Pulilan or Plaridel explicitly before validation or commit. The currently enabled patient import remains clinic-wide because patient identity is shared.</span></div>}
      <DataImportPageV21 />
    </section>
  )
}
