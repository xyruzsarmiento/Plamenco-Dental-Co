import { useEffect } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getVisibleDialogs() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '.modal-backdrop [role="dialog"], .modal-backdrop > .modal, .treatment-drawer-backdrop [role="dialog"], .expense-modal-backdrop [role="dialog"]',
    ),
  ).filter((dialog) => {
    const style = window.getComputedStyle(dialog)
    return style.display !== 'none' && style.visibility !== 'hidden'
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
    let previousBodyOverflow = ''

    const activateTopDialog = () => {
      const dialogs = getVisibleDialogs()
      const nextDialog = dialogs.length ? dialogs[dialogs.length - 1] : null

      if (!nextDialog) {
        if (activeDialog) {
          document.body.style.overflow = previousBodyOverflow
          previouslyFocused?.focus()
        }
        activeDialog = null
        previouslyFocused = null
        return
      }

      if (nextDialog === activeDialog) return

      if (!activeDialog) {
        previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
        previousBodyOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
      }

      activeDialog = nextDialog
      if (!activeDialog.hasAttribute('tabindex')) activeDialog.setAttribute('tabindex', '-1')
      if (!activeDialog.hasAttribute('role')) activeDialog.setAttribute('role', 'dialog')
      activeDialog.setAttribute('aria-modal', 'true')

      queueMicrotask(() => {
        const firstFocusable = activeDialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        ;(firstFocusable ?? activeDialog)?.focus()
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

      const focusable = Array.from(activeDialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
      )

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
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const observer = new MutationObserver(activateTopDialog)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    document.addEventListener('keydown', onKeyDown)
    activateTopDialog()

    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', onKeyDown)
      if (activeDialog) document.body.style.overflow = previousBodyOverflow
    }
  }, [])

  return null
}
