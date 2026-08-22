import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

type PersistenceFailure = {
  operation?: string
  table?: string
  error?: { message?: string } | string
}

function messageFromFailure(failure: PersistenceFailure) {
  const detail = typeof failure.error === 'string' ? failure.error : failure.error?.message
  const target = failure.table ? failure.table.replaceAll('_', ' ') : 'clinic record'
  return detail
    ? `The ${target} change was not saved to Supabase: ${detail}`
    : `The ${target} change was not saved to Supabase. Please retry.`
}

export function PersistenceStatusNotice() {
  const [failure, setFailure] = useState<PersistenceFailure | null>(null)

  useEffect(() => {
    function onPersistenceError(event: Event) {
      const custom = event as CustomEvent<PersistenceFailure>
      setFailure(custom.detail ?? {})
    }

    window.addEventListener('plamenco:persistence-error', onPersistenceError)
    return () => window.removeEventListener('plamenco:persistence-error', onPersistenceError)
  }, [])

  if (!failure) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 5000,
        width: 'min(440px, calc(100vw - 32px))',
        display: 'grid',
        gridTemplateColumns: '38px minmax(0, 1fr) 32px',
        alignItems: 'start',
        gap: 10,
        padding: 14,
        border: '1px solid #fecaca',
        borderRadius: 16,
        background: '#fff',
        boxShadow: '0 20px 55px rgba(15, 23, 42, .16)',
      }}
    >
      <span style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 11, background: '#fff1f2', color: '#e11d48' }}>
        <AlertTriangle size={18} />
      </span>
      <div>
        <strong style={{ display: 'block', marginBottom: 3, color: '#0f172a', fontSize: 13 }}>Database save failed</strong>
        <span style={{ display: 'block', color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>{messageFromFailure(failure)}</span>
        <small style={{ display: 'block', marginTop: 5, color: '#94a3b8', fontSize: 10 }}>The app will no longer silently treat this as a successful cloud save.</small>
      </div>
      <button
        type="button"
        aria-label="Dismiss database error"
        onClick={() => setFailure(null)}
        style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', border: 0, borderRadius: 9, background: '#f8fafc', color: '#64748b', cursor: 'pointer' }}
      >
        <X size={15} />
      </button>
    </div>
  )
}
