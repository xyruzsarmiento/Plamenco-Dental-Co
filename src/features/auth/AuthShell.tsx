import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react'
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
    <main className="auth-page auth-experience auth-rebuilt">
      <header className="auth-rebuilt-header">
        <Link to="/" className="auth-rebuilt-brand" aria-label="Plamenco Dental Co home">
          <img src="/assets/images/logo.png" alt="" />
          <span><strong>plamenco<span>.</span></strong><small>DENTAL CO.</small></span>
        </Link>
        <Link to="/" className="auth-rebuilt-home"><ArrowLeft size={15} aria-hidden="true" /> <span>Back to website</span></Link>
      </header>

      <div className="auth-rebuilt-layout">
        <section className="auth-rebuilt-intro" aria-label="Patient portal introduction">
          <div className="auth-rebuilt-orbit auth-rebuilt-orbit-one" aria-hidden="true" />
          <div className="auth-rebuilt-orbit auth-rebuilt-orbit-two" aria-hidden="true" />
          <span className="auth-rebuilt-overline"><span className="auth-rebuilt-status-dot" /> YOUR CARE, CONNECTED</span>
          <h2>Good care starts with feeling <em>looked after.</em></h2>
          <p>A calmer, simpler way to stay connected with your dental care—before, during, and after your visit.</p>
          <div className="auth-rebuilt-promise">
            <span className="auth-rebuilt-promise-icon"><ShieldCheck size={19} aria-hidden="true" /></span>
            <span><strong>Your information stays private</strong><small>Secure access to your patient account</small></span>
            <CheckCircle2 className="auth-rebuilt-promise-check" size={17} aria-hidden="true" />
          </div>
          <div className="auth-rebuilt-decoration" aria-hidden="true">
            <div className="auth-rebuilt-tooth-mark">p<span>+</span></div>
            <div className="auth-rebuilt-decoration-line" />
            <span>CARE THAT FITS YOUR LIFE</span>
          </div>
        </section>

        <section className="auth-rebuilt-main" aria-labelledby="auth-title">
          <div className="auth-rebuilt-mobile-brand">
            <img src="/assets/images/logo.png" alt="" />
            <span>plamenco<span>.</span></span>
          </div>
          <div className="auth-rebuilt-card">
            <div className="auth-panel-header">
              <span className="auth-rebuilt-eyebrow">{eyebrow}</span>
              <h1 id="auth-title">{title}</h1>
              <p>{description}</p>
            </div>
            {children}
            {footer ? <div className="auth-footer">{footer}</div> : null}
          </div>
          <footer className="auth-rebuilt-footnote">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>Private patient access</span><i aria-hidden="true">·</i><span>Plamenco Dental Co.</span>
          </footer>
        </section>
      </div>
      <footer className="auth-rebuilt-global-footer"><span>© {new Date().getFullYear()} Plamenco Dental Co.</span><span>Patient portal</span><Link to="/">Visit our website <ArrowRight size={13} aria-hidden="true" /></Link></footer>
    </main>
  )
}
