const initialized = new WeakSet<Element>()
let observer: MutationObserver | null = null
let tooltip: HTMLDivElement | null = null
let activeElement: HTMLElement | SVGElement | null = null

function ensureTooltip() {
  if (tooltip && document.body.contains(tooltip)) return tooltip
  tooltip = document.createElement('div')
  tooltip.className = 'analytics-tooltip-v92'
  tooltip.setAttribute('role', 'status')
  tooltip.setAttribute('aria-live', 'polite')
  tooltip.hidden = true
  document.body.appendChild(tooltip)
  return tooltip
}

function positionTooltip(target: Element, clientX?: number, clientY?: number) {
  const tip = ensureTooltip()
  const targetRect = target.getBoundingClientRect()
  const tipRect = tip.getBoundingClientRect()
  const gutter = 10
  const centerX = clientX ?? (targetRect.left + targetRect.width / 2)
  let left = centerX - tipRect.width / 2
  left = Math.max(gutter, Math.min(left, window.innerWidth - tipRect.width - gutter))
  let top = (clientY ?? targetRect.top) - tipRect.height - 12
  if (top < gutter) top = targetRect.bottom + 12
  tip.style.left = `${Math.round(left)}px`
  tip.style.top = `${Math.round(top)}px`
}

function showTooltip(target: HTMLElement | SVGElement, title: string, value: string, detail?: string, x?: number, y?: number) {
  const tip = ensureTooltip()
  tip.replaceChildren()
  const titleNode = document.createElement('span')
  titleNode.textContent = title
  const valueNode = document.createElement('strong')
  valueNode.textContent = value
  tip.append(titleNode, valueNode)
  if (detail) {
    const detailNode = document.createElement('small')
    detailNode.textContent = detail
    tip.append(detailNode)
  }
  tip.hidden = false
  activeElement?.classList.remove('is-analytics-active-v92')
  activeElement = target
  target.classList.add('is-analytics-active-v92')
  requestAnimationFrame(() => positionTooltip(target, x, y))
}

function hideTooltip(target?: HTMLElement | SVGElement) {
  target?.classList.remove('is-analytics-active-v92')
  if (activeElement === target) activeElement = null
  if (tooltip) tooltip.hidden = true
}

function bindInteractive(target: HTMLElement | SVGElement, read: () => { title: string; value: string; detail?: string }) {
  if (initialized.has(target)) return
  initialized.add(target)
  target.classList.add('analytics-interactive-v92')
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '0')
  if (!target.hasAttribute('role')) target.setAttribute('role', 'button')
  const initial = read()
  target.setAttribute('aria-label', [initial.title, initial.value, initial.detail].filter(Boolean).join(': '))

  target.addEventListener('pointerenter', (event) => {
    const data = read()
    showTooltip(target, data.title, data.value, data.detail, (event as PointerEvent).clientX, (event as PointerEvent).clientY)
  })
  target.addEventListener('pointermove', (event) => {
    const data = read()
    showTooltip(target, data.title, data.value, data.detail, (event as PointerEvent).clientX, (event as PointerEvent).clientY)
  })
  target.addEventListener('pointerleave', () => hideTooltip(target))
  target.addEventListener('focus', () => {
    const data = read()
    showTooltip(target, data.title, data.value, data.detail)
  })
  target.addEventListener('blur', () => hideTooltip(target))
  target.addEventListener('pointerdown', (event) => {
    const data = read()
    showTooltip(target, data.title, data.value, data.detail, (event as PointerEvent).clientX, (event as PointerEvent).clientY)
  })
}

function enhanceDashboardCharts(root: ParentNode) {
  root.querySelectorAll<SVGGElement>('.dashboard-chart-card svg g').forEach((group) => {
    const point = group.querySelector<SVGCircleElement>('.dashboard-chart-point')
    if (!point || initialized.has(group)) return
    const titleText = group.querySelector('title')?.textContent?.trim() || ''
    const label = group.querySelector<SVGTextElement>('.dashboard-chart-label')?.textContent?.trim() || 'Data point'
    const valueText = titleText.includes(':') ? titleText.slice(titleText.indexOf(':') + 1).trim() : titleText || 'No value'
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    hit.classList.add('dashboard-chart-hit-v92')
    hit.setAttribute('cx', point.getAttribute('cx') || '0')
    hit.setAttribute('cy', point.getAttribute('cy') || '0')
    hit.setAttribute('r', '18')
    group.insertBefore(hit, point)
    bindInteractive(group, () => ({ title: label, value: valueText, detail: 'Hover, tap, or focus for exact value' }))
  })

  root.querySelectorAll<HTMLElement>('.dashboard-bar-row').forEach((row) => {
    bindInteractive(row, () => ({
      title: row.querySelector('.dashboard-bar-meta span')?.textContent?.trim() || 'Distribution',
      value: row.querySelector('.dashboard-bar-meta strong')?.textContent?.trim() || '0',
      detail: 'Current recorded value',
    }))
  })
}

function enhanceBillingCharts(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('.bill14-bar-col').forEach((column) => {
    bindInteractive(column, () => ({
      title: column.querySelector('small')?.textContent?.trim() || 'Collections',
      value: column.querySelector('strong')?.textContent?.trim() || '₱0',
      detail: 'Completed collections for this day',
    }))
  })

  root.querySelectorAll<HTMLElement>('.bill14-flow-list > div').forEach((item) => {
    bindInteractive(item, () => ({
      title: item.querySelector('span')?.textContent?.trim() || 'Collection pipeline',
      value: item.querySelector('strong')?.textContent?.trim() || '0',
      detail: 'Current account-health metric',
    }))
  })

  root.querySelectorAll<HTMLElement>('.bill14-progress').forEach((progress) => {
    if (initialized.has(progress)) return
    const fill = progress.querySelector<HTMLElement>('span')
    bindInteractive(progress, () => ({
      title: 'Collection rate',
      value: fill?.style.width || '0%',
      detail: 'Collections as a share of billed amount',
    }))
  })
}

function enhanceExistingInteractiveCharts(root: ParentNode) {
  const selectors = [
    '.tx45-ranked-row',
    '.tx45-compare-row',
    '.svc52-demand-row',
    '.svc52-value-row',
    '.rpt54-row',
  ].join(',')
  root.querySelectorAll<HTMLElement>(selectors).forEach((row) => row.classList.add('analytics-native-interactive-v92'))
}

function enhance(root: ParentNode = document) {
  enhanceDashboardCharts(root)
  enhanceBillingCharts(root)
  enhanceExistingInteractiveCharts(root)
}

export function registerAnalyticsChartInteractivity() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  enhance()
  if (observer) return
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) enhance(node)
      })
    }
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })

  window.addEventListener('resize', () => {
    if (activeElement && tooltip && !tooltip.hidden) positionTooltip(activeElement)
  })
  window.addEventListener('scroll', () => {
    if (activeElement && tooltip && !tooltip.hidden) positionTooltip(activeElement)
  }, true)
}
