# Treatment Plan Workflow

## Purpose

Treatment plans represent recommended future care. They are not completed treatments, invoices, payments, collections, revenue, or receivables.

## Workflow

1. Dentist or authorized clinical user creates a Draft plan for a patient.
2. Services are snapshotted into plan items with service name, quantity, quoted price, provider and branch context where available.
3. Draft may be edited while it has not been presented.
4. Authorized user presents the plan. Presentation timestamp is retained.
5. Patient reviews the presented plan through the patient-facing workflow.
6. Patient may accept all, partially accept, or decline according to clinic policy.
7. Item-level decisions remain separate from plan-level status.
8. Accepted items may be scheduled through the existing appointment engine. Scheduling must continue to enforce provider/branch availability and conflict checks.
9. Cancellation/no-show does not mean the planned procedure was completed or declined.
10. Only actual performed treatment may link a plan item to a completed treatment record.
11. Billing/payment records remain separate and are created only through the existing billing architecture.
12. Material changes after presentation/acceptance require a superseding/versioned plan rather than silent mutation.

## Historical handling

Historical plans must preserve any reliable historical provider, branch, quoted price, decision and date data. Missing historical values remain `Unknown / Unmapped` or `Not recorded`; the import execution date and today's service price are not substitutes.
