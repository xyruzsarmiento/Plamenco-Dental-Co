import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export function UnauthorizedPage() {
  return (
    <section className="page-stack">
      <div className="access-panel" role="status" aria-labelledby="unauthorized-title">
        <div className="brand-mark" aria-hidden="true">
          <ShieldAlert size={22} />
        </div>
        <div>
          <p className="eyebrow">Access restricted</p>
          <h2 id="unauthorized-title">You do not have permission to open this area</h2>
          <p>Your account is signed in, but this workspace requires a role or permission that has not been assigned to you.</p>
        </div>
        <Link to="/app">
          <Button variant="secondary" icon={<ArrowLeft size={16} />}>Return to dashboard</Button>
        </Link>
      </div>
    </section>
  )
}
