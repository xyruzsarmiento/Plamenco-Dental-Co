import { useEffect } from 'react'

function normalizeDentistAssignment(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.appointments-v40 .journey-care-block > span').forEach((row) => {
    if (row.dataset.dentistAssignmentReady === 'true') return
    const children = Array.from(row.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    if (children.length < 2) return

    const avatar = children[0]
    const label = children[children.length - 1]
    const rawName = label.textContent?.trim() ?? ''
    avatar.remove()

    if (!rawName || /not assigned/i.test(rawName)) {
      label.textContent = 'Dentist not assigned'
      row.dataset.dentistAssignmentReady = 'true'
      return
    }

    const dentistName = rawName.replace(/^dr\.?\s*/i, '').trim()
    label.textContent = `Assigned to Dr. ${dentistName}`
    label.title = `Assigned to Dr. ${dentistName}`
    row.dataset.dentistAssignmentReady = 'true'
  })
}

export function AppointmentJourneyAvatarEnhancer() {
  useEffect(() => {
    normalizeDentistAssignment()

    const observer = new MutationObserver(() => {
      normalizeDentistAssignment()
    })

    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}
