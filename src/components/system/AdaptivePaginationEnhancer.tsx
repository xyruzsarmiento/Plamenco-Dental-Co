import { useEffect } from 'react'

type PageConfig = {
  selector: string
  itemSelector: string
  pageSize: number
}

const configs: PageConfig[] = [
  { selector: '.pv3-appointment-list', itemSelector: ':scope > .pv3-appointment-card', pageSize: 5 },
  { selector: '.pv3-record-list', itemSelector: ':scope > button', pageSize: 6 },
  { selector: '.pv3-treatment-list', itemSelector: ':scope > article', pageSize: 5 },
  { selector: '.pv3-rx-grid', itemSelector: ':scope > article', pageSize: 6 },
  { selector: '.pv3-invoice-list', itemSelector: ':scope > article', pageSize: 5 },
  { selector: '.pv3-payment-history', itemSelector: ':scope > div', pageSize: 6 },
  { selector: '.pv3-document-grid', itemSelector: ':scope > article', pageSize: 6 },
  { selector: '.pv3-activity', itemSelector: ':scope > div', pageSize: 4 },
]

const state = new WeakMap<Element, number>()

function buildPager(anchor: HTMLElement, items: HTMLElement[], pageSize: number) {
  const previous = anchor.parentElement?.querySelector<HTMLElement>(':scope > .app-auto-pagination')
  previous?.remove()
  if (items.length <= pageSize) {
    items.forEach((item) => { item.style.display = '' })
    return
  }

  const pages = Math.ceil(items.length / pageSize)
  const current = Math.min(state.get(anchor) ?? 0, pages - 1)
  state.set(anchor, current)
  items.forEach((item, index) => {
    item.style.display = index >= current * pageSize && index < (current + 1) * pageSize ? '' : 'none'
  })

  const nav = document.createElement('nav')
  nav.className = 'app-auto-pagination'
  nav.setAttribute('aria-label', 'Pagination')
  nav.innerHTML = `
    <span>Showing ${current * pageSize + 1}–${Math.min((current + 1) * pageSize, items.length)} of ${items.length}</span>
    <div>
      <button type="button" data-page="prev" ${current === 0 ? 'disabled' : ''} aria-label="Previous page">‹</button>
      <strong>${current + 1} / ${pages}</strong>
      <button type="button" data-page="next" ${current >= pages - 1 ? 'disabled' : ''} aria-label="Next page">›</button>
    </div>`

  nav.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-page]')
    if (!button || button.disabled) return
    const next = button.dataset.page === 'next' ? current + 1 : current - 1
    state.set(anchor, Math.max(0, Math.min(next, pages - 1)))
    buildPager(anchor, items, pageSize)
    anchor.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })

  anchor.insertAdjacentElement('afterend', nav)
}

function paginateConfiguredLists() {
  configs.forEach(({ selector, itemSelector, pageSize }) => {
    document.querySelectorAll<HTMLElement>(selector).forEach((container) => {
      const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector))
      buildPager(container, items, pageSize)
    })
  })
}

function paginateInternalTables() {
  document.querySelectorAll<HTMLTableSectionElement>('table tbody').forEach((tbody) => {
    if (tbody.closest('.pv3-shell')) return
    const table = tbody.closest<HTMLTableElement>('table')
    if (!table) return
    const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>(':scope > tr'))
    if (rows.length <= 12) {
      table.parentElement?.querySelector(':scope > .app-auto-pagination')?.remove()
      rows.forEach((row) => { row.style.display = '' })
      return
    }
    buildPager(table, rows, 12)
  })
}

function mutationOnlyTouchesPaginator(mutation: MutationRecord) {
  const changed = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
  return changed.length > 0 && changed.every((node) => node instanceof HTMLElement && node.classList.contains('app-auto-pagination'))
}

export function AdaptivePaginationEnhancer() {
  useEffect(() => {
    let frame = 0
    const apply = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        paginateConfiguredLists()
        paginateInternalTables()
      })
    }
    apply()
    const observer = new MutationObserver((mutations) => {
      if (mutations.every(mutationOnlyTouchesPaginator)) return
      apply()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('hashchange', apply)
    window.addEventListener('popstate', apply)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('hashchange', apply)
      window.removeEventListener('popstate', apply)
      document.querySelectorAll('.app-auto-pagination').forEach((node) => node.remove())
    }
  }, [])
  return null
}
