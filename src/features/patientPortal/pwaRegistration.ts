export function registerPatientPortalPwa() {
  if (!('serviceWorker' in navigator)) return

  // Vite development navigations should stay on the dev server. A previously
  // installed worker can otherwise intercept /app routes and surface false
  // "Failed to fetch" errors while the app is being developed.
  if (import.meta.env.DEV) {
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => void registration.unregister())
    })
    return
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => {
        // PWA support is progressive enhancement. App functionality must not depend on registration.
      })
  })
}
