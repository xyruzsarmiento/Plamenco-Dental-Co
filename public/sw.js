const CACHE_NAME = 'plamenco-shell-v2'
const STATIC_ASSETS = ['/favicon.svg', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // HTML/navigation must always prefer the deployed application so an old cached
  // SPA shell cannot keep users on obsolete authentication or patient-portal code.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/') || Response.error())
    )
    return
  }

  // Never cache authenticated/application data routes.
  const sensitivePath = /^(\/portal|\/app|\/auth|\/rest\/|\/storage\/|\/functions\/)/.test(url.pathname)
  if (sensitivePath) {
    event.respondWith(fetch(request))
    return
  }

  // Only cache explicit static assets. Vite's hashed application bundles are
  // allowed to use the browser HTTP cache instead of being pinned by this SW.
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      }))
    )
  }
})
