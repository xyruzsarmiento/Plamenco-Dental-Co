import { useEffect } from 'react'
import { supabase } from '../../lib/supabase'

type CachedPatientDocument = {
  id: string
  fileName: string
  storagePath?: string
  patientVisible?: boolean
}

const DOCUMENT_STORAGE_KEY = 'plamenco.documents'
const PATIENT_DOCUMENT_BUCKET = 'patient-documents'

function cachedDocuments(): CachedPatientDocument[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DOCUMENT_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function PatientDocumentLinkInterceptor() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest<HTMLAnchorElement>('a.portal-link')
      if (!link) return
      const card = link.closest('.portal-premium-card')
      const fileName = card?.querySelector('strong')?.textContent?.trim()
      const documentId = link.dataset.patientDocumentId
      if (!fileName && !documentId) return

      const document = cachedDocuments().find((entry) => (
        documentId ? entry.id === documentId : entry.fileName === fileName
      ) && entry.patientVisible !== false)
      if (!document?.storagePath || !supabase) return

      event.preventDefault()
      event.stopPropagation()

      void (async () => {
        const opened = window.open('', '_blank', 'noopener,noreferrer')
        const { data, error } = await supabase.storage
          .from(PATIENT_DOCUMENT_BUCKET)
          .createSignedUrl(document.storagePath!, 300)

        if (error || !data?.signedUrl) {
          opened?.close()
          window.alert('This document could not be opened. Please refresh the portal and try again.')
          return
        }

        if (opened) opened.location.href = data.signedUrl
        else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      })()
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
