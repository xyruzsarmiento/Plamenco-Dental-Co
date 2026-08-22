const initializedGroups = new WeakSet<SVGGElement>()
let observer: MutationObserver | null = null
let tooltip: HTMLDivElement | null = null

function ensureTooltip() {
  if (tooltip && document.body.contains(tooltip)) return tooltip
  tooltip = document.createElement('div')
  tooltip.className = 'appointment-volume-tooltip-v91'
  tooltip.setAttribute('role', 'status')
  tooltip.setAttribute('aria-live', 'polite')
  tooltip.hidden = true
  document.body.appendChild(tooltip)
  return tooltip
}

function readPointData(group: SVGGElement) {
  const label = group.querySelector<SVGTextElement>('.sa-appointments-chart-label')?.textContent?.trim() || 'Day'
  const value = group.querySelector<SVGTextElement>('.sa-appointments-chart-value')?.textContent?.trim() || '0'
  return { label, value }
}

function positionTooltip(group: SVGGElement) {
  const tip = ensureTooltip()
  const point = group.querySelector<SVGCircleElement>('.sa-appointments-chart-point')
  if (!point) return
  const rect = point.getBoundingClientRect()
  const tooltipRect = tip.getBoundingClientRect()
  const gutter = 10
  const centerX = rect.left + rect.width / 2
  let left = centerX - tooltipRect.width / 2
  left = Math.max(gutter, Math.min(left, window.innerWidth - tooltipRect.width - gutter))
  let top = rect.top - tooltipRect.height - 12
  if (top < gutter) top = rect.bottom + 12
  tip.style.left = `${Math.round(left)}px`
  tip.style.top = `${Math.round(top)}px`
}

function showTooltip(group: SVGGElement) {
  const tip = ensureTooltip()
  const { label, value } = readPointData(group)
  tip.innerHTML = `<span>${label}</span><strong>${value} appointment${value === '1' ? '' : 's'}</strong>`
  tip.hidden = false
  group.classList.add('is-interactive-active')
  requestAnimationFrame(() => positionTooltip(group))
}

function hideTooltip(group: SVGGElement) {
  group.classList.remove('is-interactive-active')
  if (tooltip) tooltip.hidden = true
}

function enhanceChart(root: ParentNode = document) {
  root.querySelectorAll<SVGGElement>('.sa-appointments-trend-card svg g').forEach((group) => {
    const point = group.querySelector<SVGCircleElement>('.sa-appointments-chart-point')
    if (!point || initializedGroups.has(group)) return
    initializedGroups.add(group)

    group.classList.add('appointment-volume-point-v91')
    group.setAttribute('tabindex', '0')
    group.setAttribute('role', 'button')
    const { label, value } = readPointData(group)
    group.setAttribute('aria-label', `${label}: ${value} appointment${value === '1' ? '' : 's'}`)

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    hit.classList.add('appointment-volume-hit-v91')
    hit.setAttribute('cx', point.getAttribute('cx') || '0')
    hit.setAttribute('cy', point.getAttribute('cy') || '0')
    hit.setAttribute('r', '18')
    group.insertBefore(hit, point)

    group.addEventListener('pointerenter', () => showTooltip(group))
    group.addEventListener('pointerleave', () => hideTooltip(group))
    group.addEventListener('focus', () => showTooltip(group))
    group.addEventListener('blur', () => hideTooltip(group))
    group.addEventListener('pointerdown', () => showTooltip(group))
  })
}

export function registerAppointmentTrendChartInteractivity() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  enhanceChart()
  if (observer) return
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) enhanceChart(node)
      })
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  window.addEventListener('resize', () => {
    const active = document.querySelector<SVGGElement>('.appointment-volume-point-v91.is-interactive-active')
    if (active && tooltip && !tooltip.hidden) positionTooltip(active)
  })
}
