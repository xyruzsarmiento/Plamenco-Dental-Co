# Plamenco Dental Co. Inventory Management

## Architecture

Inventory V2 reuses the existing inventory module. It keeps separate concepts for item master, branch stock, stock movements, batches, suppliers, purchase orders, receiving, transfers, and physical stock counts.

Item master records identify products clinic-wide. Branch stock records hold Pulilan, Plaridel, or other branch quantities. The displayed all-branches total is only an aggregate; branch stock remains the source of truth.

## Item Master

Inventory items use stable staff-facing item codes such as `INV-000001`. Quantities are not stored on item master records. Items reference configurable categories and units of measure, with optional default supplier, default reorder level, batch tracking, and expiry tracking.

## Branch Stock

Each branch-item pair has its own on-hand quantity, reorder level, location, and weighted average unit cost. Low stock and out-of-stock states are derived from quantity versus reorder level.

## Movement Ledger

Every quantity mutation must post a stock movement. The implemented movement types include opening balance, purchase receipt, manual stock in/out, clinic consumption, transfer out/in, adjustment increase/decrease, expired, damaged, return to supplier, void, and reversal.

Reconciliation formula:

```text
Opening + Stock In + Transfer In + Adjustment In
- Stock Out - Transfer Out - Consumption - Expired/Damaged/Returns
= On Hand
```

The frontend and Supabase RPC both prevent negative stock. Production concurrent stock mutations should continue to use the database/RPC path.

## Batches And Expiry

Items may enable batch tracking and/or expiry tracking. Batches preserve lot number, received date, expiry date, supplier, source, and unit cost. Expired stock does not silently disappear; it should be removed through an expired/write-off movement.

FEFO is suggested by earlier expiry visibility, but automatic FEFO enforcement remains a clinic workflow decision.

## Purchasing And Receiving

Creating a purchase order does not increase inventory. Stock increases only when goods are received. Receiving can be partial and will update the purchase order to partially received or received.

Purchase receipts preserve supplier, branch, received date, received by, total cost, and optional supplier invoice metadata. This remains procurement support, not a full accounts payable ERP.

## Expense Integration

Inventory purchases must not be double-counted. The existing expense integration should recognize one expense from the approved accounting event, typically a purchase receipt or supplier invoice, according to the clinic/accountant decision.

## Transfers

Transfers now support draft, in-transit, received, and cancelled statuses. Dispatch posts `transfer_out` and decreases source branch stock. Receipt posts `transfer_in` and increases destination branch stock. A received transfer cannot be received again.

## Physical Stock Counts

Stock counts are branch-specific sessions. Draft counts capture system quantity, physical quantity, difference, and reason. Reviewing a count does not change stock. Posting reconciliation creates adjustment movements for differences and preserves the count history.

## Reporting

The Inventory page now surfaces stock health, low stock, out of stock, expiring soon, pending purchase orders, pending transfers, open stock counts, recent movements, and inventory valuation where the user has cost permission.

## Security

Frontend actions are permission-gated. Supabase RLS remains the production security boundary. Staff should operate only within authorized branch scope, and sensitive adjustments should remain restricted to configured roles.
