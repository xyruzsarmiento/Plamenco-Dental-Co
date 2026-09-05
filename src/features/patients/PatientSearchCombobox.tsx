import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, LoaderCircle, Search, X } from 'lucide-react'
import { getPatientDisplayName } from './patientStore'
import { searchPatientsFromSupabase } from './patientPersistence'
import type { Patient } from './patientTypes'
import '../../styles/patient-search-combobox.css'

type PatientSearchComboboxProps = {
  patients: Patient[]
  value?: string
  onSelect: (patient: Patient | null) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
  error?: string | null
  scopeFilter?: (patient: Patient) => boolean
}

function normalizeSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function patientSearchText(patient: Patient) {
  return [
    getPatientDisplayName(patient),
    patient.firstName,
    patient.middleName,
    patient.lastName,
    patient.fullName,
    patient.patientId,
    patient.phone,
    patient.email,
  ].filter(Boolean).join(' ')
}

function initials(patient: Patient) {
  return `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase() || '?'
}

export function PatientSearchCombobox({
  autoFocus = false,
  disabled = false,
  error,
  label = 'Patient',
  onSelect,
  patients,
  placeholder = 'Search by name, patient ID, phone or email',
  required = false,
  scopeFilter,
  value = '',
}: PatientSearchComboboxProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listId = useId().replace(/:/g, '')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [remoteResults, setRemoteResults] = useState<Patient[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const [remoteSelectedPatient, setRemoteSelectedPatient] = useState<Patient | null>(null)

  const selectedPatient = useMemo(
    () => patients.find((patient) => patient.id === value || patient.patientId === value) ??
      (remoteSelectedPatient?.id === value || remoteSelectedPatient?.patientId === value ? remoteSelectedPatient : undefined),
    [patients, remoteSelectedPatient, value],
  )
  const scopedPatients = useMemo(
    () => patients.filter((patient) => !scopeFilter || scopeFilter(patient)),
    [patients, scopeFilter],
  )
  const localResults = useMemo(() => {
    const needle = normalizeSearch(query)
    if (!needle) return []
    return scopedPatients
      .filter((patient) => normalizeSearch(patientSearchText(patient)).includes(needle))
      .slice(0, 12)
  }, [query, scopedPatients])
  const results = useMemo(() => {
    const merged = [...remoteResults, ...localResults]
    const seen = new Set<string>()
    return merged.filter((patient) => {
      if (scopeFilter && !scopeFilter(patient)) return false
      if (seen.has(patient.id)) return false
      seen.add(patient.id)
      return true
    }).slice(0, 12)
  }, [localResults, remoteResults, scopeFilter])

  function updatePopoverPosition() {
    const input = inputRef.current
    if (!input) return
    const rect = input.getBoundingClientRect()
    const gutter = 8
    const maxHeight = Math.max(180, Math.min(360, window.innerHeight - rect.bottom - gutter - 12))
    const shouldFlip = rect.bottom + 250 > window.innerHeight && rect.top > 270
    setPopoverStyle({
      left: Math.max(gutter, rect.left),
      top: shouldFlip ? Math.max(gutter, rect.top - maxHeight - gutter) : rect.bottom + gutter,
      width: Math.min(rect.width, window.innerWidth - Math.max(gutter, rect.left) - gutter),
      maxHeight,
    })
  }

  useEffect(() => {
    if (!open) return
    updatePopoverPosition()
    const update = () => updatePopoverPosition()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, query])

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setRemoteResults([])
      setLoading(false)
      setSearchError(null)
      return
    }
    let alive = true
    setLoading(true)
    setSearchError(null)
    const timer = window.setTimeout(() => {
      void searchPatientsFromSupabase(query).then((next) => {
        if (!alive) return
        setRemoteResults(next)
        setLoading(false)
      }).catch(() => {
        if (!alive) return
        setRemoteResults([])
        setLoading(false)
        setSearchError('Patients could not be loaded from the clinic database.')
      })
    }, 250)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [open, query])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Element
      if (!rootRef.current?.contains(target) && !target.closest('.patient-search-popover')) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    setActiveIndex(-1)
  }, [query, open])

  function selectPatient(patient: Patient) {
    setRemoteSelectedPatient(patient)
    onSelect(patient)
    setQuery('')
    setOpen(false)
    setRemoteResults([])
    setActiveIndex(-1)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && activeIndex >= 0 && results[activeIndex]) {
      event.preventDefault()
      selectPatient(results[activeIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const listContent = open && !disabled && typeof document !== 'undefined' ? createPortal(
    <div className="patient-search-popover" style={popoverStyle} role="listbox" id={listId} aria-label="Patient search results">
      {loading && <div className="patient-search-state"><LoaderCircle size={16} className="patient-search-spin" /> Searching patients...</div>}
      {!loading && searchError && <div className="patient-search-state is-error">{searchError}</div>}
      {!loading && !searchError && !query.trim() && <div className="patient-search-state">Start typing to search patients</div>}
      {!loading && !searchError && query.trim() && results.length === 0 && <div className="patient-search-state">No patients match “{query.trim()}”</div>}
      {!loading && !searchError && results.map((patient, index) => (
          <button
            key={patient.id}
            id={`${listId}-option-${patient.id}`}
          type="button"
          className={`patient-search-result ${index === activeIndex ? 'is-active' : ''}`.trim()}
          role="option"
          aria-selected={patient.id === selectedPatient?.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => selectPatient(patient)}
        >
          <span className="patient-search-avatar">{initials(patient)}</span>
          <span className="patient-search-copy">
            <strong>{getPatientDisplayName(patient)}</strong>
            <small>{patient.patientId}{patient.phone ? ` · ${patient.phone}` : ''}</small>
            {patient.email && <small>{patient.email}</small>}
          </span>
          {patient.id === selectedPatient?.id && <Check size={16} aria-hidden="true" />}
        </button>
      ))}
    </div>,
    document.body,
  ) : null

  return (
    <div className="patient-search-field" ref={rootRef}>
      {label && <label className="patient-search-label" htmlFor={`${listId}-input`}>{label}{required && <sup>*</sup>}</label>}
      {selectedPatient ? (
        <div className="patient-search-selected">
          <span className="patient-search-avatar">{initials(selectedPatient)}</span>
          <span className="patient-search-copy"><strong>{getPatientDisplayName(selectedPatient)}</strong><small>{selectedPatient.patientId}{selectedPatient.phone ? ` · ${selectedPatient.phone}` : ''}</small>{selectedPatient.email && <small>{selectedPatient.email}</small>}</span>
          <button type="button" className="patient-search-clear" onClick={() => { setRemoteSelectedPatient(null); onSelect(null); inputRef.current?.focus() }} disabled={disabled} aria-label="Clear selected patient"><X size={16} /></button>
        </div>
      ) : (
        <div className="patient-search-input-wrap">
          <Search size={17} aria-hidden="true" />
          <input
            ref={inputRef}
            id={`${listId}-input`}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={activeIndex >= 0 && results[activeIndex] ? `${listId}-option-${results[activeIndex].id}` : undefined}
            aria-autocomplete="list"
            value={query}
            onFocus={() => { setOpen(true); updatePopoverPosition() }}
            onClick={() => { setOpen(true); updatePopoverPosition() }}
            onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus={autoFocus}
            disabled={disabled}
            required={required}
          />
          <ChevronDown size={16} className="patient-search-chevron" aria-hidden="true" />
        </div>
      )}
      {(error || searchError) && <span className="patient-search-error" role="alert">{error || searchError}</span>}
      {listContent}
    </div>
  )
}
