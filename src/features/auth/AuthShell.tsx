import { ArrowLeft, ArrowRight, ShieldCheck, Sparkles, Stethoscope } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type AuthShellProps = {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthShell({ eyebrow, title, description, children, footer }: AuthShellProps) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <aside className="auth-visual" aria-label="Plamenco Dental Co clinic preview">
          <div className="auth-visual-inner">
            <div className="auth-brand" aria-label="Plamenco Dental Co brand">
              <span className="brand-mark auth-brand-mark">P</span>
              <div>
                <strong>PLAMENCO</strong>
                <small>DENTAL CO.</small>
              </div>
            </div>

            <div className="auth-visual-copy">
              <span className="eyebrow auth-eyebrow">
                <Sparkles size={14} /> Premium dental care
              </span>
              <h2>Confident smiles begin with thoughtful dentistry.</h2>
              <p>
                Personalized treatment, modern preventive care, and a refined clinic experience built around comfort and trust.
              </p>
            </div>

            <div className="auth-feature-list" aria-label="Clinic highlights">
              <div>
                <ShieldCheck size={16} />
                <span>Comfort-first care</span>
              </div>
              <div>
                <Stethoscope size={16} />
                <span>Precision-led treatments</span>
              </div>
              <div>
                <ArrowRight size={16} />
                <span>Modern restorative dentistry</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="auth-panel" aria-labelledby="auth-title">
          <Link to="/" className="auth-back-link" aria-label="Back to website">
            <ArrowLeft size={16} />
            <span>Back to website</span>
          </Link>

          <div className="auth-panel-header">
            <span className="eyebrow">{eyebrow}</span>
            <h1 id="auth-title">{title}</h1>
            <p>{description}</p>
          </div>

          {children}

          {footer ? <div className="auth-footer">{footer}</div> : null}
        </section>
      </div>
    </main>
  )
}
