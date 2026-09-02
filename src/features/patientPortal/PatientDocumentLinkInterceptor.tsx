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

async function downloadSignedFile(url: string, fileName: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Document download is unavailable.')
  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName || 'patient-document'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

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
        const { data, error } = await supabase.storage
          .from(PATIENT_DOCUMENT_BUCKET)
          .createSignedUrl(document.storagePath!, 300)

        if (error || !data?.signedUrl) {
          window.alert(error?.message?.toLowerCase().includes('not found')
            ? 'This document file is no longer available.'
            : 'Document download is unavailable.')
          return
        }

        try {
          await downloadSignedFile(data.signedUrl, document.fileName || fileName || 'patient-document')
        } catch (cause) {
          window.alert(cause instanceof Error ? cause.message : 'Document download is unavailable.')
        }
      })()
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
