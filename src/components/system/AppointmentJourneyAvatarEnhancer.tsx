import { useEffect } from 'react'

function extractInlineBackgroundUrl(element: HTMLElement) {
  const value = element.style.backgroundImage?.trim()
  if (!value || value === 'none' || !value.startsWith('url(')) return ''

  const match = value.match(/^url\(["']?(.*?)["']?\)$/)
  return match?.[1] ?? ''
}

function initialsFromCard(avatar: HTMLElement) {
  const name = avatar.parentElement?.querySelector<HTMLElement>('.journey-patient-copy strong')?.textContent?.trim() ?? ''
  const parts = name.split(/\s+/).filter(Boolean)
  if (!parts.length) return 'P'
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : ''}`.toUpperCase() || 'P'
}

function enhanceAvatar(avatar: HTMLElement) {
  if (avatar.dataset.imageEnhancerReady === 'true') return

  const imageUrl = extractInlineBackgroundUrl(avatar)
  if (!imageUrl) {
    avatar.dataset.imageEnhancerReady = 'true'
    return
  }

  const fallback = initialsFromCard(avatar)
  const image = document.createElement('img')
  image.className = 'journey-avatar-image'
  image.alt = ''
  image.loading = 'lazy'
  image.decoding = 'async'
  image.src = imageUrl

  image.addEventListener('load', () => {
    avatar.classList.add('has-loaded-image')
  }, { once: true })

  image.addEventListener('error', () => {
    image.remove()
    avatar.classList.remove('has-loaded-image')
    avatar.textContent = fallback
    avatar.removeAttribute('style')
  }, { once: true })

  avatar.textContent = ''
  avatar.appendChild(image)
  avatar.dataset.imageEnhancerReady = 'true'
}

function enhanceJourneyAvatars(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('.appointments-v40 .journey-avatar').forEach(enhanceAvatar)
}

export function AppointmentJourneyAvatarEnhancer() {
  useEffect(() => {
    enhanceJourneyAvatars()

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          if (node.matches('.appointments-v40 .journey-avatar')) enhanceAvatar(node)
          enhanceJourneyAvatars(node)
        })
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return null
}
