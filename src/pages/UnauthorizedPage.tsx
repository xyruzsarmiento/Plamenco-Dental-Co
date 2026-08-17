import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '../components/ui/Button'

export function UnauthorizedPage() {
  return (
    <section className="page-stack">
      <div className="access-panel">
        <div className="brand-mark" aria-hidden="true">
          <ShieldAlert size={22} />
        </div>
        <div>
          <p className="eyebrow">Unauthorized</p>
          <h2>Admin access required</h2>
          <p>
            This area contains administrative controls. Your account does not have permission
            to open it.
          </p>
        </div>
        <Link to="/">
          <Button variant="secondary">Return to dashboard</Button>
        </Link>
      </div>
    </section>
  )
}
