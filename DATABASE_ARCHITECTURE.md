# Plamenco Dental Co. Database Architecture

The database is a Supabase Postgres schema built by ordered forward migrations. Production setup should apply migrations in filename order and should not depend on manual dashboard edits.

## Domains

- Identity: `auth.users`, `profiles`, branch assignment tables, provider profiles.
- Patients: canonical patient records with optional portal auth linkage.
- Scheduling: appointments, operatories, schedule blocks, provider schedules, waitlist, status history.
- Clinical: dental records, treatments, prescriptions, documents, amendments.
- Finance: charges, invoices, payments, allocations, receipts, refunds, gateway events.
- Inventory: catalog, branch stock, batches, stock movements, suppliers, purchases, transfers, stock counts.
- Expenses and cash: expenses, payments, attachments, recurring templates, cashier sessions, cash movements.
- Workforce: staff shift plans, attendance, provider compensation rules and payouts.
- Communications: preferences, templates, delivery logs, outbox, settings.
- Imports: patient import batches/rows and legacy staged records.
- System: audit logs, clinic/booking configuration, invitations, health, backups, restore plans, job runs.

## Integrity Principles

- `auth.users` owns credentials. Public tables should not contain production passwords.
- `patients.auth_user_id` is optional but unique when present.
- Historical clinical and financial records should be voided/amended/reversed instead of hard-deleted.
- Branch-specific operational records keep branch identifiers; unknown historical branch values must remain intentionally unmapped, not silently converted.
- Inventory uses a controlled hybrid model: `branch_inventory` is the current balance, and `stock_movements` is the ledger. Mutations should use transaction-safe functions such as `post_stock_movement`.
- Payments use integer cents in application-facing tables and idempotent gateway event tracking.
- Application exports and import staging are not operational source tables for reports unless explicitly designed as migration/report audit views.

## Trigger and Function Inventory

| Function | Purpose | Security Model |
|---|---|---|
| `set_updated_at` | Shared `updated_at` timestamp trigger. | Normal trigger. |
| `current_profile_role` | Reads current user's profile role. | `security definer`, explicit `search_path`. |
| `is_management_role` | Management role helper. | `security definer`, explicit `search_path`. |
| `has_profile_permission(text)` | Permission helper. | `security definer`, explicit `search_path`; Part 29 requires active profile. |
| `is_internal_profile` | Staff/provider/admin role helper. | `security definer`, explicit `search_path`. |
| `profile_has_active_branch(text)` | Branch assignment helper. | `security definer`, explicit `search_path`; avoids policy recursion through assignment tables. |
| `handle_new_auth_profile` | Creates profile record after auth signup. | Trigger, `security definer`. |
| `handle_new_patient_auth_user` | Creates/links patient profile after patient registration. | Trigger, `security definer`. |
| `set_appointment_number` | Generates appointment number. | Trigger/function. |
| `appointment_time_range` | Builds range for overlap constraints. | Immutable SQL function. |
| `validate_appointment_status_transition` | Rejects invalid appointment status transitions. | Trigger/function. |
| `next_invoice_number`, `next_payment_number`, `next_receipt_number`, `next_expense_number`, `next_inventory_item_code`, `next_purchase_order_number` | Sequence-backed human identifiers. | Server/database generation. |
| `post_stock_movement` | Transaction-safe inventory movement and balance update. | `security definer`, explicit `search_path`; should be permission-tested. |
| `record_expense_payment` | Expense payment transaction and balance update. | `security definer`, explicit `search_path`; should be permission-tested. |
| `generate_expense_from_purchase_receipt` | Idempotent expense generation from receiving. | `security definer`, explicit `search_path`. |
| `apply_verified_gateway_payment` | Idempotent trusted payment webhook apply. | `security definer`, explicit `search_path`; called by Edge Function. |
| `is_clinic_closed` | Checks closure dates. | Stable SQL function. |
| `get_enterprise_financial_summary` | Financial reporting aggregation. | Stable SQL function; RLS/execute grants must be verified. |
| `run_database_integrity_checks` | Read-only diagnostic report. | `security definer`, explicit permission check, no writes. |

## Known Schema Drift

`supabase/schema.sql` is a legacy baseline and does not include all migrations from Parts 9-29. Keep it for historical context only, or regenerate it from a fresh migrated database after the migration chain is verified.
