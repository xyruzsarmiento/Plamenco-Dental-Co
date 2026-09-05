let lockCount = 0
let previousBodyOverflow = ''
let previousHtmlOverflow = ''
let lockGeneration = 0

function restoreScroll() {
  const nextBodyOverflow = previousBodyOverflow === 'hidden' ? '' : previousBodyOverflow
  const nextHtmlOverflow = previousHtmlOverflow === 'hidden' ? '' : previousHtmlOverflow
  document.body.style.overflow = nextBodyOverflow
  document.documentElement.style.overflow = nextHtmlOverflow
  delete document.body.dataset.modalScrollLocked
  previousBodyOverflow = ''
  previousHtmlOverflow = ''
}

export function acquireModalScrollLock() {
  if (typeof document === 'undefined') return () => {}
  const generation = lockGeneration
  if (lockCount === 0) {
    const staleLock = document.body.dataset.modalScrollLocked === 'true'
    previousBodyOverflow = staleLock ? '' : document.body.style.overflow
    previousHtmlOverflow = staleLock ? '' : document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    document.body.dataset.modalScrollLocked = 'true'
  }
  lockCount += 1
  let released = false
  return () => {
    if (released || typeof document === 'undefined') return
    released = true
    if (generation !== lockGeneration) return
    lockCount = Math.max(0, lockCount - 1)
    if (lockCount === 0) {
      restoreScroll()
    }
  }
}

export function clearModalScrollLocks() {
  if (typeof document === 'undefined') return
  lockGeneration += 1
  lockCount = 0
  restoreScroll()
}
