import { Building2, ClipboardSignature, ShieldCheck } from 'lucide-react'
import { useBranchContext } from '../features/branches/BranchContext'
import { FormsConsentAdminPageV28 } from './FormsConsentAdminPageV28'

function shortBranchName(name: string) {
  return name.replace(/^Plamenco Dental Co\.\s*-\s*/i, '') || name
}

export function FormsConsentBranchWorkspaceV127() {
  const { activeBranch, isAllBranchesMode } = useBranchContext()
  return (
    <section className="forms127-page">
      <div className="forms127-context">
        <div className="forms127-icon"><ClipboardSignature size={19} /></div>
        <div>
          <span>FORM GOVERNANCE</span>
          <strong>Templates are clinic-wide</strong>
          <p>Published wording and version history remain shared across Plamenco Dental Co. Patient assignments and completed submissions retain their care branch and linked appointment, visit, or treatment context where applicable.</p>
        </div>
        <div className="forms127-badge">{isAllBranchesMode ? <><ShieldCheck size={15} /> Clinic-wide templates</> : <><Building2 size={15} /> {activeBranch ? shortBranchName(activeBranch.name) : 'Branch context'}</>}</div>
      </div>
      <FormsConsentAdminPageV28 />
    </section>
  )
}
