import { Home, SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export function NotFoundPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="not-found-title">
        <div className="brand-mark" aria-hidden="true">
          <SearchX size={22} />
        </div>
        <p className="eyebrow">404</p>
        <h1 id="not-found-title">Page not found</h1>
        <p className="muted">The page may have moved, the address may be incorrect, or your account may not use this route.</p>
        <Link to="/">
          <Button icon={<Home size={16} />}>Return home</Button>
        </Link>
      </section>
    </main>
  )
}
