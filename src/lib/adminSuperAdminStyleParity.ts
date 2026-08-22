const ADMIN_PARITY_STYLE_ID = 'plamenco-admin-super-admin-parity'

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
