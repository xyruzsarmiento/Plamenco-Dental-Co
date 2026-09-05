import { useEffect } from 'react'
import { acquireModalScrollLock } from '../../lib/modalScrollLock'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
}

function getVisibleDialogs() {
  const selectors = [
    '.modal-backdrop [role="dialog"]',
    '.modal-backdrop > .modal',
    '[class*="modal-backdrop"] [role="dialog"]',
    '[class*="drawer-backdrop"] [role="dialog"]',
    '.treatment-drawer-backdrop [role="dialog"]',
    '.expense-modal-backdrop [role="dialog"]',
    '[aria-modal="true"]',
  ].join(',')

  return Array.from(document.querySelectorAll<HTMLElement>(selectors)).filter(isVisible)
}

function getFocusable(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.hasAttribute('disabled') || element.getAttribute('aria-hidden') === 'true') return false
    return isVisible(element)
  })
}

function findCloseControl(dialog: HTMLElement): HTMLElement | null {
  const labelledClose = dialog.querySelector<HTMLElement>(
    '[data-modal-close], [aria-label*="close" i], .modal-close, .modal-close-button, .drawer-close-btn',
  )
  if (labelledClose) return labelledClose

  return Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
    const label = button.textContent?.trim().toLowerCase()
    return label === 'close' || label === 'cancel'
  }) ?? null
}

export function ModalAccessibilityManager() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null
    let previouslyFocused: HTMLElement | null = null
    let releaseScrollLock: (() => void) | null = null

    const deactivateDialog = () => {
      if (!activeDialog) return
      activeDialog.removeAttribute('data-focus-trap-active')
      activeDialog = null
    }

    const activateTopDialog = () => {
      const dialogs = getVisibleDialogs()
      const nextDialog = dialogs.length ? dialogs[dialogs.length - 1] : null

      if (!nextDialog) {
        if (activeDialog) {
          deactivateDialog()
          releaseScrollLock?.()
          releaseScrollLock = null
          if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus()
        }
        previouslyFocused = null
        return
      }

      if (nextDialog === activeDialog) return

      if (!activeDialog) {
        previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
        releaseScrollLock = acquireModalScrollLock()
      } else {
        deactivateDialog()
      }

      activeDialog = nextDialog
      if (!activeDialog.hasAttribute('tabindex')) activeDialog.setAttribute('tabindex', '-1')
      if (!activeDialog.hasAttribute('role')) activeDialog.setAttribute('role', 'dialog')
      activeDialog.setAttribute('aria-modal', 'true')
      activeDialog.setAttribute('data-focus-trap-active', 'true')

      queueMicrotask(() => {
        if (!activeDialog) return
        const preferred = activeDialog.querySelector<HTMLElement>('[autofocus], [data-initial-focus]')
        const firstFocusable = preferred && isVisible(preferred) ? preferred : getFocusable(activeDialog)[0]
        ;(firstFocusable ?? activeDialog).focus()
      })
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeDialog) return

      if (event.key === 'Escape') {
        const closeControl = findCloseControl(activeDialog)
        if (closeControl) {
          event.preventDefault()
          closeControl.click()
        }
        return
      }

      if (event.key !== 'Tab') return

      const focusable = getFocusable(activeDialog)
      if (!focusable.length) {
        event.preventDefault()
        activeDialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement

      if (event.shiftKey && (current === first || !activeDialog.contains(current))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (current === last || !activeDialog.contains(current))) {
        event.preventDefault()
        first.focus()
      }
    }

    const onFocusIn = (event: FocusEvent) => {
      if (!activeDialog || !(event.target instanceof Node)) return
      if (activeDialog.contains(event.target)) return
      const firstFocusable = getFocusable(activeDialog)[0]
      ;(firstFocusable ?? activeDialog).focus()
    }

    const observer = new MutationObserver(activateTopDialog)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-hidden', 'aria-modal'],
    })
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    activateTopDialog()

    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      if (activeDialog) {
        deactivateDialog()
        releaseScrollLock?.()
        releaseScrollLock = null
      }
    }
  }, [])

  return null
}
