import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarDays, Import, Mail, Phone, Plus, Search, UserRound, UsersRound } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { PatientFormModal } from '../features/patients/PatientFormModal'
import { PatientImportModal } from '../features/patients/PatientImportModal'
import { usePermissions } from '../features/auth/permissions'
import { getStoredAppointments } from '../features/appointments/appointmentStore'
import { getStoredBranches } from '../features/branches/branchStore'
import { getTreatmentsByPatient } from '../features/treatments/treatmentStore'
import {
  findPotentialPatientDuplicates,
  filterPatients,
  getPatientDisplayName,
  getStoredPatients,
} from '../features/patients/patientStore'
import { createPatientPersisted, loadPatientsFromSupabase } from '../features/patients/patientPersistence'
import type { Patient, PatientFormValues, PatientOrigin } from '../features/patients/patientTypes'
import { PatientsPageV10 } from './PatientsPageV10'

const originLabels: Record<PatientOrigin, string> = {
  online_registration: 'Online registration',
  walk_in: 'Walk-in',
  historical_import: 'Historical import',
  staff_created: 'Staff created',
}

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function emptyPatientValues(): PatientFormValues {
  return {
    authUserId: undefined,
    fullName: '', firstName: '', middleName: '', lastName: '', dateOfBirth: '', sex: 'female', phone: '', email: '', address: '', city: '', province: '',
    emergencyContact: '', emergencyContactPhone: '', emergencyContactRelationship: '', preferredBranchId: '', origin: 'walk_in', registrationDate: manilaToday(), status: 'active',
    allergies: '', medicalConditions: '', currentMedications: '', previousSurgeries: '', medicalNotes: '', administrativeNotes: '', profileImage: '',
  }
}

function initials(patient: Patient) {
  return `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase()
}

function formatDate(value?: string) {
  if (!value) return 'No date recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })
}

function formatTime(value?: string) {
  if (!value) return ''
  const [hours, minutes] = value.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function registrationSeries(patients: Patient[]) {
  const formatter = new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'Asia/Manila' })
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - (5 - index))
    const year = date.getFullYear()
    const month = date.getMonth()
    return {
      label: formatter.format(date),
      value: patients.filter((patient) => {
        const registered = new Date(patient.registrationDate)
        return !Number.isNaN(registered.getTime()) && registered.getFullYear() === year && registered.getMonth() === month
      }).length,
    }
  })
}

function PatientGrowthChartV36({ data }: { data: Array<{ label: string; value: number }> }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const width = 760
  const height = 250
  const padding = { left: 34, right: 28, top: 24, bottom: 42 }
  const max = Math.max(1, ...data.map((item) => item.value))
  const usableWidth = width - padding.left - padding.right
  const usableHeight = height - padding.top - padding.bottom
  const points = data.map((item, index) => ({
    ...item,
    x: padding.left + (index * usableWidth) / Math.max(1, data.length - 1),
    y: padding.top + usableHeight - (item.value / max) * usableHeight,
  }))
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const area = points.length ? `${path} L ${points.at(-1)!.x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z` : ''

  return (
    <div className="patients36-growth-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={data.map((item) => `${item.label}: ${item.value} registrations`).join(', ')}>
        {[0, .33, .66, 1].map((ratio) => {
          const y = padding.top + usableHeight * ratio
          return <line key={ratio} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="patients36-gridline" />
        })}
        <path d={area} className="patients36-growth-area" />
        <path d={path} className="patients36-growth-line" />
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r={hovered === index ? 7 : 5} tabIndex={0} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} aria-label={`${point.label}: ${point.value} registrations`} />
            <text x={point.x} y={height - 12} textAnchor="middle">{point.label}</text>
            {hovered === index && (
              <g className="patients36-tooltip" transform={`translate(${Math.min(Math.max(point.x - 56, 6), width - 120)}, ${Math.max(point.y - 58, 4)})`}>
                <rect width="112" height="42" rx="10" />
                <text x="10" y="17">{point.label}</text>
                <text x="10" y="32">{point.value} registration{point.value === 1 ? '' : 's'}</text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

export function PatientsPageV36() {
  const { patientId: routePatientId } = useParams()
  const navigate = useNavigate()
  const permissions = usePermissions()
  const [patients, setPatients] = useState<Patient[]>(() => getStoredPatients())
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [originFilter, setOriginFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [formValues, setFormValues] = useState<PatientFormValues>(() => emptyPatientValues())
  const [formError, setFormError] = useState<string | null>(null)
  const [duplicateMatches, setDuplicateMatches] = useState<ReturnType<typeof findPotentialPatientDuplicates>>([])
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const branches = useMemo(() => getStoredBranches(), [])
  const appointments = useMemo(() => getStoredAppointments(), [patients])
  const today = manilaToday()
  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches])
  const canCreate = permissions.can('patients.create')
  const canImport = permissions.can('patients.import')

  useEffect(() => {
    let active = true
    void loadPatientsFromSupabase({ strict: true })
      .then((rows) => {
        if (!active) return
        setPatients(rows)
        setLoadError(null)
      })
      .catch((cause) => {
        if (!active) return
        setLoadError(cause instanceof Error ? cause.message : 'Unable to load patient records from Supabase.')
      })
    return () => { active = false }
  }, [])

  const metrics = useMemo(() => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)
    return {
      total: patients.length,
      active: patients.filter((patient) => patient.status === 'active').length,
      newPatients: patients.filter((patient) => {
        const registered = new Date(patient.registrationDate)
        return !Number.isNaN(registered.getTime()) && registered >= cutoff
      }).length,
      upcoming: appointments.filter((appointment) => appointment.date >= today && !['cancelled', 'completed', 'no_show', 'rejected'].includes(appointment.status)).length,
    }
  }, [appointments, patients, today])

  const filteredPatients = useMemo(() => {
    const lower = query.trim().toLowerCase()
    let rows = lower
      ? patients.filter((patient) => `${patient.firstName} ${patient.middleName} ${patient.lastName} ${patient.patientId} ${patient.phone} ${patient.email}`.toLowerCase().includes(lower))
      : patients
    rows = filterPatients(rows, { status: statusFilter === 'all' ? undefined : statusFilter })
    if (branchFilter !== 'all') rows = rows.filter((patient) => patient.preferredBranchId === branchFilter)
    if (originFilter !== 'all') rows = rows.filter((patient) => (patient.origin ?? 'staff_created') === originFilter)
    return [...rows].sort((a, b) => getPatientDisplayName(a).localeCompare(getPatientDisplayName(b)))
  }, [branchFilter, originFilter, patients, query, statusFilter])

  const growth = useMemo(() => registrationSeries(patients), [patients])

  if (routePatientId) return <PatientsPageV10 />

  function nextAppointment(patient: Patient) {
    return appointments
      .filter((appointment) => appointment.patientId === patient.patientId && appointment.date >= today && !['cancelled', 'completed', 'no_show', 'rejected'].includes(appointment.status))
      .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))[0]
  }

  function openAdd() {
    setFormValues(emptyPatientValues())
    setFormError(null)
    setDuplicateMatches([])
    setAllowDuplicate(false)
    setShowForm(true)
  }

  async function savePatient() {
    if (isSaving) return
    if (!formValues.firstName.trim() || !formValues.lastName.trim() || !formValues.dateOfBirth || !formValues.phone.trim()) {
      setFormError('First name, last name, date of birth, and phone are required.')
      return
    }
    if (!allowDuplicate) {
      const matches = findPotentialPatientDuplicates(formValues, patients)
      if (matches.length) {
        setDuplicateMatches(matches)
        setFormError('Possible existing patient found. Review before creating another record.')
        return
      }
    }

    setIsSaving(true)
    setFormError(null)
    try {
      await createPatientPersisted(formValues)
      const rows = await loadPatientsFromSupabase({ strict: true })
      setPatients(rows)
      setShowForm(false)
      setDuplicateMatches([])
      setAllowDuplicate(false)
      setLoadError(null)
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Patient could not be saved to Supabase.')
    } finally {
      setIsSaving(false)
    }
  }

  const noFilters = !query.trim() && statusFilter === 'all' && branchFilter === 'all' && originFilter === 'all'

  return (
    <section className="patients36-page">
      <header className="patients36-hero">
        <div className="patients36-hero-copy"><span>PATIENT INTELLIGENCE</span><h1>Patient Records</h1><p>Search, review and manage the clinic's patient population from one workspace.</p></div>
        <div className="patients36-hero-actions">{canImport && <Button variant="secondary" onClick={() => setShowImport(true)}><Import size={16} />Import</Button>}{canCreate && <Button onClick={openAdd}><Plus size={16} />Add patient</Button>}</div>
      </header>

      {loadError && <div className="tp13-error" role="alert">{loadError}</div>}

      <div className="patients36-insight-grid">
        <div className="patients36-kpis">
          <article><span className="patients36-kpi-icon"><UsersRound size={18} /></span><div><small>Total patients</small><strong>{metrics.total}</strong><p>All patient records</p></div></article>
          <article><span className="patients36-kpi-icon"><UserRound size={18} /></span><div><small>Active</small><strong>{metrics.active}</strong><p>Currently active records</p></div></article>
          <article><span className="patients36-kpi-icon"><Plus size={18} /></span><div><small>New in 30 days</small><strong>{metrics.newPatients}</strong><p>Recent registrations</p></div></article>
          <article><span className="patients36-kpi-icon"><CalendarDays size={18} /></span><div><small>Upcoming visits</small><strong>{metrics.upcoming}</strong><p>Open future appointments</p></div></article>
        </div>
        <article className="patients36-growth-card"><header><div><span>PATIENT GROWTH</span><h2>Registrations</h2><p>Actual registrations across the last six calendar months.</p></div><div className="patients36-chart-badge">6 months</div></header><PatientGrowthChartV36 data={growth} /></article>
      </div>

      <section className="patients36-directory">
        <div className="patients36-commandbar">
          <label className="patients36-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, patient ID, phone or email" /></label>
          <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
          <label><span>Branch</span><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="all">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label><span>Origin</span><select value={originFilter} onChange={(event) => setOriginFilter(event.target.value)}><option value="all">All origins</option>{Object.entries(originLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>

        <div className="patients36-list-head"><span>Patient</span><span>Contact</span><span>Care context</span><span>Next visit</span><span>Open</span></div>
        <div className="patients36-list">
          {filteredPatients.map((patient) => {
            const visit = nextAppointment(patient)
            const treatmentCount = getTreatmentsByPatient(patient.patientId).length
            const branchName = patient.preferredBranchId ? branchMap.get(patient.preferredBranchId) ?? 'Unknown branch' : 'No preferred branch'
            const origin = originLabels[patient.origin ?? 'staff_created']
            return (
              <button key={patient.id} type="button" className="patients36-row" onClick={() => navigate(`/app/patients/${encodeURIComponent(patient.patientId)}`)}>
                <span className="patients36-person"><span className="patients36-avatar">{patient.profileImage ? <img src={patient.profileImage} alt="" /> : initials(patient)}</span><span className="patients36-person-copy"><strong>{getPatientDisplayName(patient)}</strong><span>{patient.patientId}</span><em className={`patients36-status is-${patient.status}`}>{patient.status}</em></span></span>
                <span className="patients36-contact"><span><Mail size={14} />{patient.email || 'No email recorded'}</span><span><Phone size={14} />{patient.phone || 'No phone recorded'}</span></span>
                <span className="patients36-context"><strong>{branchName}</strong><span>{origin} · {treatmentCount} treatment{treatmentCount === 1 ? '' : 's'}</span></span>
                <span className="patients36-next"><strong>{visit ? formatDate(visit.date) : 'No upcoming visit'}</strong><span>{visit ? `${formatTime(visit.startTime)} · ${visit.status.replaceAll('_', ' ')}` : 'No appointment scheduled'}</span></span>
                <span className="patients36-open"><ArrowRight size={16} /></span>
              </button>
            )
          })}
          {!filteredPatients.length && <div className="patients36-empty"><span><UsersRound size={22} /></span><h3>{noFilters ? 'No patient records yet' : 'No matching patients'}</h3><p>{noFilters ? 'Patient records will appear here after they are created or imported.' : 'Try clearing one or more filters or searching with a different name, patient ID, phone or email.'}</p>{!noFilters && <Button variant="secondary" onClick={() => { setQuery(''); setStatusFilter('all'); setBranchFilter('all'); setOriginFilter('all') }}>Clear filters</Button>}</div>}
        </div>
      </section>

      {showForm && <PatientFormModal error={formError ?? (isSaving ? 'Saving patient to clinic database…' : null)} mode="add" values={formValues} onChange={setFormValues} onClose={() => { if (!isSaving) setShowForm(false) }} onSubmit={() => void savePatient()} duplicateMatches={duplicateMatches} onOpenDuplicate={(patientId) => { setShowForm(false); navigate(`/app/patients/${encodeURIComponent(patientId)}`) }} onContinueDuplicate={() => { setAllowDuplicate(true); setDuplicateMatches([]); setFormError(null) }} />}
      {showImport && <PatientImportModal onClose={() => setShowImport(false)} onImported={() => { void loadPatientsFromSupabase({ strict: true }).then(setPatients).catch((cause) => setLoadError(cause instanceof Error ? cause.message : 'Unable to refresh patients.')) }} />}
    </section>
  )
}