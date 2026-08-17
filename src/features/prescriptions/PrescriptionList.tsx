import { Printer } from 'lucide-react'
import type { Prescription } from './prescriptionStore'

type PrescriptionListProps = {
  prescriptions: Prescription[]
}

export function PrescriptionList({ prescriptions }: PrescriptionListProps) {
  if (prescriptions.length === 0) {
    return null
  }

  return (
    <div className="prescription-list">
      {prescriptions.map((prescription) => (
        <article key={prescription.id} className="prescription-card">
          <div className="prescription-header">
            <div>
              <strong>{prescription.medication}</strong>
              <span>{prescription.dosage}</span>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={`Print prescription for ${prescription.medication}`}
              onClick={() => {
                const printWindow = window.open('', '_blank', 'width=720,height=900')
                if (!printWindow) return

                printWindow.document.write(`
                  <html>
                    <head>
                      <title>Prescription</title>
                      <style>
                        body { font-family: sans-serif; margin: 32px; color: #172126; }
                        h2 { margin-bottom: 12px; }
                        .line { margin: 8px 0; }
                      </style>
                    </head>
                    <body>
                      <h2>Plamenco Dental Co</h2>
                      <div class="line"><strong>Medication:</strong> ${prescription.medication}</div>
                      <div class="line"><strong>Dosage:</strong> ${prescription.dosage}</div>
                      <div class="line"><strong>Frequency:</strong> ${prescription.frequency}</div>
                      <div class="line"><strong>Duration:</strong> ${prescription.duration}</div>
                      <div class="line"><strong>Instructions:</strong> ${prescription.instructions}</div>
                      <div class="line"><strong>Prescribed by:</strong> ${prescription.prescribedBy}</div>
                      <div class="line"><strong>Date:</strong> ${prescription.prescriptionDate}</div>
                    </body>
                  </html>
                `)
                printWindow.document.close()
                printWindow.focus()
                printWindow.print()
              }}
            >
              <Printer size={16} />
            </button>
          </div>
          <p>{prescription.frequency}</p>
          <small>{prescription.duration}</small>
          <p>{prescription.instructions}</p>
        </article>
      ))}
    </div>
  )
}
