import { useEffect } from 'react'

const SUCCESS = new Set(['confirmed', 'completed', 'accepted', 'presented', 'paid', 'active', 'available', 'updated'])
const WARNING = new Set(['pending', 'awaiting confirmation', 'planned', 'processing', 'preparing', 'waiting', 'checked in', 'in progress', 'partially paid'])
const DANGER = new Set(['rejected', 'not approved', 'cancelled', 'failed', 'declined', 'missed'])

function semanticClass(text: string) {
  const value = text.trim().toLowerCase().replaceAll('_', ' ')
  if (SUCCESS.has(value)) return 'pv-semantic-success'
  if (WARNING.has(value)) return 'pv-semantic-warning'
  if (DANGER.has(value)) return 'pv-semantic-danger'
  return 'pv-semantic-info'
}

export function PatientPortalSemanticStatusEnhancer() {
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll<HTMLElement>('.pv5-upcoming-card > em, .pv3-plan-summary .badge, .pv3-treatment-hero .badge').forEach((node) => {
        node.classList.remove('pv-semantic-success', 'pv-semantic-warning', 'pv-semantic-danger', 'pv-semantic-info')
        node.classList.add(semanticClass(node.textContent ?? ''))
      })
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  return null
}
