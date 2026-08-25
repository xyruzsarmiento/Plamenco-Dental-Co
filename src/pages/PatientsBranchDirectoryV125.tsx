import { Building2, UsersRound } from 'lucide-react'
import { Badge } from '../components/ui/Badge'
import { useBranchContext } from '../features/branches/BranchContext'
import { PatientsPageV36 } from './PatientsPageV36'

export function PatientsBranchDirectoryV125() {
  const { activeBranch, isAllBranchesMode } = useBranchContext()

  return (
    <section className="patients125-directory-shell">
      <aside className="patients125-directory-context" aria-label="Patient directory scope">
        <div className="patients125-directory-icon"><UsersRound size={18} /></div>
        <div>
          <span>CLINIC-WIDE PATIENT DIRECTORY</span>
          <strong>One patient identity across Plamenco Dental Co.</strong>
          <p>
            {isAllBranchesMode
              ? 'Search every patient once across the clinic. Branch ownership stays on appointments, clinical visits, treatments, prescriptions, invoices, documents and follow-ups.'
              : `You are working in ${activeBranch?.name ?? 'a branch'} while patient identity remains clinic-wide. Existing patients from another branch remain searchable to prevent duplicate records.`}
          </p>
        </div>
        <Badge tone="info"><Building2 size={13} /> {isAllBranchesMode ? 'All branches' : activeBranch?.name ?? 'Branch context'}</Badge>
      </aside>
      <PatientsPageV36 />
    </section>
  )
}
