import { useEffect, useState } from 'react'

export function OfflineStatusBanner() {
  const [online, setOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (online) return null

  return (
    <div role="status" aria-live="polite" style={{
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      padding: '10px 16px',
      textAlign: 'center',
      background: '#FFF7E6',
      borderBottom: '1px solid #E5D2A5',
      color: '#25231F',
      fontSize: 14,
    }}>
      You're offline. Some information may be unavailable. Online actions such as payments, appointment changes, and form submissions require a connection.
    </div>
  )
}
