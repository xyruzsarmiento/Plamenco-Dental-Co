# Plamenco Dental Co. Database Source of Truth

`supabase/migrations` is the source of truth for the production schema. `supabase/schema.sql` is an older baseline reference and must not be used as proof of the final expanded schema.

| Concept | Source of Truth | Notes |
|---|---|---|
| Authentication identity | `auth.users` | Credentials, email confirmation, reset flows. Do not duplicate passwords in public tables. |
| Application profile and role | `profiles` | Links Supabase user to role, status, and permission array. |
| Patient record | `patients` | `auth_user_id` is optional and unique when present; walk-in/imported patients may be unlinked. |
| Internal branch access | `staff_branch_assignments` | Profile-to-branch authorization source for staff/admin workflows. |
| Provider identity | `providers` | Dentist/associate profile, role, public profile metadata, status. |
| Provider branch access | `provider_branch_assignments` | Provider-to-branch authorization and schedule context. |
| Provider schedule | `provider_schedule_blocks`, `provider_availability_overrides`, `schedule_blocks` | Regular schedule plus exceptions/blocked time. |
| Appointment | `appointments` | Stores business date/time, branch, provider, operatory, source, status, and payment/deposit state. |
| Appointment history | `appointment_status_history` | Timeline/audit companion for status and provider changes. |
| Clinical record | `dental_records` | Clinical visit/history source; patient-visible summary is distinct from internal notes. |
| Clinical amendment | `clinical_record_amendments` | Additive amendment history for finalized clinical records. |
| Treatment | `treatments` | Treatment status, provider/branch attribution, service snapshot, price snapshot. |
| Prescription | `prescriptions` | Medication/prescription record linked to patient/visit where available. |
| Documents | `documents` and storage buckets | Database metadata plus private object storage path. |
| Charge | `charges` | Billing-ready clinical/service charge with provider/service snapshots. |
| Invoice | `invoices` | Invoice totals, balance, status, and line items snapshot. |
| Payment | `payments` | Payment record and status. Webhook completion must be trusted/idempotent. |
| Payment allocation | `payment_allocations` | Links payment amounts to invoice(s). |
| Receipt | `receipts` | Receipt issuance, one receipt per payment where enforced. |
| Refund | `refunds` | Refund against original payment. |
| Gateway event | `payment_gateway_events` | Provider event idempotency ledger. |
| Inventory catalog | `inventory_items`, `inventory_categories`, `inventory_units` | Item identity and unit/category reference data. |
| Branch stock | `branch_inventory` | Stored current balance per branch/item. |
| Stock ledger | `stock_movements` | Movement history; should reconcile with `branch_inventory`. |
| Batches/lots | `inventory_batches` | Batch/expiry tracking where item requires it. |
| Procurement | `suppliers`, `purchase_orders`, `purchase_receipts` | Supplier, PO, and receiving source. |
| Transfers/counts | `stock_transfers`, `stock_counts` | Branch movement workflow and physical count reconciliation. |
| Expenses | `expenses`, `expense_payments`, `expense_attachments`, `expense_recurring_templates`, `expense_vendors` | Operating cost source; purchase-generated expenses are deduplicated by source. |
| Cash control | `cashier_sessions`, `cash_movements` | Branch cash drawer and cash ledger. |
| Workforce | `staff_shift_plans`, `staff_attendance` | Staff schedules and attendance records. |
| Provider compensation | `provider_compensation_rules`, `provider_payouts` | Effective payout calculation and payout tracking. |
| Communications | `communication_preferences`, `communication_templates`, `communication_delivery_logs`, `communication_outbox`, `communication_settings` | Consent/preferences, templates, delivery ledger, worker queue, provider config flags. |
| Imports | `patient_import_batches`, `patient_import_rows`, `legacy_import_staged_records` | Migration provenance and staging; not operational report source. |
| Reports | `saved_report_views`, `report_export_logs`, `v_branch_financial_summary`, `get_enterprise_financial_summary` | Saved filters, export audit, financial aggregation. |
| System operations | `clinic_configuration`, `booking_configuration`, `clinic_closures`, `internal_account_invitations`, `system_health_events`, `system_backup_registry`, `system_restore_plans`, `system_job_runs`, `system_health_snapshots` | Super Admin operations and production readiness evidence. |
| Audit trail | `audit_logs` | Actor/action/entity metadata. Part 29 restricts updates/deletes by omission of RLS update/delete policies. |

## Intentional Snapshots

Snapshots are expected where historical records must survive later configuration changes:

- `provider_name_snapshot`
- `service_name_snapshot`
- `price_snapshot_cents`
- `invoice.items`
- `charges.description`, `unit_price_cents`, `final_amount_cents`
- provider payout rate fields
- import source/normalized data
