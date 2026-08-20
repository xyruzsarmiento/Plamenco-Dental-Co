export function registerPatientPortalPwa() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => {
        // PWA support is progressive enhancement. App functionality must not depend on registration.
      })
  })
}
