import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ArrowRightLeft, ClipboardCheck, ClipboardList, MoreHorizontal, PackagePlus, Truck } from 'lucide-react'
import { Button } from '../ui/Button'

type InventoryActionToolbarProps = {
  canCreateItem: boolean
  canRecordMovement?: boolean
  canAdjustStock: boolean
  canManageSuppliers: boolean
  canCreatePurchaseOrder: boolean
  disableItemCreation?: boolean
  disableBranchRequiredActions?: boolean
  disabledReason?: string
  onAddItem: () => void
  onStockMovement?: () => void
  onStockCount: () => void
  onPurchaseOrder: () => void
  onAddSupplier: () => void
}

export function InventoryActionToolbar({
  canCreateItem,
  canRecordMovement = false,
  canAdjustStock,
  canManageSuppliers,
  canCreatePurchaseOrder,
  disableItemCreation = false,
  disableBranchRequiredActions = false,
  disabledReason = 'Choose a branch before creating branch-owned inventory records.',
  onAddItem,
  onStockMovement,
  onStockCount,
  onPurchaseOrder,
  onAddSupplier,
}: InventoryActionToolbarProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const hasOverflowActions = canManageSuppliers || canAdjustStock || canCreatePurchaseOrder
  const branchTitle = disableBranchRequiredActions ? disabledReason : undefined
  const itemTitle = disableItemCreation ? disabledReason : undefined

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function focusMenuItem(direction: 1 | -1 | 'first' | 'last') {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
    if (!items.length) return
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = direction === 'first'
      ? 0
      : direction === 'last'
        ? items.length - 1
        : activeIndex < 0
          ? 0
          : (activeIndex + direction + items.length) % items.length
    items[nextIndex]?.focus()
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
      window.setTimeout(() => focusMenuItem('first'), 0)
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusMenuItem(1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusMenuItem(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusMenuItem('first')
    } else if (event.key === 'End') {
      event.preventDefault()
      focusMenuItem('last')
    }
  }

  function runMenuAction(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div className="inv121-hero-actions inventory-action-toolbar">
      {canCreateItem && (
        <Button
          className="inventory-action-primary"
          disabled={disableItemCreation}
          icon={<PackagePlus size={16} />}
          title={itemTitle}
          onClick={onAddItem}
        >
          Add Item
        </Button>
      )}
      {canRecordMovement && (
        <Button
          className="inventory-action-secondary inv121-toolbar-secondary"
          disabled={disableBranchRequiredActions}
          icon={<ArrowRightLeft size={16} />}
          title={branchTitle}
          variant="secondary"
          onClick={onStockMovement ?? onStockCount}
        >
          Stock Movement
        </Button>
      )}
      {hasOverflowActions && (
        <div className={`inv121-more-actions ${canManageSuppliers || canAdjustStock || canCreatePurchaseOrder ? 'has-desktop-items' : ''}`.trim()} ref={rootRef}>
          <button
            ref={triggerRef}
            type="button"
            className="inv121-more-trigger"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            onKeyDown={handleTriggerKeyDown}
          >
            <MoreHorizontal size={16} />
            <span>More Actions</span>
          </button>
          {open && (
            <div className="inv121-more-menu" ref={menuRef} role="menu" aria-label="More inventory actions" onKeyDown={handleMenuKeyDown}>
              {canRecordMovement && (
                <button
                  type="button"
                  role="menuitem"
                  className="inv121-menu-mobile-only"
                  disabled={disableBranchRequiredActions}
                  title={branchTitle}
                  onClick={() => runMenuAction(onStockMovement ?? onStockCount)}
                >
                  <ArrowRightLeft size={15} />
                  <span>Stock Movement</span>
                </button>
              )}
              {canAdjustStock && (
                <button type="button" role="menuitem" disabled={disableBranchRequiredActions} title={branchTitle} onClick={() => runMenuAction(onStockCount)}>
                  <ClipboardCheck size={15} />
                  <span>Stock Count</span>
                </button>
              )}
              {canCreatePurchaseOrder && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={disableBranchRequiredActions}
                  title={branchTitle}
                  onClick={() => runMenuAction(onPurchaseOrder)}
                >
                  <ClipboardList size={15} />
                  <span>Create Purchase Order</span>
                </button>
              )}
              {canManageSuppliers && (
                <button type="button" role="menuitem" onClick={() => runMenuAction(onAddSupplier)}>
                  <Truck size={15} />
                  <span>Add Supplier</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
