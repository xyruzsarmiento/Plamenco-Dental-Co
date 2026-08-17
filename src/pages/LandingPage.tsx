import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ArrowUpRight,
  Calendar,
  Clock,
  MapPin,
  Menu,
  Phone,
  Plus,
  Smile,
  Sparkles,
  Stethoscope,
  Baby,
  Search,
  Shield,
  X,
  Send,
  CheckCircle,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import '../styles/landing.css'

// Premium IntersectionObserver-based Scroll Reveal Component
function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`${className} ${isVisible ? 'is-visible' : ''}`}
      data-reveal
    >
      {children}
    </div>
  )
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const [activeService, setActiveService] = useState(0)
  const [activeBranch, setActiveBranch] = useState(0)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  })
  const [formSubmitted, setFormSubmitted] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Scroll reveal animations handled via standard React Reveal component

  const toggleMenu = () => setMenuOpen(!menuOpen)
  const toggleFaq = (index: number) => {
    setExpandedFaq((prev) => (prev === index ? null : index))
  }

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormSubmitted(true)
    setTimeout(() => {
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' })
      setFormSubmitted(false)
    }, 3000)
  }

  // Services data (existing)
  const services = [
    {
      id: 1,
      title: 'General Dentistry',
      description:
        'Preventive care and routine dental check-ups performed with modern technology and a gentle approach — the foundation of lasting oral health.',
      icon: Smile,
      image:
        'https://images.unsplash.com/photo-1629909613654-28eca530057d?w=900&h=700&fit=crop',
    },
    {
      id: 2,
      title: 'Cosmetic Dentistry',
      description:
        'Enhance your smile with advanced cosmetic treatments designed around your natural features and personal goals.',
      icon: Sparkles,
      image:
        'https://images.unsplash.com/photo-1576091160550-112173f7f869?w=900&h=700&fit=crop',
    },
    {
      id: 3,
      title: 'Restorative Dentistry',
      description:
        'Restore function and aesthetics with advanced restorative solutions that feel as natural as they look.',
      icon: Stethoscope,
      image:
        'https://images.unsplash.com/photo-1606532927519-3b5a4b6e5c0d?w=900&h=700&fit=crop',
    },
    {
      id: 4,
      title: 'Pediatric Dentistry',
      description:
        'Specialized dental care for children in a warm, welcoming environment that makes every visit comfortable and positive.',
      icon: Baby,
      image:
        'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?w=900&h=700&fit=crop',
    },
    {
      id: 5,
      title: 'Dental Diagnostics',
      description:
        'Accurate diagnosis using advanced imaging and examination techniques to plan effective, personalized treatment.',
      icon: Search,
      image:
        'https://images.unsplash.com/photo-1609840110085-ba77381e37df?w=900&h=700&fit=crop',
    },
  ]

  // Branches data (existing)
  const branches = [
    {
      name: 'Pulilan',
      province: 'Bulacan',
      location: 'Pulilan, Bulacan',
      address: 'Visit us for comprehensive dental services',
      phone: '+63 917 234 5667',
      hours: 'Mon - Fri: 9:00 AM - 6:00 PM',
      saturday: 'Sat: 9:00 AM - 2:00 PM',
      lat: 14.9025,
      lon: 120.8497,
    },
    {
      name: 'Plaridel',
      province: 'Bulacan',
      location: 'Plaridel, Bulacan',
      address: 'Convenient location for your dental needs',
      phone: '+63 917 234 5667',
      hours: 'Mon - Fri: 9:00 AM - 6:00 PM',
      saturday: 'Sat: 9:00 AM - 2:00 PM',
      lat: 14.887,
      lon: 120.8568,
    },
  ]

  // FAQ data (existing)
  const faqs = [
    {
      question: 'What should I expect during my first visit?',
      answer:
            'During your first visit, we will conduct a comprehensive dental examination, take necessary X-rays, and discuss your dental health history. This allows us to create a personalized treatment plan tailored to your needs.',
    },
    {
      question: 'Do you offer emergency dental services?',
      answer:
        'Yes, we provide emergency dental services for urgent dental problems. Please contact us immediately if you experience severe tooth pain or dental trauma.',
    },
    {
      question: 'What payment options do you accept?',
      answer:
        'We accept various payment methods including cash, debit cards, and credit cards. We also offer flexible payment plans for major procedures.',
    },
    {
      question: 'How often should I visit the dentist?',
      answer:
        'We recommend visiting the dentist at least twice a year for regular check-ups and cleanings. However, some patients may need more frequent visits based on their oral health status.',
    },
    {
      question: 'Are your services covered by dental insurance?',
      answer:
        'We work with most major dental insurance providers. Please contact us with your insurance details, and we can verify your coverage.',
    },
  ]

  // OpenStreetMap embed for the selected branch
  const mapEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${
    branches[activeBranch].lon - 0.02
  }%2C${branches[activeBranch].lat - 0.02}%2C${branches[activeBranch].lon + 0.02}%2C${
    branches[activeBranch].lat + 0.02
  }&layer=mapnik&marker=${branches[activeBranch].lat}%2C${branches[activeBranch].lon}`

  return (
    <>
      <div className="landing-page">
        {/* NAVIGATION */}
        <header className={`landing-header ${scrolled ? 'is-scrolled' : ''}`}>
          <nav className="landing-nav-container" aria-label="Main navigation">
            <Link to="/" className="nav-logo" aria-label="Plamenco Dental Co. Home">
              <img src="/assets/images/logo.png" alt="Plamenco Dental Co. logo" />
              <span className="nav-logo-text">
                <strong>Plamenco</strong>
                <small>Dental Co.</small>
              </span>
            </Link>

            <div className="nav-menu-desktop">
              <a href="#home" className="nav-link">Home</a>
              <a href="#about" className="nav-link">About</a>
              <a href="#services" className="nav-link">Services</a>
              <a href="#team" className="nav-link">Our Team</a>
              <a href="#branches" className="nav-link">Branches</a>
              <a href="#contact" className="nav-link">Contact</a>
            </div>

            <button
              className="nav-menu-toggle"
              onClick={toggleMenu}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            <div className="nav-actions">
              <Link to="/login" className="nav-auth-link">Login</Link>
              <Link to="/book" className="nav-cta-link">
                <Button className="nav-cta">
                  <Calendar size={16} />
                  Book Appointment
                </Button>
              </Link>
            </div>
          </nav>

          {menuOpen && (
            <div className="nav-menu-mobile">
              <a href="#home" className="nav-link" onClick={() => setMenuOpen(false)}>Home</a>
              <a href="#about" className="nav-link" onClick={() => setMenuOpen(false)}>About</a>
              <a href="#services" className="nav-link" onClick={() => setMenuOpen(false)}>Services</a>
              <a href="#team" className="nav-link" onClick={() => setMenuOpen(false)}>Our Team</a>
              <a href="#branches" className="nav-link" onClick={() => setMenuOpen(false)}>Branches</a>
              <a href="#contact" className="nav-link" onClick={() => setMenuOpen(false)}>Contact</a>
              <div className="nav-mobile-actions">
                <Link to="/login" className="nav-mobile-login" onClick={() => setMenuOpen(false)}>Login</Link>
                <Link to="/book" onClick={() => setMenuOpen(false)}>
                  <Button className="nav-cta nav-cta-mobile">
                    <Calendar size={16} />
                    Book Appointment
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </header>

        <main>
          {/* HERO SECTION */}
          <section id="home" className="hero-section">
            <div className="hero-overlay" />
            <div className="hero-content-container">
              <div className="hero-content">
                <div className="hero-eyebrow">
                  <span className="hero-eyebrow-line" />
                  <span>Dental Clinic · Pulilan & Plaridel, Bulacan</span>
                </div>
                <h1 className="hero-title">
                  Exceptional Dental Care,
                  <br />
                  <em>Warmly Delivered.</em>
                </h1>
                <p className="hero-description">
                  Plamenco Dental Co. brings premium, compassionate dentistry to families across
                  Bulacan — combining modern technology with a gentle, human touch.
                </p>
                <div className="hero-actions">
                  <a href="#services" className="btn-hero">
                    Learn More
                    <ArrowRight size={16} />
                  </a>
                </div>
              </div>
            </div>
            <div className="hero-scroll-indicator" aria-hidden="true">
              <span className="hero-scroll-line" />
              <span className="hero-scroll-text">Scroll</span>
            </div>
          </section>

          {/* INTRO / TRUST STRIP */}
          <section className="intro-section">
            <div className="container">
              <div className="intro-grid">
                <div className="intro-heading">
                  <span className="section-label">Welcome to Plamenco</span>
                  <h2>
                    Modern dentistry with a <em>personal touch</em>
                  </h2>
                </div>
                <div className="intro-copy">
                  <p>
                    From routine check-ups to advanced restorative procedures, our team is
                    committed to providing exceptional care in a warm, welcoming environment.
                  </p>
                  <p>
                    With two convenient locations in Pulilan and Plaridel, quality dental care is
                    always within reach.
                  </p>
                </div>
              </div>
              <div className="intro-features">
                <div className="intro-feature">
                  <div className="intro-feature-icon">
                    <Shield size={20} />
                  </div>
                  <div>
                    <strong>Patient-Centered Care</strong>
                    <span>Your comfort guides every treatment</span>
                  </div>
                </div>
                <div className="intro-feature">
                  <div className="intro-feature-icon">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <strong>Modern Technology</strong>
                    <span>Advanced tools for precise results</span>
                  </div>
                </div>
                <div className="intro-feature">
                  <div className="intro-feature-icon">
                    <MapPin size={20} />
                  </div>
                  <div>
                    <strong>Two Convenient Locations</strong>
                    <span>Pulilan & Plaridel, Bulacan</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SERVICES — Interactive Showcase with Imagery */}
          <section id="services" className="services-section">
            <div className="container">
              <div className="services-intro">
                <div>
                  <span className="section-label">Our Services</span>
                  <h2>
                    Comprehensive care
                    <br />
                    for <em>every smile.</em>
                  </h2>
                </div>
                <p className="services-intro-copy">
                  From preventive check-ups to advanced restorative treatments, we offer a full
                  spectrum of dental services designed around your needs — delivered with
                  precision and warmth.
                </p>
              </div>

              <div className="service-showcase">
                {/* Large featured visual */}
                <Reveal className="service-visual">
                  <div className="service-visual-image">
                    <img
                      key={activeService}
                      src={services[activeService].image}
                      alt={services[activeService].title}
                    />
                    <div className="service-visual-overlay" />
                  </div>
                  <div className="service-visual-index">
                    <span>{String(activeService + 1).padStart(2, '0')}</span>
                    <span className="service-visual-divider" />
                    <span>{String(services.length).padStart(2, '0')}</span>
                  </div>
                  <div className="service-visual-label">{services[activeService].title}</div>
                </Reveal>

                {/* Interactive service list */}
                <div className="service-list">
                  {services.map((service, idx) => {
                    const IconComponent = service.icon
                    return (
                      <button
                        key={service.id}
                        className={`service-list-item ${activeService === idx ? 'is-active' : ''}`}
                        onMouseEnter={() => setActiveService(idx)}
                        onClick={() => setActiveService(idx)}
                        aria-label={`View ${service.title} details`}
                      >
                        <span className="service-list-number">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="service-list-icon">
                          <IconComponent size={18} />
                        </span>
                        <span className="service-list-content">
                          <strong>{service.title}</strong>
                          <span>{service.description}</span>
                        </span>
                        <ArrowUpRight size={16} className="service-list-arrow" />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ABOUT SECTION */}
          <section id="about" className="about-section">
            <div className="container">
              <div className="about-layout">
                <div className="about-image-wrap">
                  <div className="about-image-main">
                    <img
                      src="/assets/images/clinic.png"
                      alt="Plamenco Dental Co. clinic interior - modern dental treatment area"
                    />
                  </div>
                  <div className="about-image-accent" aria-hidden="true" />
                  <div className="about-badge">
                    <div className="about-badge-icon">
                      <Smile size={20} />
                    </div>
                    <div>
                      <strong>Compassionate Care</strong>
                      <span>In a comfortable environment</span>
                    </div>
                  </div>
                </div>

                <div className="about-content">
                  <span className="section-label">About Plamenco</span>
                  <h2>
                    A dental experience built on <em>trust & comfort</em>
                  </h2>
                  <p>
                    Plamenco Dental Co. is committed to providing premium dental care to families
                    and individuals across Bulacan. With locations in Pulilan and Plaridel, we
                    offer comprehensive dental services using the latest technology and
                    techniques.
                  </p>
                  <p>
                    Our team of highly trained dental professionals is dedicated to ensuring every
                    patient receives personalized care in a comfortable and welcoming environment.
                  </p>
                  <ul className="about-highlights">
                    <li>Professional dental care with modern equipment</li>
                    <li>Patient-centered approach to treatment</li>
                    <li>Convenient locations in Pulilan and Plaridel</li>
                    <li>Flexible scheduling and emergency services</li>
                  </ul>
                  <Link to="/book" className="btn-about">
                    Book an Appointment
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* WHY CHOOSE US — Editorial Brand Statement */}
          <section className="why-us-section">
            <div className="container">
              <div className="why-us-layout">
                <Reveal className="why-us-text">
                  <span className="section-label">Why Plamenco</span>
                  <h2 className="why-us-headline">
                    The Plamenco
                    <br />
                    <em>difference.</em>
                  </h2>
                  <p className="why-us-statement">
                    "Exceptional dental care goes beyond clinical excellence. It's about how you
                    feel from the moment you walk through our doors."
                  </p>
                  <div className="why-us-rule" aria-hidden="true" />
                </Reveal>

                <Reveal className="why-us-editorial">
                  <div className="why-us-principles">
                    <Reveal className="why-principle">
                      <span className="why-principle-number">01</span>
                      <div>
                        <h3>Expert Dentists</h3>
                        <p>
                          Our dental team comprises highly qualified professionals dedicated to
                          your oral health.
                        </p>
                      </div>
                    </Reveal>
                    <Reveal className="why-principle">
                      <span className="why-principle-number">02</span>
                      <div>
                        <h3>Modern Technology</h3>
                        <p>
                          We use the latest dental equipment and techniques for superior results.
                        </p>
                      </div>
                    </Reveal>
                    <Reveal className="why-principle">
                      <span className="why-principle-number">03</span>
                      <div>
                        <h3>Comfortable Environment</h3>
                        <p>
                          Our clinics are designed to make you feel safe, relaxed, and cared for.
                        </p>
                      </div>
                    </Reveal>
                  </div>
                </Reveal>
              </div>
            </div>
          </section>

          {/* TEAM — Immersive Showcase */}
          <section id="team" className="team-section">
            <div className="container">
              <Reveal className="team-intro">
                <span className="section-label">Our Team</span>
                <h2>
                  Meet the experts
                  <br />
                  behind <em>your smile.</em>
                </h2>
              </Reveal>

              <Reveal className="team-featured">
                <div className="team-featured-visual">
                  <div className="team-featured-image">
                    <div className="team-featured-placeholder">
                      <Stethoscope size={48} />
                    </div>
                    <div className="team-featured-accent" aria-hidden="true" />
                  </div>
                  <div className="team-featured-info">
                    <span className="team-featured-role">Our Dental Team</span>
                    <h3>Doctor profiles coming soon</h3>
                    <p>
                      Our dental team profiles will be displayed here. We're excited to introduce
                      the professionals who make Plamenco Dental Co. exceptional.
                    </p>
                  </div>
                </div>
                <div className="team-featured-side">
                  <p>
                    Highly trained professionals dedicated to your oral health — delivering
                    personalized care in every visit.
                  </p>
                  <div className="team-featured-line" aria-hidden="true" />
                </div>
              </Reveal>
            </div>
          </section>

          {/* BRANCHES — Interactive Split Layout with Real Map */}
          <section id="branches" className="branches-section">
            <div className="container">
              <Reveal className="branches-intro">
                <span className="section-label">Our Branches</span>
                <h2>
                  Two locations, <em>one standard of care.</em>
                </h2>
              </Reveal>

              <div className="branch-showcase">
                {/* Branch selector */}
                <div className="branch-selector" role="tablist" aria-label="Select a branch">
                  {branches.map((branch, idx) => (
                    <button
                      key={branch.name}
                      className={`branch-selector-item ${activeBranch === idx ? 'is-active' : ''}`}
                      onClick={() => setActiveBranch(idx)}
                      role="tab"
                      aria-selected={activeBranch === idx}
                    >
                      <span className="branch-selector-name">{branch.name}</span>
                      <span className="branch-selector-province">{branch.province}</span>
                    </button>
                  ))}
                </div>

                {/* Branch content with real map */}
                <div className="branch-detail" key={`detail-${activeBranch}`}>
                  <div className="branch-detail-main">
                    <span className="branch-detail-label">
                      Branch {String(activeBranch + 1).padStart(2, '0')}
                    </span>
                    <h3 className="branch-detail-name">{branches[activeBranch].name}</h3>
                    <p className="branch-detail-location">{branches[activeBranch].location}</p>

                    <div className="branch-detail-info">
                      <div className="branch-detail-item">
                        <MapPin size={16} />
                        <span>{branches[activeBranch].address}</span>
                      </div>
                      <div className="branch-detail-item">
                        <Phone size={16} />
                        <a href={`tel:${branches[activeBranch].phone}`}>
                          {branches[activeBranch].phone}
                        </a>
                      </div>
                      <div className="branch-detail-item">
                        <Clock size={16} />
                        <span>
                          {branches[activeBranch].hours} · {branches[activeBranch].saturday}
                        </span>
                      </div>
                    </div>

                    <Link to="/book" className="branch-detail-cta">
                      Book at {branches[activeBranch].name}
                      <ArrowRight size={14} />
                    </Link>
                  </div>

                  {/* OpenStreetMap embed */}
                  <div className="branch-detail-visual">
                    <div className="branch-detail-map-embed">
                      <iframe
                        key={`map-${activeBranch}`}
                        title={`${branches[activeBranch].name} branch location`}
                        src={mapEmbedUrl}
                        loading="lazy"
                        aria-label={`Map showing ${branches[activeBranch].name}, ${branches[activeBranch].province}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ — Premium Split Layout (no reveal animation on items to prevent disappear bug) */}
          <section id="faq" className="faq-section">
            <div className="container">
              <div className="faq-split">
                <Reveal className="faq-intro">
                  <span className="section-label">FAQ</span>
                  <h2>
                    Common questions,
                    <br />
                    <em>clear answers.</em>
                  </h2>
                  <p>
                    Everything you need to know about visiting Plamenco Dental Co.
                  </p>
                  <div className="faq-contact">
                    <span>Need help?</span>
                    <a href="#contact">
                      Contact us
                      <ArrowRight size={14} />
                    </a>
                  </div>
                </Reveal>

                <div className="faq-questions">
                  {faqs.map((faq, idx) => (
                    <div
                      key={idx}
                      className={`faq-q-item ${expandedFaq === idx ? 'is-open' : ''}`}
                    >
                      <button
                        id={`faq-q-btn-${idx}`}
                        className="faq-q-question"
                        onClick={() => toggleFaq(idx)}
                        aria-expanded={expandedFaq === idx}
                        aria-controls={`faq-answer-${idx}`}
                      >
                        <span className="faq-q-number">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="faq-q-text">{faq.question}</span>
                        <span className="faq-q-icon">
                          <Plus size={18} />
                        </span>
                      </button>
                      <div
                        id={`faq-answer-${idx}`}
                        className="faq-q-answer"
                        role="region"
                        aria-labelledby={`faq-q-btn-${idx}`}
                      >
                        <div className="faq-q-answer-inner">
                          <p>{faq.answer}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* FINAL CTA SECTION — Full-width cinematic visual */}
          <section className="cta-section">
            <div className="cta-background" aria-hidden="true" />
            <div className="cta-overlay" aria-hidden="true" />
            <div className="cta-content-wrap">
              <div className="cta-content">
                <span className="cta-eyebrow">Begin Your Journey</span>
                <h2>
                  Your smile deserves <em>exceptional care.</em>
                </h2>
                <p>
                  Book your appointment today and experience the Plamenco difference — premium
                  dental care delivered with warmth and precision.
                </p>
                <Link to="/book" className="btn-cta">
                  Book an Appointment
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </section>

          {/* CONTACT — Premium Concierge Redesign Layout */}
          <section id="contact" className="contact-section">
            <div className="container">
              <div className="contact-layout">
                {/* Left Column: Editorial Info and Visual */}
                <Reveal className="contact-info-col">
                  <span className="section-label">Concierge</span>
                  <h2>
                    Let us welcome you <em>to Plamenco.</em>
                  </h2>
                  <p className="contact-intro-copy">
                    Experience dental care elevated to a fine craft. Reach out directly to our
                    clinical staff for personal arrangements or planning questions.
                  </p>

                  <div className="concierge-details">
                    <div className="concierge-detail-card">
                      <div className="concierge-detail-icon">
                        <Phone size={18} />
                      </div>
                      <div className="concierge-detail-text">
                        <strong>Telephone Support</strong>
                        <a href="tel:+639172345667" className="concierge-link">+63 917 234 5667</a>
                        <span className="concierge-sub">Direct clinic connection</span>
                      </div>
                    </div>

                    <div className="concierge-detail-card">
                      <div className="concierge-detail-icon">
                        <MapPin size={18} />
                      </div>
                      <div className="concierge-detail-text">
                        <strong>Our Locations</strong>
                        <span className="concierge-val">Pulilan & Plaridel, Bulacan</span>
                        <span className="concierge-sub">Complete dental facilities</span>
                      </div>
                    </div>

                    <div className="concierge-detail-card">
                      <div className="concierge-detail-icon">
                        <Clock size={18} />
                      </div>
                      <div className="concierge-detail-text">
                        <strong>Clinic Hours</strong>
                        <span className="concierge-val">Mon - Fri: 9:00 AM - 6:00 PM</span>
                        <span className="concierge-val">Saturday: 9:00 AM - 2:00 PM</span>
                      </div>
                    </div>
                  </div>

                  {/* Asymmetric Editorial Visual Element */}
                  <div className="contact-editorial-wrap">
                    <img
                      src="/assets/images/clinic.png"
                      alt="Plamenco Dental Co. clinic premium treatment area"
                      className="contact-editorial-img"
                      loading="lazy"
                    />
                    <div className="contact-editorial-badge">
                      <Smile size={18} className="gold-text" />
                      <div>
                        <strong>Warm & Comforting</strong>
                        <span>Your visit begins here</span>
                      </div>
                    </div>
                  </div>
                </Reveal>

                {/* Right Column: Refined Editorial Contact Form */}
                <Reveal className="contact-form-col">
                  <div className="concierge-form-container">
                    <div className="concierge-form-header">
                      <h3>Send a Message</h3>
                      <p>Our concierge staff typically responds within 2 business hours.</p>
                    </div>

                    {formSubmitted ? (
                      <div className="concierge-success-state">
                        <div className="success-icon-wrap">
                          <CheckCircle size={36} className="success-icon" />
                        </div>
                        <h4>Thank You</h4>
                        <p>Your message has been received. Our concierge team will reach out to you shortly.</p>
                      </div>
                    ) : (
                      <form onSubmit={handleFormSubmit} className="concierge-form">
                        <div className="form-row-grid">
                          <div className="form-group">
                            <label htmlFor="concierge-name">Full Name</label>
                            <input
                              type="text"
                              id="concierge-name"
                              value={formData.name}
                              onChange={(e) => handleFormChange('name', e.target.value)}
                              placeholder="e.g., Eleanor Vance"
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="concierge-email">Email Address</label>
                            <input
                              type="email"
                              id="concierge-email"
                              value={formData.email}
                              onChange={(e) => handleFormChange('email', e.target.value)}
                              placeholder="e.g., eleanor@example.com"
                              required
                            />
                          </div>
                        </div>

                        <div className="form-row-grid">
                          <div className="form-group">
                            <label htmlFor="concierge-phone">Phone Number</label>
                            <input
                              type="tel"
                              id="concierge-phone"
                              value={formData.phone}
                              onChange={(e) => handleFormChange('phone', e.target.value)}
                              placeholder="e.g., +63 917 123 4567"
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label htmlFor="concierge-subject">Subject</label>
                            <input
                              type="text"
                              id="concierge-subject"
                              value={formData.subject}
                              onChange={(e) => handleFormChange('subject', e.target.value)}
                              placeholder="How can we assist you?"
                              required
                            />
                          </div>
                        </div>

                        <div className="form-group">
                          <label htmlFor="concierge-message">Your Inquiry</label>
                          <textarea
                            id="concierge-message"
                            value={formData.message}
                            onChange={(e) => handleFormChange('message', e.target.value)}
                            placeholder="Tell us about your dental care needs or preferred schedule..."
                            rows={5}
                            required
                          />
                        </div>

                        <button type="submit" className="btn-concierge-submit">
                          <span>Submit Request</span>
                          <Send size={14} />
                        </button>
                      </form>
                    )}
                  </div>
                </Reveal>
              </div>
            </div>
          </section>
        </main>

        {/* FOOTER */}
        <footer className="landing-footer">
          <div className="container">
            <div className="footer-content">
              <div className="footer-section footer-brand-section">
                <Link to="/" className="footer-logo">
                  <img src="/assets/images/logo.png" alt="Plamenco Dental Co." />
                  <div className="footer-logo-text">
                    <strong>Plamenco</strong>
                    <small>Dental Co.</small>
                  </div>
                </Link>
                <p>
                  Providing quality dental care with compassion, innovation, and excellence in
                  Pulilan and Plaridel, Bulacan.
                </p>
              </div>

              <div className="footer-section">
                <h4>Quick Links</h4>
                <nav className="footer-nav" aria-label="Footer navigation">
                  <a href="#home">Home</a>
                  <a href="#about">About Us</a>
                  <a href="#services">Services</a>
                  <a href="#team">Our Team</a>
                  <a href="#branches">Branches</a>
                  <a href="#contact">Contact</a>
                </nav>
              </div>

              <div className="footer-section">
                <h4>Services</h4>
                <nav className="footer-nav" aria-label="Footer services">
                  <a href="#services">General Dentistry</a>
                  <a href="#services">Cosmetic Dentistry</a>
                  <a href="#services">Restorative Dentistry</a>
                  <a href="#services">Pediatric Dentistry</a>
                  <a href="#services">Dental Diagnostics</a>
                </nav>
              </div>

              <div className="footer-section">
                <h4>Pulilan Branch</h4>
                <div className="footer-contact">
                  <div>
                    <MapPin size={14} />
                    <span>Pulilan, Bulacan</span>
                  </div>
                  <div>
                    <Phone size={14} />
                    <a href="tel:+639172345667">+63 917 234 5667</a>
                  </div>
                  <div>
                    <Clock size={14} />
                    <span>Mon - Fri: 9AM - 6PM</span>
                  </div>
                </div>
              </div>

              <div className="footer-section">
                <h4>Plaridel Branch</h4>
                <div className="footer-contact">
                  <div>
                    <MapPin size={14} />
                    <span>Plaridel, Bulacan</span>
                  </div>
                  <div>
                    <Phone size={14} />
                    <a href="tel:+639172345667">+63 917 234 5667</a>
                  </div>
                  <div>
                    <Clock size={14} />
                    <span>Mon - Fri: 9AM - 6PM</span>
                  </div>
                </div>
              </div>

              <div className="footer-section">
                <h4>Patient Access</h4>
                <nav className="footer-nav" aria-label="Footer patient access">
                  <Link to="/login">Login</Link>
                  <Link to="/register">Register</Link>
                  <Link to="/book">Book Appointment</Link>
                  <a href="#faq">FAQ</a>
                </nav>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <div className="container footer-bottom-content">
              <p>&copy; 2025 Plamenco Dental Co. All rights reserved.</p>
              <div className="footer-links">
                <a href="#privacy">Privacy Policy</a>
                <a href="#terms">Terms of Service</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </>
  )
}