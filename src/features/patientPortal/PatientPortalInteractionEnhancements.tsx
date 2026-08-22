import { useEffect } from 'react'

function closeEnhancementModal() {
  document.querySelector('.pv4-detail-backdrop')?.remove()
}

function createDetailModal(title: string, subtitle: string, bodyHtml: string) {
  closeEnhancementModal()
  const backdrop = document.createElement('div')
  backdrop.className = 'pv4-detail-backdrop'
  backdrop.innerHTML = `
    <section class="pv4-detail-modal" role="dialog" aria-modal="true" aria-label="${title.replaceAll('"', '&quot;')}">
      <header>
        <div><span>CARE DETAILS</span><h2>${title}</h2><p>${subtitle}</p></div>
        <button type="button" class="pv4-detail-close" aria-label="Close details">×</button>
      </header>
      <div class="pv4-detail-body">${bodyHtml}</div>
      <footer><button type="button" class="pv4-detail-done">Done</button></footer>
    </section>`
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) closeEnhancementModal()
  })
  backdrop.querySelector('.pv4-detail-close')?.addEventListener('click', closeEnhancementModal)
  backdrop.querySelector('.pv4-detail-done')?.addEventListener('click', closeEnhancementModal)
  document.body.appendChild(backdrop)
}

export function PatientPortalInteractionEnhancements() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return

      const treatment = target.closest<HTMLElement>('.pv3-treatment-list article')
      if (treatment) {
        const title = treatment.querySelector('h4')?.textContent?.trim() || 'Treatment item'
        const status = treatment.querySelector('.badge')?.textContent?.trim() || 'Care item'
        const description = treatment.querySelector('p')?.textContent?.trim() || 'No additional description was shared.'
        const footer = treatment.querySelector('footer')?.innerHTML || ''
        const tooth = Array.from(treatment.querySelectorAll('small')).map((node) => node.textContent?.trim()).find((value) => value?.toLowerCase().includes('tooth')) || 'Not specified'
        createDetailModal(
          title,
          status,
          `<div class="pv4-detail-kpis"><div><span>Status</span><strong>${status}</strong></div><div><span>Tooth</span><strong>${tooth}</strong></div></div><section><span>Treatment summary</span><p>${description}</p></section><section><span>Schedule & fee</span><div class="pv4-detail-footer-copy">${footer}</div></section><aside>Only patient-visible treatment information is shown here. Clinical notes remain private to your care team.</aside>`,
        )
        return
      }

      const plan = target.closest<HTMLElement>('.pv3-plan-summary, .pv3-treatment-hero > section')
      if (plan) {
        const title = plan.querySelector('strong, h3')?.textContent?.trim() || 'Current care plan'
        const percentage = plan.textContent?.match(/\d+%/)?.[0] || '0%'
        const description = plan.querySelector('p')?.textContent?.trim() || 'Your current treatment progress.'
        createDetailModal(
          title,
          `${percentage} complete`,
          `<div class="pv4-progress-detail"><div class="pv4-progress-ring" style="--pv4-progress:${percentage}"><strong>${percentage}</strong><span>complete</span></div><div><span>Care-plan progress</span><h3>${title}</h3><p>${description}</p></div></div><aside>Progress updates as treatment items are completed by your clinic.</aside>`,
        )
      }
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeEnhancementModal()
    }

    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
      closeEnhancementModal()
    }
  }, [])

  return null
}
