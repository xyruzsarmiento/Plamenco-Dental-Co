import { DentistScheduleManagerV131 } from '../features/dentists/DentistScheduleManagerV131'
import { DentistsBranchAssignmentsV126 } from './DentistsBranchAssignmentsV126'

export function DentistsScheduleWorkspaceV131() {
  return <div className="dentist-v131-authoritative">
    <DentistScheduleManagerV131 />
    <DentistsBranchAssignmentsV126 />
  </div>
}
