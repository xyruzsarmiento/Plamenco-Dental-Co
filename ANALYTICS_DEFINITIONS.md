# Plamenco Dental Co. Analytics Definitions

These formulas must stay consistent across Dashboard, Reports, PDF export, Excel export, and reconciliation checks.

## Financial Metrics

- Revenue: invoice totals in the selected business-date period, excluding void invoices. Revenue is not the same as cash received.
- Collections: completed, partially refunded, or refunded payments received during the selected period.
- Expenses: non-void, non-cancelled operating expense totals in the selected period.
- Operating Result: collections minus recorded operating expenses. This is not formal accounting net profit.
- Outstanding Receivables: unpaid invoice balances for non-void invoices in the selected report context.
- Discounts: invoice discount totals where discount fields are available.
- Refunds: completed refund amounts in the selected period.
- Payment Method Mix: collections grouped by actual payment method values such as cash, GCash, Maya, bank transfer, card, online gateway, and other.

## Appointment Metrics

- Completion Rate: completed appointments divided by eligible scheduled appointments.
- Cancellation Rate: cancelled appointments divided by eligible scheduled appointments.
- No-Show Rate: no-show appointments divided by eligible scheduled appointments.
- Eligible Scheduled Appointments: confirmed, checked in, waiting, in progress, completed, cancelled, or no-show appointments.
- Busiest Days: appointment count grouped by Manila business date day of week.
- Busiest Hours: appointment count grouped by appointment start hour and shown in 12-hour labels.

## Patient Metrics

- Patients Seen: unique patients with completed appointments during the selected period.
- New Patient: a patient whose first completed visit is in the selected period.
- Returning Patient: a patient with a completed visit in the selected period and at least one earlier completed visit.
- Active Patients: patients currently marked active and matching the branch filter where branch data exists.
- Patient Growth Trend: new and returning patients grouped by the selected report dates.

## Provider Metrics

- Provider Revenue: treatment/charge revenue attributed to the performing provider where provider attribution exists.
- Patients Seen: unique completed-visit patients assigned to the provider in the selected period.
- Completed Visits: completed appointments assigned to the provider.
- Treatments Performed: treatment records attributed to the provider.
- Average Treatment Value: provider revenue divided by treatment count.
- Provider No-Show Rate: provider no-shows divided by eligible scheduled appointments assigned to that provider.

## Service Metrics

- Top Services by Revenue: treatment groups ranked by related charge revenue.
- Top Services by Count: treatment groups ranked by completed treatment count.
- Average Service Value: service revenue divided by completed treatment count.
- Revenue Share: service revenue divided by total report revenue.

## Inventory and Purchasing Metrics

- Inventory Value: quantity on hand multiplied by average unit cost. Selling/service prices are not used.
- Low Stock: quantity on hand above zero and at or below reorder level.
- Out of Stock: quantity on hand at or below zero.
- Consumption: actual stock movement records with movement type `consumption`; treatment records are not used as a proxy.
- Purchase Spend: purchase receipt totals in the selected period.
- Supplier Spend: purchase receipt totals grouped by supplier.

## Data Quality

Data-quality indicators flag records that can affect management reporting, such as payments without branch context, invoices without branch context, treatments without provider attribution, and expenses without categories. These records are not silently reassigned.
