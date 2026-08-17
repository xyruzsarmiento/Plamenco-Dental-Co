import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export function NotFoundPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="muted">The route you opened does not exist in the clinic workspace.</p>
        <Link to="/">
          <Button>Return to dashboard</Button>
        </Link>
      </section>
    </main>
  )
}
