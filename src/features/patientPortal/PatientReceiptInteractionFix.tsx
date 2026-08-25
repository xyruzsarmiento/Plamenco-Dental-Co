import { useEffect } from 'react'

export function PatientReceiptInteractionFix() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const summaryButton = target?.closest<HTMLButtonElement>('.pv3-payments-summary-v6 .is-receipt-action button')
      if (!summaryButton) return

      // The existing React handler switches the payment-history filter to receipts.
      // After that render completes, open the first actual receipt instead of leaving
      // the patient with a button that appears to do nothing.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const firstReceiptButton = document.querySelector<HTMLButtonElement>('.pv3-payment-history-v6 article.has-receipt button')
          if (firstReceiptButton) {
            firstReceiptButton.click()
            return
          }

          const firstReceiptRow = document.querySelector<HTMLElement>('.pv3-payment-history-v6 article.has-receipt')
          firstReceiptRow?.click()
        })
      })
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
