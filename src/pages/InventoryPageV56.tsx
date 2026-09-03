import { useEffect, useState } from 'react'
import { InventoryEnhancerV183 } from '../components/system/InventoryEnhancerV183'
import { InventoryPageV182 } from './InventoryPageV182'

export function InventoryPageV56() {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    window.addEventListener('plamenco-inventory-updated', refresh)
    return () => window.removeEventListener('plamenco-inventory-updated', refresh)
  }, [])

  return <>
    <InventoryPageV182 key={revision} />
    <InventoryEnhancerV183 onInventoryChanged={() => setRevision((value) => value + 1)} />
  </>
}
