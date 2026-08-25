import { useEffect } from 'react'
import { useAuth } from '../../features/auth/AuthContext'
import { supabase } from '../../lib/supabase'

function isInventoryRoute() {
  return typeof window !== 'undefined' && window.location.pathname === '/app/inventory'
}

export function InventoryBranchScopeEnhancerV118() {
  const { user } = useAuth()

  useEffect(() => {
    let cancelled = false
    let observer: MutationObserver | null = null
    let allowedIds = new Set<string>()
    let knownBranchIds = new Set<string>()
    let primaryId = ''
    let branchScopeLoaded = user?.role !== 'staff'

    const enforceStaffScope = () => {
      if (!isInventoryRoute() || user?.role !== 'staff' || !branchScopeLoaded) return

      document.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
        const optionValues = Array.from(select.options).map((option) => option.value)
        const isBranchSelect = optionValues.some((value) => knownBranchIds.has(value))
        if (!isBranchSelect) return

        Array.from(select.options).forEach((option) => {
          if (knownBranchIds.has(option.value)) {
            const allowed = allowedIds.has(option.value)
            option.disabled = !allowed
            option.hidden = !allowed
          }
          if (option.value === 'all') {
            option.disabled = true
            option.hidden = true
          }
        })

        if ((!allowedIds.has(select.value) || select.value === 'all') && primaryId && optionValues.includes(primaryId)) {
          select.value = primaryId
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })

      const page = document.querySelector<HTMLElement>('.page-stack')
      if (page) {
        const message = allowedIds.size
          ? 'Staff inventory access is limited to your assigned branch.'
          : 'No active branch assignment was found. Inventory changes are disabled until a branch is assigned by Super Admin.'
        let note = page.querySelector<HTMLElement>('[data-inventory-branch-scope-note]')
        if (!note) {
          note = document.createElement('div')
          note.dataset.inventoryBranchScopeNote = 'true'
          note.className = 'inventory-branch-scope-note-v118'
          page.prepend(note)
        }
        if (note.textContent !== message) note.textContent = message
      }

      if (!allowedIds.size) {
        document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
          const label = button.textContent?.trim().toLowerCase() ?? ''
          if (['stock in', 'stock out', 'adjust', 'stock count', 'purchase order', 'add item'].some((action) => label.includes(action))) {
            button.disabled = true
            button.setAttribute('aria-disabled', 'true')
            button.title = 'Assign this staff account to a branch before changing inventory.'
          }
        })
      }
    }

    const syncRoute = () => {
      const active = isInventoryRoute()
      document.documentElement.classList.toggle('inventory-route-v118', active)
      if (active) enforceStaffScope()
    }

    const loadStaffScope = async () => {
      if (!user || user.role !== 'staff' || !supabase) return
      const [{ data: assignments, error: assignmentError }, { data: branchRows, error: branchError }] = await Promise.all([
        supabase
          .from('staff_branch_assignments')
          .select('branch_id,is_primary,status')
          .eq('profile_id', user.id)
          .eq('status', 'active'),
        supabase.from('branches').select('id,name').eq('status', 'active'),
      ])

      if (cancelled) return
      branchScopeLoaded = true
      if (assignmentError || branchError) {
        if (import.meta.env.DEV) console.warn('[inventory branch scope]', assignmentError?.message || branchError?.message)
        syncRoute()
        return
      }

      allowedIds = new Set((assignments ?? []).map((row) => String(row.branch_id)))
      knownBranchIds = new Set((branchRows ?? []).map((row) => String(row.id)))
      primaryId = String((assignments ?? []).find((row) => row.is_primary)?.branch_id ?? (assignments ?? [])[0]?.branch_id ?? '')
      syncRoute()
    }

    syncRoute()
    void loadStaffScope()

    observer = new MutationObserver(syncRoute)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', syncRoute)

    return () => {
      cancelled = true
      observer?.disconnect()
      window.removeEventListener('popstate', syncRoute)
      document.documentElement.classList.remove('inventory-route-v118')
    }
  }, [user?.id, user?.role])

  return null
}
