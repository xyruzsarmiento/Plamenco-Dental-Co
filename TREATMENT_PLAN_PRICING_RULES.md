# Treatment Plan Pricing Rules

Treatment-plan pricing is an estimate layer and remains separate from invoices, receivables, payments, collections and accounting revenue.

## Catalog price

When a plan item is first created, the current configured service price may be used as the quote basis. Missing service prices must not be replaced by invented placeholder amounts.

## Snapshot price

The service name and quote price are snapshotted onto the plan item. Later changes to the service catalog do not rewrite historical plans.

## Quantity

Line estimate = quoted price snapshot × quantity. Quantity defaults to 1 and must remain positive.

## Overrides

Price overrides are permitted only when existing RBAC/business rules allow them. Where an override workflow is enabled, preserve the original catalog snapshot, quoted price, actor, time and reason where required by clinic policy.

## Discounts

Use the existing billing/discount authorization model. Treatment-plan discounts must not become a parallel discount engine. A discount on an estimate is not a payment and does not create a receivable.

## Historical price

If a historical plan lacks a reliable historical quote, display `Not recorded`. Do not substitute today's service catalog price.

## Superseded plans

Material pricing changes after presentation/acceptance require a revised/superseding plan. The prior quote remains intact.

## Financial separation

- Estimate is not invoice.
- Accepted estimate is not revenue.
- Accepted estimate is not receivable.
- Plan acceptance does not create payment.
- Actual billing follows the existing treatment/invoice workflow.
