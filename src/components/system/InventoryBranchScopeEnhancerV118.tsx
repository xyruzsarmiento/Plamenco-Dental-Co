import { useEffect } from 'react'
import { useAuth } from '../../features/auth/AuthContext'
import { supabase } from '../../lib/supabase'

function isInventoryRoute() {
  return typeof window !== 'undefined' && window.location.pathname === '/app/inventory'
}

export function InventoryBranchScopeEnhancerV118() {
  const { user } = useAuth()

  useEffect(() => {
    if (!isInventoryRoute()) return undefined

    document.documentElement.classList.add('inventory-route-v118')

    let observer: MutationObserver | null = null
    let cancelled = false

    const cleanup = () => {
      observer?.disconnect()
      document.documentElement.classList.remove('inventory-route-v118')
    }

    if (!user || user.role !== 'staff' || !supabase) return cleanup

    const applyScope = async () => {
      const [{ data: assignments, error: assignmentError }, { data: branchRows, error: branchError }] = await Promise.all([
        supabase
          .from('staff_branch_assignments')
          .select('branch_id,is_primary,status')
          .eq('profile_id', user.id)
          .eq('status', 'active'),
        supabase.from('branches').select('id,name').eq('status', 'active'),
      ])

      if (cancelled) return
      if (assignmentError || branchError) {
        if (import.meta.env.DEV) console.warn('[inventory branch scope]', assignmentError?.message || branchError?.message)
        return
      }

      const allowedIds = new Set((assignments ?? []).map((row) => String(row.branch_id)))
      const knownBranchIds = new Set((branchRows ?? []).map((row) => String(row.id)))
      const primaryId = String((assignments ?? []).find((row) => row.is_primary)?.branch_id ?? (assignments ?? [])[0]?.branch_id ?? '')

      const enforce = () => {
        if (!isInventoryRoute()) return

        document.querySelectorAll<HTMLSelectElement>('select').forEach((select) => {
          const optionValues = Array.from(select.options).map((option) => option.value)
          const isBranchSelect = optionValues.some((value) => knownBranchIds.has(value))
          if (!isBranchSelect) return

          Array.from(select.options).forEach((option) => {
            if (knownBranchIds.has(option.value) && !allowedIds.has(option.value)) {
              option.disabled = true
              option.hidden = true
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

        document.querySelectorAll<HTMLElement>('[data-inventory-branch-scope-note]').forEach((node) => node.remove())
        const page = document.querySelector<HTMLElement>('.page-stack')
        if (page && !page.querySelector('[data-inventory-branch-scope-note]')) {
          const note = document.createElement('div')
          note.dataset.inventoryBranchScopeNote = 'true'
          note.className = 'inventory-branch-scope-note-v118'
          note.textContent = allowedIds.size
            ? 'Staff inventory access is limited to your assigned branch.'
            : 'No active branch assignment was found. Inventory changes are disabled until a branch is assigned by Super Admin.'
          page.prepend(note)
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

      enforce()
      observer = new MutationObserver(enforce)
      observer.observe(document.body, { childList: true, subtree: true })
    }

    void applyScope()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [user?.id, user?.role])

  return null
}
