import { ShieldCheck } from 'lucide-react'
import { SystemAdministrationPage } from './SystemAdministrationPage'

export function SystemAdministrationPageV29() {
  return (
    <div className="system-admin-v29">
      <div className="system-admin-v29-context" aria-hidden="true">
        <div className="system-admin-v29-context-icon"><ShieldCheck size={18} /></div>
        <div>
          <span>Platform governance workspace</span>
          <strong>Super Admin control center</strong>
        </div>
      </div>
      <SystemAdministrationPage />
    </div>
  )
}
