import { ArrowLeft, CalendarCheck2, ShieldCheck, Sparkles } from 'lucide-react'
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
        <aside className="auth-visual" aria-label="Plamenco Dental Co clinic introduction">
          <div className="auth-visual-media" aria-hidden="true">
            <img src="/assets/images/landing.png" alt="" />
          </div>
          <div className="auth-visual-overlay" aria-hidden="true" />
          <div className="auth-visual-inner">
            <Link to="/" className="auth-brand" aria-label="Plamenco Dental Co home">
              <img src="/assets/images/logo.png" alt="" className="auth-brand-logo" />
              <span>
                <strong>Plamenco Dental Co.</strong>
                <small>Pulilan & Plaridel, Bulacan</small>
              </span>
            </Link>

            <div className="auth-visual-copy">
              <span className="auth-kicker"><Sparkles size={15} /> Modern dental care</span>
              <h2>Your care, appointments, and clinic access in one secure place.</h2>
              <p>Use your Plamenco account to manage your dental care journey with clear, secure access to the clinic experience.</p>
            </div>

            <div className="auth-feature-list" aria-label="Portal highlights">
              <div><ShieldCheck size={17} /><span>Secure account access</span></div>
              <div><CalendarCheck2 size={17} /><span>Appointment management</span></div>
            </div>
          </div>
        </aside>

        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="auth-panel-inner">
            <Link to="/" className="auth-back-link" aria-label="Back to website">
              <ArrowLeft size={16} />
              <span>Back to website</span>
            </Link>

            <div className="auth-mobile-brand" aria-hidden="true">
              <img src="/assets/images/logo.png" alt="" />
              <span>Plamenco Dental Co.</span>
            </div>

            <div className="auth-panel-header">
              <span className="auth-kicker">{eyebrow}</span>
              <h1 id="auth-title">{title}</h1>
              <p>{description}</p>
            </div>

            {children}

            {footer ? <div className="auth-footer">{footer}</div> : null}
          </div>
        </section>
      </div>
    </main>
  )
}
