# Admin User Manual

## Daily start
Sign in with the assigned account and confirm the active branch context before editing appointments, patients, billing, inventory, expenses or reports.

## Dashboard
Use dashboard metrics as operational summaries only. Financial labels such as Collections, Receivables, Expenses and Net Cash Movement must retain their documented definitions.

## Core workflows
Patients: search before creating a new record; avoid duplicates. Appointments: use the existing booking/availability workflow and record real status changes only. Services: maintain current duration, price and active state; historical transactions must not be repriced. Billing: create/modify invoices only through authorized workflows; payment success requires trusted persistence/provider state. Inventory: use receiving, transfer, adjustment and count workflows rather than editing balances manually. Expenses: record, approve, pay or void according to permissions. Forms & Consent: publish versioned templates and preserve signed history. Recall & Follow-Up: record real contact/booking outcomes. Tasks: use operational tasks as work coordination, never as a replacement source of truth. Reports: use documented metric definitions. Management Automation: keep schedules disabled until recipients/timing/provider configuration are approved.

## Team and access
Create accounts with the minimum required role, permission set, branch access and provider linkage. Do not share accounts.

## Sensitive operations
Refunds, voids, finalization, form publication, access changes, imports and management automation require deliberate confirmation and auditability.

## Troubleshooting
If a query fails, treat it as an error rather than an empty result. If a provider operation is not confirmed, do not report it as Sent, Delivered or Paid.
