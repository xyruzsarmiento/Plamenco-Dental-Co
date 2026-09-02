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
  UsersRound,
  X,
} from 'lucide-react'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredServices } from '../features/services/serviceStore'
import { INTERNAL_AVATAR_BUCKET } from '../features/profiles/profileStore'
import { supabase } from '../lib/supabase'
import '../styles/landing-premium-v2.css'

const patientJourney = [
  ['01', 'Choose your care', 'Review the clinic service catalog and select the care you need.'],
  ['02', 'Request your visit', 'Choose a branch, preferred dentist, date and legitimate available time.'],
  ['03', 'Clinic confirmation', 'Your request stays visible while the clinic reviews and confirms it.'],
  ['04', 'Stay connected', 'Use the patient portal for appointments, records, payments, forms and follow-ups.'],
]

const faqItems = [
  {
    question: 'How do I book an appointment?',
    answer: 'Select Book Appointment. If you are not signed in, you will be taken to patient login first. Booking then continues inside your secure patient portal.',
  },
  {
    question: 'Can I choose a branch and dentist?',
    answer: 'Yes. Booking uses the clinic’s configured branches, dentist assignments, schedules and real appointment availability.',
  },
  {
    question: 'Does submitting a booking mean it is already confirmed?',
    answer: 'No. A booking request and a confirmed appointment are separate states. Your portal shows the current status while the clinic reviews the request.',
  },
  {
    question: 'Where can I see my records, payments and appointment history?',
    answer: 'Signed-in patients can access available patient-facing records through the secure portal.',
  },
]

type PublicTeamMember = {
  id: string
  displayName: string
  role: string
  specialization: string
  bio: string
  branchNames: string[]
  photoUrl: string
  photoPath: string
}

function formatTime(value: string) {
  const [hourValue, minuteValue] = value.split(':').map(Number)
  const date = new Date(2000, 0, 1, Number.isFinite(hourValue) ? hourValue : 9, Number.isFinite(minuteValue) ? minuteValue : 0)
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(date)
}

export function LandingPagePremiumV2() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0)
  const [scrolled, setScrolled] = useState(false)
  const [publicTeam, setPublicTeam] = useState<PublicTeamMember[]>(() =>
    getStoredProviders()
      .filter((item) => item.status === 'active')
      .slice(0, 5)
      .map((provider) => ({
        id: provider.id,
        displayName: provider.displayName,
        role: provider.role,
        specialization: provider.specialization,
        bio: provider.bio,
        branchNames: [],
        photoUrl: /^(https?:|data:|blob:)/i.test(provider.photoUrl) ? provider.photoUrl : '',
        photoPath: provider.photoUrl,
      })),
  )

  const services = useMemo(() => getStoredServices().filter((item) => item.status === 'active').slice(0, 6), [])
  const branches = useMemo(() => getStoredBranches().filter((item) => item.status === 'active'), [])
  const leadProvider = publicTeam.find((provider) => provider.role === 'dentist' || provider.role === 'clinic_leadership') ?? publicTeam[0]
  const supportingProviders = publicTeam.filter((provider) => provider.id !== leadProvider?.id)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    let active = true
    async function loadPublicTeam() {
      const client = supabase
      if (!client) return
      const { data, error } = await client.rpc('get_public_clinic_team_v133')
      if (error || !Array.isArray(data)) {
        if (import.meta.env.DEV && error) console.warn('[landing public team]', error)
        return
      }
      const rows = await Promise.all(data.map(async (row: Record<string, unknown>): Promise<PublicTeamMember> => {
        const photoUrl = String(row.photo_url ?? '')
        const photoPath = String(row.photo_path ?? '')
        let resolvedPhoto = photoUrl
        if (!resolvedPhoto && photoPath && !/^(https?:|data:|blob:)/i.test(photoPath)) {
          const signed = await client.storage.from(INTERNAL_AVATAR_BUCKET).createSignedUrl(photoPath, 60 * 60)
          resolvedPhoto = signed.data?.signedUrl ?? ''
        }
        return {
          id: String(row.id ?? ''),
          displayName: String(row.display_name ?? ''),
          role: String(row.role ?? ''),
          specialization: String(row.specialization ?? ''),
          bio: String(row.bio ?? ''),
          branchNames: Array.isArray(row.branch_names) ? row.branch_names.map(String) : [],
          photoUrl: resolvedPhoto,
          photoPath,
        }
      }))
      if (active && rows.length) setPublicTeam(rows.filter((row) => row.displayName))
    }
    void loadPublicTeam()
    return () => { active = false }
  }, [])

  return (
    <div className="lpv2">
      <header className={`lpv2-header ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="lpv2-nav-shell">
          <Link to="/" className="lpv2-brand" aria-label="Plamenco Dental Co. home">
            <img src="/assets/images/logo.png" alt="Plamenco Dental Co." />
            <span><strong>Plamenco</strong><small>Dental Co.</small></span>
          </Link>

          <nav className="lpv2-nav-links" aria-label="Public navigation">
            <a href="#about">About</a><a href="#services">Services</a><a href="#team">Care Team</a><a href="#branches">Branches</a><a href="#faq">FAQ</a><a href="#contact">Contact</a>
          </nav>

          <div className="lpv2-nav-actions">
            <Link to="/login" className="lpv2-login">Patient Login</Link>
            <Link to="/book" className="lpv2-btn primary"><CalendarDays size={17}/> Book Appointment</Link>
            <button type="button" className="lpv2-menu" onClick={() => setMenuOpen((value) => !value)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>
              {menuOpen ? <X size={20}/> : <Menu size={20}/>} 
            </button>
          </div>
        </div>
        {menuOpen && <div className="lpv2-mobile-menu">
          {['about','services','team','branches','faq','contact'].map((item) => <a key={item} href={`#${item}`} onClick={() => setMenuOpen(false)}>{item === 'team' ? 'Care Team' : item[0].toUpperCase()+item.slice(1)}</a>)}
          <Link to="/login" onClick={() => setMenuOpen(false)}>Patient Login</Link>
          <Link to="/book" className="lpv2-btn primary" onClick={() => setMenuOpen(false)}><CalendarDays size={17}/> Book Appointment</Link>
        </div>}
      </header>

      <main>
        <section className="lpv2-hero" id="home">
          <div className="lpv2-container lpv2-hero-grid">
            <div className="lpv2-hero-copy">
              <span className="lpv2-eyebrow">Dental care in Bulacan</span>
              <h1>Modern dental care that feels personal.</h1>
              <p>Thoughtful care, clearer scheduling and a connected patient experience across Plamenco Dental Co. branches in Pulilan and Plaridel.</p>
              <div className="lpv2-hero-actions">
                <Link to="/book" className="lpv2-btn primary large"><CalendarDays size={18}/> Request an appointment</Link>
                <a href="#services" className="lpv2-btn secondary large">Explore services <ArrowRight size={17}/></a>
              </div>
              <div className="lpv2-trust-strip">
                <span><ShieldCheck size={16}/> Secure patient portal</span>
                <span><MapPin size={16}/> Pulilan & Plaridel</span>
                <span><HeartHandshake size={16}/> Patient-centered care</span>
              </div>
            </div>

            <div className="lpv2-hero-media">
              <figure className="lpv2-hero-photo"><img src="/assets/images/landing.png" alt="Plamenco Dental Co. clinic interior" /></figure>
              <figure className="lpv2-hero-inset"><img src="/assets/images/clinic.png" alt="Plamenco Dental Co. treatment area" /></figure>
              <div className="lpv2-hero-note top"><ShieldCheck size={18}/><span><small>Patient portal</small><strong>Your care information in one place</strong></span></div>
              <div className="lpv2-hero-note bottom"><CalendarDays size={18}/><span><small>Online booking</small><strong>Choose real available times</strong></span></div>
            </div>
          </div>
        </section>

        <section className="lpv2-about" id="about">
          <div className="lpv2-container lpv2-about-grid">
            <div><span className="lpv2-section-label">About Plamenco</span><h2>Care that stays coordinated before, during and after your visit.</h2></div>
            <div><p>From appointment requests to follow-ups, Plamenco Dental Co. combines in-clinic care with a patient portal designed to keep the important parts of your dental journey easier to manage.</p><div className="lpv2-checks"><span><Check size={16}/> Branch-aware scheduling</span><span><Check size={16}/> Secure patient access</span><span><Check size={16}/> Clear appointment status</span></div></div>
          </div>
        </section>

        <section className="lpv2-section" id="services">
          <div className="lpv2-container">
            <div className="lpv2-heading"><div><span className="lpv2-section-label">Services</span><h2>Dental care built around what you need next.</h2></div><p>Browse active services configured by the clinic, then continue to booking when you are ready.</p></div>
            {services.length ? <div className="lpv2-service-grid">{services.map((service, index) => <article key={service.id} className="lpv2-service-card"><header><span>{String(index + 1).padStart(2,'0')}</span><Stethoscope size={18}/></header><h3>{service.name}</h3><p>{service.description || 'Contact the clinic or continue to booking for service details.'}</p><footer><span><Clock3 size={14}/>{service.duration} min</span><span>{service.category}</span></footer></article>)}</div> : <div className="lpv2-empty">The clinic service catalog is being prepared.</div>}
          </div>
        </section>

        <section className="lpv2-section lpv2-soft">
          <div className="lpv2-container lpv2-benefits"><article><ShieldCheck size={21}/><h3>Private by design</h3><p>Authenticated patient access keeps portal records scoped to the signed-in patient.</p></article><article><CalendarDays size={21}/><h3>Connected scheduling</h3><p>Booking works with branches, dentist schedules, service duration and existing appointments.</p></article><article><Sparkles size={21}/><h3>Less uncertainty</h3><p>Appointment status, follow-ups and available records stay visible from one patient experience.</p></article></div>
        </section>

        <section className="lpv2-team" id="team">
          <div className="lpv2-container">
            <div className="lpv2-heading team"><div><span className="lpv2-section-label">Care team</span><h2>Meet the people behind your care.</h2></div><p>Featuring clinic leadership, active dentists and the patient-facing staff who help coordinate your visit.</p></div>
            <div className="lpv2-team-layout">
              <article className="lpv2-team-feature">
                <div className="lpv2-team-photo">
                  {leadProvider?.photoUrl
                    ? <img src={leadProvider.photoUrl} alt={leadProvider.displayName}/>
                    : <div className="lpv2-team-initials">{leadProvider?.displayName ? leadProvider.displayName.split(/\s+/).slice(0,2).map((part) => part.charAt(0)).join('') : 'P'}</div>}
                </div>
                <div className="lpv2-team-feature-copy">
                  <span>{leadProvider?.role === 'clinic_leadership' ? 'Clinic leadership' : leadProvider?.role === 'dentist' ? 'Lead Dentist' : 'Featured Dentist'}</span>
                  <h3>{leadProvider?.displayName ?? 'Plamenco Dental Co. Clinical Team'}</h3>
                  <p>{leadProvider?.specialization || leadProvider?.bio || 'Patient-focused dental care supported by a coordinated clinic team.'}</p>
                  <small><Stethoscope size={15}/> Clinical care & treatment planning</small>
                </div>
              </article>

              <div className="lpv2-team-side">
                {supportingProviders.slice(0,2).map((provider) => (
                  <article className="lpv2-person-card" key={provider.id}>
                    <div>{provider.photoUrl ? <img src={provider.photoUrl} alt={provider.displayName}/> : <span>{provider.displayName.split(/\s+/).slice(0,2).map((part) => part.charAt(0)).join('')}</span>}</div>
                    <section><span>{provider.role === 'associate_dentist' ? 'Associate Dentist' : provider.role === 'clinic_leadership' ? 'Clinic leadership' : 'Dentist'}</span><h3>{provider.displayName}</h3><p>{provider.specialization || provider.bio || 'Dental care provider at Plamenco Dental Co.'}</p></section>
                  </article>
                ))}
                <article className="lpv2-staff-card"><img src="/assets/images/cashier.jpg" alt="Plamenco Dental Co. clinic staff"/><div><span>Clinic staff</span><h3>Patient coordination team</h3><p>Front-desk coordination, patient support and clinic operations.</p><small><UsersRound size={15}/> Here to help before and after your visit</small></div></article>
              </div>
            </div>
          </div>
        </section>

        <section className="lpv2-section lpv2-soft" id="branches">
          <div className="lpv2-container"><div className="lpv2-heading"><div><span className="lpv2-section-label">Branches</span><h2>Choose the location that works for you.</h2></div><p>Clinic hours and branch details use the active records configured by Plamenco Dental Co.</p></div><div className="lpv2-branch-grid">{branches.map((branch) => <article key={branch.id}><span className="lpv2-branch-icon"><MapPin size={20}/></span><section><small>{branch.city || branch.code}</small><h3>{branch.name}</h3><p>{branch.address || `${branch.city}, ${branch.province}`}</p></section><footer><span><Clock3 size={15}/>{formatTime(branch.openingTime)} – {formatTime(branch.closingTime)}</span>{branch.phone && <a href={`tel:${branch.phone}`}><Phone size={15}/>{branch.phone}</a>}</footer></article>)}</div></div>
        </section>

        <section className="lpv2-section">
          <div className="lpv2-container"><div className="lpv2-heading centered"><div><span className="lpv2-section-label">Patient journey</span><h2>A clearer path from booking to follow-up.</h2></div></div><div className="lpv2-journey">{patientJourney.map(([number,title,copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></div>
        </section>

        <section className="lpv2-faq" id="faq">
          <div className="lpv2-container lpv2-faq-grid"><div><span className="lpv2-section-label">Frequently asked</span><h2>What to know before booking.</h2><p>Clear answers about the current appointment and patient portal workflow.</p></div><div className="lpv2-faq-list">{faqItems.map((item,index) => { const open = expandedFaq === index; return <article key={item.question} className={open ? 'is-open' : ''}><button type="button" onClick={() => setExpandedFaq(open ? null : index)} aria-expanded={open}><span>{item.question}</span><ChevronDown size={18}/></button>{open && <p>{item.answer}</p>}</article> })}</div></div>
        </section>

        <section className="lpv2-cta" id="contact">
          <div className="lpv2-container lpv2-cta-card">
            <div className="lpv2-cta-copy"><span className="lpv2-section-label">Ready when you are</span><h2>Your next dental visit can start here.</h2><p>Sign in to your patient account to choose a service, branch, dentist preference, date and legitimate available time.</p><div className="lpv2-cta-points"><span><Check size={15}/> Real clinic availability</span><span><Check size={15}/> Secure patient account</span><span><Check size={15}/> Clear request status</span></div></div>
            <div className="lpv2-cta-actions"><Link to="/book" className="lpv2-btn primary large"><CalendarDays size={18}/> Book Appointment</Link><Link to="/login" className="lpv2-btn secondary large">Patient Login <ArrowRight size={17}/></Link><small>Already a patient? Sign in and continue from your portal.</small></div>
          </div>
        </section>
      </main>

      <footer className="lpv2-footer">
        <div className="lpv2-container lpv2-footer-top">
          <div className="lpv2-footer-brand"><Link to="/" className="lpv2-brand"><img src="/assets/images/logo.png" alt="Plamenco Dental Co."/><span><strong>Plamenco</strong><small>Dental Co.</small></span></Link><p>Thoughtful dental care and connected patient services across Pulilan and Plaridel, Bulacan.</p><Link to="/book" className="lpv2-footer-book">Book an appointment <ArrowRight size={15}/></Link></div>
          <div><strong>Clinic</strong><a href="#about">About</a><a href="#services">Services</a><a href="#team">Care Team</a><a href="#branches">Branches</a></div>
          <div><strong>Patients</strong><Link to="/book">Book Appointment</Link><Link to="/login">Patient Login</Link><Link to="/register">Create Account</Link><a href="#faq">FAQ</a></div>
          <div><strong>Locations</strong>{branches.length ? branches.map((branch) => <span key={branch.id}>{branch.city || branch.name}{branch.province ? `, ${branch.province}` : ''}</span>) : <span>Pulilan & Plaridel, Bulacan</span>}</div>
        </div>
        <div className="lpv2-container lpv2-footer-bottom"><span>© {new Date().getFullYear()} Plamenco Dental Co.</span><span><ShieldCheck size={14}/> Patient records and portal access require authentication.</span></div>
      </footer>
    </div>
  )
}
