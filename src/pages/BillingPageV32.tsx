import { useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { BillingPageV14 } from './BillingPageV14'
import { InvoiceCreatorButtonV32 } from '../features/billing/InvoiceCreatorV32'
import { usePermissions } from '../features/auth/permissions'

export function BillingPageV32() {
  const permissions = usePermissions()
  const [revision, setRevision] = useState(0)

  return (
    <section className="bill32-shell">
      {permissions.can('billing.create') && (
        <aside className="bill32-create-strip" aria-label="Invoice creation">
          <div className="bill32-create-copy">
            <span className="bill32-create-icon"><FilePlus2 size={18} /></span>
            <div>
              <strong>Create an invoice</strong>
              <span>Bill a patient from existing unbilled clinical charges or add manual line items.</span>
            </div>
          </div>
          <InvoiceCreatorButtonV32 onSuccess={() => setRevision((value) => value + 1)} />
        </aside>
      )}
      <div className="bill32-page-host" key={revision}>
        <BillingPageV14 />
      </div>
    </section>
  )
}
