import { useEffect, useState } from 'react'
import { useAuth } from '../features/auth/AuthContext'
import { useBranchContext } from '../features/branches/BranchContext'
import { mapSupabasePatientRow, saveStoredPatients } from '../features/patients/patientStore'
import { supabase } from '../lib/supabase'
import { DocumentsBranchWorkspaceV127 } from './DocumentsBranchWorkspaceV127'

export function DocumentsLiveWorkspaceV131() {
  const { user } = useAuth()
  const { activeBranchId, isAllBranchesMode } = useBranchContext()
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let alive = true

    async function hydratePatients() {
      if (!supabase) {
        if (alive) setState('ready')
        return
      }

      setState('loading')
      setError(null)
      const { data, error: queryError } = await supabase
        .from('patients')
        .select('*')
        .eq('status', 'active')
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })

      if (!alive) return
      if (queryError) {
        setError(`Unable to prepare the patient document workspace: ${queryError.message}`)
        setState('error')
        return
      }

      saveStoredPatients((data ?? []).map((row) => mapSupabasePatientRow(row as Record<string, any>)))
      setRevision((value) => value + 1)
      setState('ready')
    }

    void hydratePatients()
    return () => { alive = false }
  }, [activeBranchId, isAllBranchesMode, user?.id])

  if (state === 'loading') {
    return <section className="doc127-page"><div className="doc127-state" role="status">Loading live patient records for document management…</div></section>
  }

  if (state === 'error') {
    return <section className="doc127-page"><div className="doc127-error" role="alert">{error}</div></section>
  }

  return <DocumentsBranchWorkspaceV127 key={`documents-live:${user?.id ?? 'guest'}:${activeBranchId ?? 'all'}:${revision}`} />
}
