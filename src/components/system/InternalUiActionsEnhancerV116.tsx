import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardCheck, ClipboardList, Plus, Truck } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../features/auth/AuthContext'
import { getStoredBranches } from '../../features/branches/branchStore'
import { InventoryActionModal, type InventoryDialog } from '../../features/inventory/InventoryActionModal'

export function InternalUiActionsEnhancerV116() {
  const { user } = useAuth()
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [dialog, setDialog] = useState<InventoryDialog | null>(null)

  useEffect(() => {
    const sync = () => setTarget(document.querySelector<HTMLElement>('.inventory-v22-hero-actions'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  if (!target || user?.role !== 'staff') return null

  const actions = (
    <>
      <Button icon={<Plus size={16} />} onClick={() => setDialog({ type: 'add_item' })}>Add Item</Button>
      <Button variant="secondary" icon={<Truck size={16} />} onClick={() => setDialog({ type: 'add_supplier' })}>Add Supplier</Button>
      <Button variant="secondary" icon={<ClipboardList size={16} />} onClick={() => setDialog({ type: 'purchase_order' })}>Purchase Order</Button>
      <Button variant="secondary" icon={<ClipboardCheck size={16} />} onClick={() => setDialog({ type: 'stock_count' })}>Stock Count</Button>
      {dialog && createPortal(
        <InventoryActionModal
          dialog={dialog}
          branches={getStoredBranches()}
          onClose={() => setDialog(null)}
          onSuccess={() => {
            setDialog(null)
            window.location.reload()
          }}
        />,
        document.body,
      )}
    </>
  )

  return createPortal(actions, target)
}
