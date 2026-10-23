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
    <main className="auth-page auth-experience">
      <div className="auth-shell">
        <aside className="auth-visual" aria-label="Plamenco Dental Co">
          <div className="auth-visual-media" aria-hidden="true">
            <img src="/assets/images/landing.png" alt="" />
          </div>
          <div className="auth-visual-overlay" aria-hidden="true" />
          <div className="auth-visual-inner">
            <Link to="/" className="auth-brand" aria-label="Plamenco Dental Co home">
              <img src="/assets/images/logo.png" alt="" className="auth-brand-logo" />
              <span>
                <strong>Plamenco Dental Co.</strong>
                <small>Pulilan &amp; Plaridel, Bulacan</small>
              </span>
            </Link>

            <div className="auth-visual-copy">
              <span className="auth-kicker"><Sparkles size={14} aria-hidden="true" /> Patient access</span>
              <h2>Thoughtful dental care, made easier to manage.</h2>
              <p>Appointments, care information, and your clinic account—together in one secure place.</p>
            </div>

            <div className="auth-feature-list" aria-label="Portal benefits">
              <div><ShieldCheck size={17} aria-hidden="true" /><span>Private, secure access</span></div>
              <div><CalendarCheck2 size={17} aria-hidden="true" /><span>Appointments in one place</span></div>
            </div>
            <p className="auth-visual-footnote">A more connected patient experience from Plamenco Dental Co.</p>
          </div>
        </aside>

        <section className="auth-panel" aria-labelledby="auth-title">
          <div className="auth-panel-inner">
            <Link to="/" className="auth-back-link" aria-label="Back to website">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Back to website</span>
            </Link>

            <Link to="/" className="auth-mobile-brand" aria-label="Plamenco Dental Co home">
              <img src="/assets/images/logo.png" alt="" />
              <span>Plamenco Dental Co.</span>
            </Link>

            <div className="auth-panel-header">
              <span className="auth-kicker">{eyebrow}</span>
              <h1 id="auth-title">{title}</h1>
              <p>{description}</p>
            </div>

            {children}

            {footer ? <div className="auth-footer">{footer}</div> : null}
            <p className="auth-legal-note">By continuing, you agree to use your account responsibly and keep your sign-in details private.</p>
          </div>
        </section>
      </div>
    </main>
  )
}
