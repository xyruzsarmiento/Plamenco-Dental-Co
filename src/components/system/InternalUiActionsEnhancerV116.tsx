import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardCheck, ClipboardList, Plus, Truck } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../features/auth/AuthContext'
import { getStoredBranches } from '../../features/branches/branchStore'
import type { Branch } from '../../features/branches/branchTypes'
import { InventoryActionModal, type InventoryDialog } from '../../features/inventory/InventoryActionModal'
import { supabase } from '../../lib/supabase'

export function InternalUiActionsEnhancerV116() {
  const { user } = useAuth()
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [dialog, setDialog] = useState<InventoryDialog | null>(null)
  const [assignedBranchIds, setAssignedBranchIds] = useState<string[] | null>(null)
  const [primaryBranchId, setPrimaryBranchId] = useState<string | undefined>()

  useEffect(() => {
    const sync = () => setTarget(document.querySelector<HTMLElement>('.inventory-v22-hero-actions'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    if (user?.role !== 'staff' || !user.id || !supabase) {
      setAssignedBranchIds(null)
      setPrimaryBranchId(undefined)
      return () => { active = false }
    }

    void supabase
      .from('staff_branch_assignments')
      .select('branch_id,is_primary,status')
      .eq('profile_id', user.id)
      .eq('status', 'active')
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          if (import.meta.env.DEV) console.warn('[staff inventory actions]', error.message)
          setAssignedBranchIds([])
          return
        }
        const rows = data ?? []
        setAssignedBranchIds(rows.map((row) => String(row.branch_id)))
        setPrimaryBranchId(String(rows.find((row) => row.is_primary)?.branch_id ?? rows[0]?.branch_id ?? '') || undefined)
      })

    return () => { active = false }
  }, [user?.id, user?.role])

  const scopedBranches = useMemo<Branch[]>(() => {
    const branches = getStoredBranches()
    if (user?.role !== 'staff') return branches
    if (assignedBranchIds === null) return []
    const allowed = new Set(assignedBranchIds)
    return branches.filter((branch) => allowed.has(String(branch.id)))
  }, [assignedBranchIds, user?.role, target])

  if (!target || user?.role !== 'staff') return null

  const noAssignedBranch = assignedBranchIds !== null && scopedBranches.length === 0

  const actions = (
    <>
      <Button disabled={noAssignedBranch} icon={<Plus size={16} />} onClick={() => setDialog({ type: 'add_item' })}>Add Item</Button>
      <Button variant="secondary" icon={<Truck size={16} />} onClick={() => setDialog({ type: 'add_supplier' })}>Add Supplier</Button>
      <Button disabled={noAssignedBranch} variant="secondary" icon={<ClipboardList size={16} />} onClick={() => setDialog({ type: 'purchase_order' })}>Purchase Order</Button>
      <Button disabled={noAssignedBranch} variant="secondary" icon={<ClipboardCheck size={16} />} onClick={() => setDialog({ type: 'stock_count' })}>Stock Count</Button>
      {dialog && createPortal(
        <InventoryActionModal
          dialog={dialog}
          branches={scopedBranches}
          preferredBranchId={primaryBranchId}
          onClose={() => setDialog(null)}
          onSuccess={() => {
            setDialog(null)
            window.dispatchEvent(new CustomEvent('plamenco:inventory-updated'))
          }}
        />,
        document.body,
      )}
    </>
  )

  return createPortal(actions, target)
}
