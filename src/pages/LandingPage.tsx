import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  HeartHandshake,
  MapPin,
  Menu,
  Phone,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredServices } from '../features/services/serviceStore'
import '../styles/landing.css'

const patientJourney = [
  {
    title: 'Choose your care',
    copy: 'Review the clinic’s currently configured service catalog and select the treatment you need.',
  },
  {
    title: 'Request an appointment',
    copy: 'Sign in to your patient account, choose a branch, dentist preference, date, and available time.',
  },
  {
    title: 'Clinic confirmation',
    copy: 'Your request stays visible in the portal while the clinic reviews and confirms the appointment.',
  },
  {
    title: 'Stay connected',
    copy: 'Use your patient portal to review appointments, forms, billing records, documents, and clinic updates.',
  },
]

const faqItems = [
  {
    question: 'How do I book an appointment?',
    answer: 'Select Book Appointment. If you are not signed in, you will be taken to patient login first. After authentication, booking continues inside your patient portal.',
  },
  {
    question: 'Can I choose a branch and dentist?',
    answer: 'Yes. The booking flow uses the clinic’s configured branches, dentist assignments, schedules, and real appointment availability.',
  },
  {
    question: 'Does submitting a booking mean it is already confirmed?',
    answer: 'No. A booking request and a confirmed appointment are separate states. The clinic reviews the request and your patient portal shows the current appointment status.',
  },
  {
    question: 'Where can I see my forms, payments, and appointment history?',
    answer: 'Signed-in patients can access their own records from the secure patient portal, subject to the clinic’s configured workflows and available records.',
  },
]

function formatTime(value: string) {
  const [hourValue, minuteValue] = value.split(':').map(Number)
  const hour = Number.isFinite(hourValue) ? hourValue : 9
  const minute = Number.isFinite(minuteValue) ? minuteValue : 0
  const date = new Date(2000, 0, 1, hour, minute)
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0)
  const [scrolled, setScrolled] = useState(false)

  const services = useMemo(() => getStoredServices().filter((service) => service.status === 'active').slice(0, 6), [])
  const branches = useMemo(() => getStoredBranches().filter((branch) => branch.status === 'active'), [])
  const providers = useMemo(() => getStoredProviders().filter((provider) => provider.status === 'active').slice(0, 4), [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="lp47b">
      <header className={`lp47b-header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="lp47b-nav-shell">
          <Link to="/" className="lp47b-brand" aria-label="Plamenco Dental Co. home">
            <img src="/assets/images/logo.png" alt="Plamenco Dental Co." />
            <span><strong>Plamenco</strong><small>Dental Co.</small></span>
          </Link>

          <nav className="lp47b-nav-links" aria-label="Public navigation">
            <a href="#about">About</a>
            <a href="#services">Services</a>
            <a href="#team">Dentists</a>
            <a href="#branches">Branches</a>
            <a href="#faq">FAQ</a>
            <a href="#contact">Contact</a>
          </nav>

          <div className="lp47b-nav-actions">
            <Link to="/login" className="lp47b-login-link">Patient Login</Link>
            <Link to="/book" className="lp47b-primary-cta"><CalendarDays size={17} /> Book Appointment</Link>
            <button
              type="button"
              className="lp47b-menu-button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="lp47b-mobile-menu">
            {['about', 'services', 'team', 'branches', 'faq', 'contact'].map((section) => (
              <a key={section} href={`#${section}`} onClick={() => setMenuOpen(false)}>{section === 'team' ? 'Dentists' : section.charAt(0).toUpperCase() + section.slice(1)}</a>
            ))}
            <Link to="/login" onClick={() => setMenuOpen(false)}>Patient Login</Link>
            <Link to="/book" className="lp47b-primary-cta" onClick={() => setMenuOpen(false)}><CalendarDays size={17} /> Book Appointment</Link>
          </div>
        )}
      </header>

      <main>
        <section className="lp47b-hero" id="home">
          <div className="lp47b-container lp47b-hero-grid">
            <div className="lp47b-hero-copy">
              <span className="lp47b-kicker"><span className="lp47b-kicker-dot" /> Dental care in Bulacan</span>
              <h1>Thoughtful dental care, built around your comfort.</h1>
              <p>Plamenco Dental Co. serves patients across Pulilan and Plaridel with a modern clinic experience, clear appointment coordination, and a secure patient portal.</p>
              <div className="lp47b-hero-actions">
                <Link to="/book" className="lp47b-primary-cta lp47b-primary-cta-lg"><CalendarDays size={18} /> Book Appointment</Link>
                <a href="#services" className="lp47b-secondary-cta">Explore services <ArrowRight size={17} /></a>
              </div>
              <div className="lp47b-trust-row" aria-label="Clinic experience highlights">
                <span><ShieldCheck size={17} /> Secure patient portal</span>
                <span><MapPin size={17} /> Pulilan & Plaridel</span>
                <span><HeartHandshake size={17} /> Patient-centered flow</span>
              </div>
            </div>

            <div className="lp47b-hero-visual" aria-label="Plamenco Dental Co. clinic visual">
              <div className="lp47b-hero-image-wrap">
                <img src="/assets/images/landing.png" alt="Plamenco Dental Co. clinic" />
              </div>
              <div className="lp47b-floating-card lp47b-floating-card-main">
                <span className="lp47b-floating-icon"><CalendarDays size={19} /></span>
                <div><small>Online booking</small><strong>Choose real available times</strong></div>
              </div>
              <div className="lp47b-floating-card lp47b-floating-card-alt">
                <span className="lp47b-floating-icon soft"><ShieldCheck size={19} /></span>
                <div><small>Patient portal</small><strong>Your records in one place</strong></div>
              </div>
            </div>
          </div>
        </section>

        <section className="lp47b-intro" id="about">
          <div className="lp47b-container lp47b-intro-grid">
            <div>
              <span className="lp47b-section-label">About Plamenco</span>
              <h2>A calmer, clearer clinic experience from booking to follow-up.</h2>
            </div>
            <div className="lp47b-intro-copy">
              <p>Plamenco Dental Co. combines in-clinic dental care with a connected patient experience. Patients can request appointments, receive clinic updates, complete assigned forms, and review available records through the portal.</p>
              <div className="lp47b-feature-list">
                <span><Check size={17} /> Branch-aware scheduling</span>
                <span><Check size={17} /> Secure patient access</span>
                <span><Check size={17} /> Clear appointment status</span>
              </div>
            </div>
          </div>
        </section>

        <section className="lp47b-section" id="services">
          <div className="lp47b-container">
            <div className="lp47b-section-heading">
              <div><span className="lp47b-section-label">Services</span><h2>Care configured by the clinic.</h2></div>
              <p>The services below come from the clinic’s active service catalog. Pricing and duration shown during booking use the configured service record.</p>
            </div>

            {services.length > 0 ? (
              <div className="lp47b-service-grid">
                {services.map((service, index) => (
                  <article className="lp47b-service-card" key={service.id}>
                    <div className="lp47b-card-topline"><span>{String(index + 1).padStart(2, '0')}</span><Stethoscope size={19} /></div>
                    <h3>{service.name}</h3>
                    <p>{service.description || 'Contact the clinic or continue to booking for service details.'}</p>
                    <div className="lp47b-service-meta"><span><Clock3 size={15} /> {service.duration} min</span><span>{service.category}</span></div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="lp47b-empty-public">The clinic service catalog is being prepared. Please contact the clinic or check again later.</div>
            )}
          </div>
        </section>

        <section className="lp47b-section lp47b-section-soft">
          <div className="lp47b-container">
            <div className="lp47b-section-heading compact">
              <div><span className="lp47b-section-label">Why choose us</span><h2>Designed to make dental visits easier to manage.</h2></div>
            </div>
            <div className="lp47b-benefit-grid">
              <article><span><ShieldCheck size={21} /></span><h3>Private by design</h3><p>Patient portal access is authenticated and scoped to the signed-in patient’s own records.</p></article>
              <article><span><CalendarDays size={21} /></span><h3>Connected scheduling</h3><p>Booking uses configured branches, dentists, schedules, service duration, and existing appointments.</p></article>
              <article><span><Sparkles size={21} /></span><h3>Clear experience</h3><p>Patients can follow appointment status and access available clinic records from one portal.</p></article>
            </div>
          </div>
        </section>

        <section className="lp47b-section" id="team">
          <div className="lp47b-container">
            <div className="lp47b-section-heading">
              <div><span className="lp47b-section-label">Dentists</span><h2>Meet the active care team.</h2></div>
              <p>Only active dentist profiles currently configured by the clinic are shown here.</p>
            </div>

            {providers.length > 0 ? (
              <div className="lp47b-provider-grid">
                {providers.map((provider) => (
                  <article className="lp47b-provider-card" key={provider.id}>
                    <div className="lp47b-provider-photo">
                      {provider.photoUrl ? <img src={provider.photoUrl} alt={provider.displayName} /> : <span>{provider.displayName.charAt(0) || 'D'}</span>}
                    </div>
                    <div><span className="lp47b-provider-role">{provider.role === 'associate_dentist' ? 'Associate Dentist' : 'Dentist'}</span><h3>{provider.displayName}</h3><p>{provider.specialization || provider.bio || 'Dental care provider at Plamenco Dental Co.'}</p></div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="lp47b-empty-public">Dentist profiles are not currently published in the clinic configuration.</div>
            )}
          </div>
        </section>

        <section className="lp47b-section lp47b-section-soft" id="branches">
          <div className="lp47b-container">
            <div className="lp47b-section-heading">
              <div><span className="lp47b-section-label">Branches</span><h2>Choose the clinic location that works for you.</h2></div>
              <p>Branch information below comes from the clinic’s configured branch records.</p>
            </div>
            <div className="lp47b-branch-grid">
              {branches.map((branch) => (
                <article className="lp47b-branch-card" key={branch.id}>
                  <div className="lp47b-branch-icon"><MapPin size={22} /></div>
                  <div><span className="lp47b-provider-role">{branch.city || branch.code}</span><h3>{branch.name}</h3><p>{branch.address || `${branch.city}, ${branch.province}`}</p></div>
                  <div className="lp47b-branch-meta">
                    <span><Clock3 size={16} /> {formatTime(branch.openingTime)} – {formatTime(branch.closingTime)}</span>
                    {branch.phone && <a href={`tel:${branch.phone}`}><Phone size={16} /> {branch.phone}</a>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp47b-section">
          <div className="lp47b-container">
            <div className="lp47b-section-heading centered"><div><span className="lp47b-section-label">Patient journey</span><h2>From appointment request to clinic follow-up.</h2></div></div>
            <div className="lp47b-journey-grid">
              {patientJourney.map((step, index) => (
                <article key={step.title}><span className="lp47b-step-number">{String(index + 1).padStart(2, '0')}</span><h3>{step.title}</h3><p>{step.copy}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp47b-section lp47b-faq-section" id="faq">
          <div className="lp47b-container lp47b-faq-grid">
            <div className="lp47b-faq-intro"><span className="lp47b-section-label">Frequently asked</span><h2>What to know before booking.</h2><p>These answers describe the current patient booking and portal workflow.</p></div>
            <div className="lp47b-faq-list">
              {faqItems.map((item, index) => {
                const open = expandedFaq === index
                return (
                  <article className={`lp47b-faq-item ${open ? 'is-open' : ''}`} key={item.question}>
                    <button type="button" aria-expanded={open} onClick={() => setExpandedFaq(open ? null : index)}><span>{item.question}</span><ChevronDown size={19} /></button>
                    {open && <p>{item.answer}</p>}
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="lp47b-contact" id="contact">
          <div className="lp47b-container lp47b-contact-card">
            <div><span className="lp47b-section-label light">Ready when you are</span><h2>Start with an appointment request.</h2><p>Sign in to your patient account to choose a service, branch, dentist preference, date, and legitimate available time.</p></div>
            <div className="lp47b-contact-actions"><Link to="/book" className="lp47b-contact-primary"><CalendarDays size={18} /> Book Appointment</Link><Link to="/login" className="lp47b-contact-secondary">Patient Login <ArrowRight size={17} /></Link></div>
          </div>
        </section>
      </main>

      <footer className="lp47b-footer">
        <div className="lp47b-container lp47b-footer-grid">
          <div className="lp47b-footer-brand"><Link to="/" className="lp47b-brand"><img src="/assets/images/logo.png" alt="Plamenco Dental Co." /><span><strong>Plamenco</strong><small>Dental Co.</small></span></Link><p>Dental care and connected patient services across Pulilan and Plaridel, Bulacan.</p></div>
          <div><strong>Clinic</strong><a href="#about">About</a><a href="#services">Services</a><a href="#team">Dentists</a><a href="#branches">Branches</a></div>
          <div><strong>Patients</strong><Link to="/book">Book Appointment</Link><Link to="/login">Patient Login</Link><Link to="/register">Create Account</Link><a href="#faq">FAQ</a></div>
          <div><strong>Locations</strong>{branches.map((branch) => <span key={branch.id}>{branch.city || branch.name}{branch.province ? `, ${branch.province}` : ''}</span>)}</div>
        </div>
        <div className="lp47b-container lp47b-footer-bottom"><span>© {new Date().getFullYear()} Plamenco Dental Co.</span><span>Patient records and portal access require authentication.</span></div>
      </footer>
    </div>
  )
}
