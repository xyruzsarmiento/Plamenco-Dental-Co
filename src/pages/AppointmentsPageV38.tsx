import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Building2, CalendarDays, Check, CheckCircle2, Clock3, MapPin, ShieldCheck, Stethoscope, UserRound, X } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Skeleton, SkeletonAvatar, SkeletonCard, SkeletonText } from '../components/ui/DesignSystem'
import { useAuth } from '../features/auth/AuthContext'
import { loadAppointmentsForBranchScope } from '../features/appointments/appointmentBranchLoader'
import { APPOINTMENT_STORAGE_KEY, getStoredAppointments } from '../features/appointments/appointmentStore'
import type { Appointment } from '../features/appointments/appointmentTypes'
import { useBranchContext } from '../features/branches/BranchContext'
import { getStoredBranches } from '../features/branches/branchStore'
import { getStoredProviders } from '../features/dentists/dentistStore'
import { getStoredPatients } from '../features/patients/patientStore'
import { getStoredServices } from '../features/services/serviceStore'
import '../styles/appointments-confirmation-v41.css'
import '../styles/internal-appointments-final-v104.css'
import '../styles/internal-appointments-branch-v120.css'
import { AppointmentsPage } from './AppointmentsPage'

type AppointmentNotice = {
  kind: 'created' | 'approved'
  appointment: Appointment
}

function manilaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function formatDate(date: string) {
  if (!date) return 'Date not available'
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(time: string) {
  if (!time) return 'Time not available'
  const [hour, minute] = time.split(':').map(Number)
  const date = new Date()
  date.setHours(hour || 0, minute || 0, 0, 0)
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

function clickWorkspaceTab(label: string) {
  const root = document.querySelector('.appointments-v40')
  const tabs = Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
  const tab = tabs.find((button) => button.textContent?.toLowerCase().includes(label.toLowerCase()))
  tab?.click()
  return Boolean(tab)
}

function requestsWorkspaceIsActive() {
  const root = document.querySelector('.appointments-v40')
  const tabs = Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
  return tabs.some((button) => button.getAttribute('aria-selected') === 'true' && button.textContent?.toLowerCase().includes('requests'))
}

function setReactInputValue(input: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function focusConfirmedAppointment(appointment: Appointment) {
  window.setTimeout(() => {
    if (appointment.date === manilaToday()) {
      if (!clickWorkspaceTab("Today's flow")) clickWorkspaceTab('Today’s flow')
      window.setTimeout(() => {
        document.querySelector('.sa-appointments-flow-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
      return
    }

    clickWorkspaceTab('Calendar')
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.appointments-v40 #appointment-date-filter')
      if (input) setReactInputValue(input, appointment.date)
      document.querySelector('.sa-appointments-calendar-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }, 20)
}

function openRequestsWorkspace(scroll = false) {
  window.setTimeout(() => {
    clickWorkspaceTab('Requests')
    if (scroll) {
      window.setTimeout(() => {
        document.querySelector('.sa-appointments-requests-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
    }
  }, 35)
}

function AppointmentSuccessModal({ notice, onClose, onContinue }: { notice: AppointmentNotice; onClose: () => void; onContinue: () => void }) {
  const appointment = notice.appointment
  const patient = getStoredPatients().find((entry) => entry.id === appointment.patientId || entry.patientId === appointment.patientId)
  const service = getStoredServices().find((entry) => entry.id === appointment.serviceId)
  const branch = getStoredBranches().find((entry) => entry.id === appointment.branchId)
  const provider = getStoredProviders().find((entry) => entry.id === appointment.providerId)
  const approved = notice.kind === 'approved'
  const isToday = appointment.date === manilaToday()

  return (
    <div className="modal-backdrop appointment-success-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
      <section className="appointment-success-modal appointment-success-modal-v42" role="dialog" aria-modal="true" aria-labelledby="appointment-success-title">
        <button className="appointment-success-close" type="button" aria-label="Close confirmation" onClick={onClose}><X size={18} /></button>
        <div className="appointment-success-hero">
          <div className="appointment-success-orb"><Check size={28} strokeWidth={2.4} /></div>
          <div className="appointment-success-status-row">
            <span className="appointment-success-status"><ShieldCheck size={13} />{approved ? 'CONFIRMED' : 'SAVED TO DATABASE'}</span>
            <span className="appointment-success-number">{appointment.appointmentNumber ?? 'Appointment'}</span>
          </div>
          <p className="appointment-success-kicker">{approved ? 'Scheduling decision complete' : 'New booking request'}</p>
          <h2 id="appointment-success-title">{approved ? 'Appointment confirmed' : 'Appointment request created'}</h2>
          <p className="appointment-success-copy">{approved ? `This visit is now confirmed and will appear in ${isToday ? "Today's flow" : 'the calendar'} at its scheduled time.` : 'The booking request is safely stored in Supabase and ready for clinic review.'}</p>
        </div>
        <div className="appointment-success-schedule-card">
          <div className="appointment-success-date-icon"><CalendarDays size={21} /></div>
          <div className="appointment-success-schedule-copy"><span>Scheduled visit</span><strong>{formatDate(appointment.date)}</strong><small><Clock3 size={13} />{formatTime(appointment.startTime)} – {formatTime(appointment.endTime)}</small></div>
          <span className={`appointment-success-state ${approved ? 'is-confirmed' : 'is-pending'}`}><CheckCircle2 size={13} />{approved ? 'Confirmed' : 'Pending review'}</span>
        </div>
        <div className="appointment-success-primary-grid">
          <article className="appointment-success-person-card"><span className="appointment-success-detail-icon"><UserRound size={17} /></span><div><small>Patient</small><strong>{patient ? `${patient.firstName} ${patient.lastName}` : appointment.patientId}</strong><span>{patient?.patientId ?? appointment.patientId}</span></div></article>
          <article className="appointment-success-person-card"><span className="appointment-success-detail-icon"><Stethoscope size={17} /></span><div><small>Service</small><strong>{service?.name ?? 'Dental service'}</strong><span>{service?.duration ? `${service.duration} minute visit` : 'Scheduled service'}</span></div></article>
        </div>
        <div className="appointment-success-meta-grid">
          <div><span><Building2 size={14} />Clinic branch</span><strong>{branch?.name ?? 'Clinic branch'}</strong></div>
          <div><span><Stethoscope size={14} />Dentist</span><strong>{provider?.displayName ?? 'Assigned dentist'}</strong></div>
          <div className="appointment-success-meta-wide"><span><MapPin size={14} />Location</span><strong>{[branch?.city, branch?.province].filter(Boolean).join(', ') || branch?.address || 'Clinic location'}</strong></div>
        </div>
        <div className="appointment-success-footer">
          <button type="button" className="appointment-success-secondary" onClick={onClose}>Close</button>
          <Button onClick={onContinue}>{approved ? (isToday ? "View today's flow" : 'View in calendar') : 'Open requests'}<ArrowRight size={15} /></Button>
        </div>
      </section>
    </div>
  )
}

function AppointmentsPageSkeleton() {
  const stages = ['Upcoming', 'Checked In', 'Waiting', 'Treatment', 'Completed', 'No Show']
  return (
    <div className="appointments-v40 appointment-bootstrap-state appointment-bootstrap-state-v3">
      <section className="appointment-skeleton-workspace-v3" aria-busy="true" aria-label="Loading appointments workspace">
        <SkeletonCard className="appointment-skeleton-hero-v3"><div><Skeleton width={142} height={12} radius={999} /><Skeleton width="min(420px, 78vw)" height={40} radius={13} /><SkeletonText lines={2} widths={['min(680px, 92%)', 'min(520px, 74%)']} /></div><div className="appointment-skeleton-hero-actions-v3"><Skeleton width={138} height={44} radius={13} /><Skeleton width={138} height={44} radius={13} /></div></SkeletonCard>
        <div className="appointment-skeleton-tabs-v3"><Skeleton width={156} height={42} radius={13} /><Skeleton width={126} height={42} radius={13} /><Skeleton width={136} height={42} radius={13} /></div>
        <section className="appointment-skeleton-board-v3">
          <div className="appointment-skeleton-board-header-v3"><div><Skeleton width={176} height={12} radius={999} /><Skeleton width="min(360px, 78vw)" height={26} radius={11} /><Skeleton width="min(520px, 86vw)" height={13} radius={999} /></div><div className="appointment-skeleton-flow-metrics-v3"><Skeleton width={106} height={30} radius={999} /><Skeleton width={92} height={30} radius={999} /><Skeleton width={102} height={30} radius={999} /></div></div>
          <div className="appointment-skeleton-stage-grid-v3">{stages.map((stage, stageIndex) => <SkeletonCard key={stage} className="appointment-skeleton-stage-v3"><div className="appointment-skeleton-stage-head-v3"><Skeleton width={stageIndex === 3 ? 96 : 82} height={16} radius={8} /><Skeleton width={26} height={24} radius={999} /></div>{Array.from({ length: stageIndex === 0 ? 2 : 1 }, (_, cardIndex) => <div className="appointment-skeleton-journey-card-v3" key={`${stage}-${cardIndex}`}><div className="appointment-skeleton-journey-main-v3"><SkeletonAvatar size={42} radius={14} /><SkeletonText lines={2} widths={['118px', '76px']} /><SkeletonText lines={2} widths={['112px', '92px']} /></div><div className="appointment-skeleton-actions-v3"><Skeleton width={74} height={30} radius={9} /><Skeleton width={64} height={30} radius={9} /></div></div>)}</SkeletonCard>)}</div>
        </section>
      </section>
    </div>
  )
}

export function AppointmentsPageV38() {
  const { user } = useAuth()
  const { activeBranch, activeBranchId, availableBranches, hasBranchAccess, isAllBranchesMode, isLoading: branchLoading } = useBranchContext()
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState<AppointmentNotice | null>(null)
  const [renderVersion, setRenderVersion] = useState(0)
  const previousRef = useRef<Map<string, Appointment>>(new Map())
  const hydratingRef = useRef(false)
  const verifyingRef = useRef<Set<string>>(new Set())
  const branchScopeKey = isAllBranchesMode ? 'all-branches' : activeBranchId ?? 'no-branch'

  useEffect(() => {
    if (!user?.id || branchLoading) return
    let cancelled = false
    setReady(false)
    setNotice(null)
    hydratingRef.current = true

    void loadAppointmentsForBranchScope({
      branchId: activeBranchId,
      isAllBranchesMode,
      userId: user.id,
      strict: false,
      bypassCache: true,
    }).then((rows) => {
      if (cancelled) return
      previousRef.current = new Map(rows.map((appointment) => [appointment.id, appointment]))
      setRenderVersion((version) => version + 1)
    }).finally(() => {
      hydratingRef.current = false
      if (!cancelled) setReady(true)
    })

    return () => { cancelled = true }
  }, [activeBranchId, branchLoading, branchScopeKey, isAllBranchesMode, user?.id])

  useEffect(() => {
    if (!ready || !user?.id) return

    function refreshRequestsWorkspace(scroll = false) {
      setRenderVersion((version) => version + 1)
      openRequestsWorkspace(scroll)
    }

    function verifyCreatedAppointment(appointment: Appointment) {
      const verificationKey = `${branchScopeKey}:${appointment.id}:created`
      if (verifyingRef.current.has(verificationKey)) return
      verifyingRef.current.add(verificationKey)
      window.setTimeout(() => {
        void loadAppointmentsForBranchScope({ branchId: activeBranchId, isAllBranchesMode, userId: user.id, strict: true, bypassCache: true })
          .then((rows) => {
            const remote = rows.find((entry) => entry.id === appointment.id)
            previousRef.current = new Map(rows.map((entry) => [entry.id, entry]))
            if (remote) {
              setNotice({ kind: 'created', appointment: remote })
              refreshRequestsWorkspace(false)
            }
          })
          .catch((error) => console.error('[appointment verification failed]', error))
          .finally(() => verifyingRef.current.delete(verificationKey))
      }, 450)
    }

    const timer = window.setInterval(() => {
      if (hydratingRef.current) return
      const currentRows = getStoredAppointments()
      const current = new Map(currentRows.map((appointment) => [appointment.id, appointment]))
      const previous = previousRef.current
      const keepRequestsOpen = requestsWorkspaceIsActive()
      let createdAppointment: Appointment | null = null
      let requestDecisionChanged = false

      for (const appointment of currentRows) {
        const before = previous.get(appointment.id)
        if (!before) {
          createdAppointment = appointment
          verifyCreatedAppointment(appointment)
          continue
        }
        if (before.status !== appointment.status && before.status === 'pending') {
          requestDecisionChanged = true
          if (appointment.status === 'confirmed') setNotice({ kind: 'approved', appointment })
        }
      }

      if (createdAppointment) refreshRequestsWorkspace(true)
      else if (requestDecisionChanged) {
        setRenderVersion((version) => version + 1)
        if (keepRequestsOpen) openRequestsWorkspace(false)
      }
      previousRef.current = current
    }, 100)

    return () => window.clearInterval(timer)
  }, [activeBranchId, branchScopeKey, isAllBranchesMode, ready, user?.id])

  useEffect(() => {
    if (!ready) return
    const root = document.querySelector<HTMLElement>('.appointments-v40')
    if (!root) return

    const enforceAppointmentScopeUx = () => {
      if (isAllBranchesMode) {
        const flowTab = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) => button.textContent?.includes('flow'))
        if (flowTab) {
          flowTab.disabled = true
          flowTab.setAttribute('aria-disabled', 'true')
          flowTab.title = 'Choose a specific branch workspace to operate today’s patient flow.'
        }
        if (flowTab?.getAttribute('aria-selected') === 'true') clickWorkspaceTab('Calendar')
        return
      }

      if (!activeBranchId) return
      const branchSelect = root.querySelector<HTMLSelectElement>('#appointment-branch-filter')
      if (branchSelect) {
        if (branchSelect.value !== activeBranchId) setReactInputValue(branchSelect, activeBranchId)
        branchSelect.disabled = true
        branchSelect.title = `Locked to ${activeBranch?.name ?? 'the selected branch workspace'}`
      }

      const modal = document.querySelector<HTMLElement>('.appointment37-modal')
      const branchButtons = Array.from(modal?.querySelectorAll<HTMLButtonElement>('.appointment37-option-card') ?? [])
      if (branchButtons.length) {
        const activeButton = branchButtons.find((button) => button.textContent?.includes(activeBranch?.name ?? ''))
        branchButtons.forEach((button) => {
          const allowed = button === activeButton
          button.hidden = !allowed
          button.disabled = !allowed
        })
        if (activeButton && !activeButton.classList.contains('is-selected')) activeButton.click()
      }
    }

    enforceAppointmentScopeUx()
    const observer = new MutationObserver(enforceAppointmentScopeUx)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [activeBranch?.name, activeBranchId, isAllBranchesMode, ready, renderVersion])

  function handleContinue() {
    if (!notice) return
    const currentNotice = notice
    setNotice(null)
    if (currentNotice.kind === 'approved') focusConfirmedAppointment(currentNotice.appointment)
    else openRequestsWorkspace(true)
  }

  if (branchLoading || !ready) return <AppointmentsPageSkeleton />

  if (!isAllBranchesMode && !hasBranchAccess) {
    return <section className="appointments-v40 appointments-branch-empty-v120"><Building2 size={28} /><h2>No branch assignment</h2><p>Your account does not currently have an active clinic branch assignment. Ask a Super Admin to assign a branch before using appointment operations.</p></section>
  }

  return (
    <div className="appointments-v40" data-storage-key={APPOINTMENT_STORAGE_KEY} data-branch-scope={branchScopeKey}>
      <div className={`appointments-branch-banner-v120 ${isAllBranchesMode ? 'is-all' : ''}`}>
        <Building2 size={16} />
        <div><strong>{isAllBranchesMode ? 'All Branches — Executive appointment view' : `${activeBranch?.name ?? 'Branch'} appointments`}</strong><span>{isAllBranchesMode ? 'KPIs and calendar may aggregate authorized branches. Choose a specific branch to operate today’s patient flow or create branch-owned records.' : 'Appointment KPIs, requests, calendar, volume and patient flow are limited to this branch workspace.'}</span></div>
      </div>
      <AppointmentsPage key={`${branchScopeKey}:${renderVersion}`} />
      {notice && <AppointmentSuccessModal notice={notice} onClose={() => setNotice(null)} onContinue={handleContinue} />}
    </div>
  )
}
