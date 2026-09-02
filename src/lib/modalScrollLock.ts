let lockCount = 0
let previousBodyOverflow = ''
let previousHtmlOverflow = ''

export function acquireModalScrollLock() {
  if (typeof document === 'undefined') return () => {}
  if (lockCount === 0) {
    previousBodyOverflow = document.body.style.overflow
    previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    document.body.dataset.modalScrollLocked = 'true'
  }
  lockCount += 1
  let released = false
  return () => {
    if (released || typeof document === 'undefined') return
    released = true
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
      delete document.body.dataset.modalScrollLocked
      previousBodyOverflow = ''
      previousHtmlOverflow = ''
    }
  }
}

export function clearModalScrollLocks() {
  if (typeof document === 'undefined') return
  lockCount = 0
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  delete document.body.dataset.modalScrollLocked
  previousBodyOverflow = ''
  previousHtmlOverflow = ''
}
