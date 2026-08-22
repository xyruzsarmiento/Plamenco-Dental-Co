const ADMIN_PARITY_STYLE_ID = 'plamenco-admin-super-admin-parity'

const ADMIN_RESPONSIVE_SAFETY = `
/* Final Admin responsiveness safety layer. Keeps mirrored Super Admin workspaces usable on smaller devices. */
.role-admin .content-area,
.role-admin .content-area > *,
.role-admin .page-stack,
.role-admin [class*="workspace"],
.role-admin [class*="-page-v"] { min-width: 0; max-width: 100%; }

.role-admin .table-scroll,
.role-admin .table-container,
.role-admin [class*="table-wrap"],
.role-admin [class*="table-shell"],
.role-admin [class*="ledger-shell"] { max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }

.role-admin .toolbar,
.role-admin .page-toolbar,
.role-admin .table-toolbar,
.role-admin .filters,
.role-admin .filter-row,
.role-admin [class*="toolbar"],
.role-admin [class*="filter-bar"] { max-width: 100%; flex-wrap: wrap; }

.role-admin .modal-backdrop,
.role-admin [class*="modal-backdrop"],
.role-admin [class*="dialog-backdrop"] { box-sizing: border-box; overflow: auto; overscroll-behavior: contain; }

.role-admin [role="dialog"],
.role-admin [class*="modal-backdrop"] > section,
.role-admin [class*="dialog-backdrop"] > section { max-width: calc(100vw - 32px); max-height: calc(100dvh - 32px); overflow: auto; overscroll-behavior: contain; }

.role-admin [role="dialog"] input,
.role-admin [role="dialog"] select,
.role-admin [role="dialog"] textarea,
.role-admin [class*="-modal"] input,
.role-admin [class*="-modal"] select,
.role-admin [class*="-modal"] textarea { max-width: 100%; min-width: 0; }

@media (max-width: 900px) {
  .role-admin .content-area { padding: 14px 12px 28px !important; overflow-x: clip; }
  .role-admin .page-header,
  .role-admin [class*="header"] { min-width: 0; }
  .role-admin [class*="header-actions"] { flex-wrap: wrap; max-width: 100%; }
  .role-admin [class*="kpi-grid"],
  .role-admin [class*="metric-grid"],
  .role-admin [class*="metrics-grid"],
  .role-admin [class*="stats-grid"],
  .role-admin [class*="summary-grid"],
  .role-admin [class*="insights-grid"],
  .role-admin [class*="overview-grid"],
  .role-admin [class*="analytics-grid"],
  .role-admin [class*="main-grid"],
  .role-admin [class*="secondary-grid"],
  .role-admin [class*="lower-grid"] { grid-template-columns: 1fr !important; }
  .role-admin .content-area table { display: block; width: 100%; max-width: 100%; overflow-x: auto; white-space: nowrap; -webkit-overflow-scrolling: touch; }
  .role-admin .modal-backdrop,
  .role-admin [class*="modal-backdrop"],
  .role-admin [class*="dialog-backdrop"] { padding: 12px !important; }
  .role-admin [role="dialog"],
  .role-admin [class*="modal-backdrop"] > section,
  .role-admin [class*="dialog-backdrop"] > section { width: min(100%, calc(100vw - 24px)) !important; max-width: calc(100vw - 24px) !important; max-height: calc(100dvh - 24px) !important; }
}

@media (max-width: 640px) {
  .role-admin .content-area { padding: 12px 10px 24px !important; }
  .role-admin .page-header,
  .role-admin [class*="header"] { flex-direction: column; align-items: stretch; gap: 12px; }
  .role-admin [class*="header-actions"],
  .role-admin .page-header .action-buttons { display: grid !important; grid-template-columns: 1fr !important; width: 100%; }
  .role-admin [class*="header-actions"] > button,
  .role-admin [class*="header-actions"] > a,
  .role-admin .page-header .action-buttons > * { width: 100%; justify-content: center; }
  .role-admin .modal-backdrop,
  .role-admin [class*="modal-backdrop"],
  .role-admin [class*="dialog-backdrop"] { padding: 0 !important; align-items: flex-end !important; }
  .role-admin [role="dialog"],
  .role-admin [class*="modal-backdrop"] > section,
  .role-admin [class*="dialog-backdrop"] > section { width: 100vw !important; max-width: 100vw !important; max-height: min(92dvh, 900px) !important; margin: auto 0 0 !important; border-radius: 20px 20px 0 0 !important; border-bottom: 0 !important; }
  .role-admin [role="dialog"] [class*="grid"],
  .role-admin [class*="-modal"] [class*="grid"] { grid-template-columns: 1fr !important; }
  .role-admin [role="dialog"] footer,
  .role-admin [class*="-modal"] footer,
  .role-admin [class*="modal-actions"] { flex-wrap: wrap; }
  .role-admin [role="dialog"] footer > button,
  .role-admin [class*="-modal"] footer > button,
  .role-admin [class*="modal-actions"] > button { flex: 1 1 100%; width: 100%; }
}
`

function mirrorRule(rule: CSSRule): string {
  if (rule.type === CSSRule.STYLE_RULE) {
    const styleRule = rule as CSSStyleRule
    if (!styleRule.selectorText?.includes('.role-super_admin')) return ''
    if (/system[-_ ]?admin/i.test(styleRule.selectorText)) return ''
    return styleRule.cssText.replaceAll('.role-super_admin', '.role-admin')
  }

  if (rule.type === CSSRule.MEDIA_RULE) {
    const mediaRule = rule as CSSMediaRule
    const children = Array.from(mediaRule.cssRules).map(mirrorRule).filter(Boolean)
    return children.length ? `@media ${mediaRule.conditionText}{${children.join('\n')}}` : ''
  }

  if (rule.type === CSSRule.SUPPORTS_RULE) {
    const supportsRule = rule as CSSSupportsRule
    const children = Array.from(supportsRule.cssRules).map(mirrorRule).filter(Boolean)
    return children.length ? `@supports ${supportsRule.conditionText}{${children.join('\n')}}` : ''
  }

  return ''
}

function rebuildAdminParityStyles() {
  if (typeof document === 'undefined') return

  const mirrored = new Set<string>()

  for (const sheet of Array.from(document.styleSheets)) {
    const owner = sheet.ownerNode
    if (owner instanceof HTMLStyleElement && owner.id === ADMIN_PARITY_STYLE_ID) continue

    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }

    Array.from(rules).forEach((rule) => {
      const css = mirrorRule(rule)
      if (css) mirrored.add(css)
    })
  }

  let style = document.getElementById(ADMIN_PARITY_STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = ADMIN_PARITY_STYLE_ID
    style.dataset.source = 'Super Admin visual parity for Admin'
    document.head.appendChild(style)
  }

  style.textContent = [
    '/* Generated at runtime from .role-super_admin rules. Visual parity only; permissions remain unchanged. */',
    ...mirrored,
    ADMIN_RESPONSIVE_SAFETY,
  ].join('\n')
}

export function registerAdminSuperAdminStyleParity() {
  if (typeof document === 'undefined') return

  let frame = 0
  const schedule = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(rebuildAdminParityStyles)
  }

  schedule()
  window.setTimeout(schedule, 100)
  window.addEventListener('load', schedule, { once: true })

  if (import.meta.env.DEV) {
    const observer = new MutationObserver((mutations) => {
      const stylesheetChanged = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) =>
          node instanceof HTMLStyleElement ||
          (node instanceof HTMLLinkElement && node.rel === 'stylesheet'),
        ),
      )
      if (stylesheetChanged) schedule()
    })
    observer.observe(document.head, { childList: true })
  }
}
