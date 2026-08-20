# Plamenco Dental Co. RLS Policy Matrix

This matrix describes intended access after the ordered migrations. It must be verified in a real Supabase staging project with direct API tests.

| Domain / Tables | Anonymous | Patient | Staff/Admin | Dentist/Associate | Super Admin |
|---|---|---|---|---|---|
| `profiles` | Denied | Own profile | Management as permitted | Own profile | Full management |
| `patients` | Denied | Own linked patient row | Internal access; branch scoping still needs production test | Internal/provider access where clinic permits | Full |
| `appointments`, `appointment_status_history` | Denied | Own linked appointments/history | Internal workflow access | Assigned provider access | Full |
| `dental_records`, `treatments`, `treatment_plans`, `documents` | Denied | Own permitted history | Internal clinical access | Provider clinical access | Full |
| `clinical_record_amendments`, `prescriptions` | Denied | Own linked rows read where policy permits | Clinical permission required for writes | Clinical permission required for writes | Full |
| `charges`, `invoices`, `payments`, `payment_allocations`, `receipts`, `refunds` | Denied | Own linked financial rows | Finance permission/internal access | Limited unless role/permissions grant | Full |
| `payment_gateway_events` | Denied | Denied | Payment verification/system admin only | Denied by default | Full/system admin |
| `inventory_*`, `branch_inventory`, `stock_movements`, `suppliers`, `purchase_*`, `stock_*` | Denied | Denied | Internal inventory access | Internal/provider access only if policy grants | Full |
| `expenses`, `expense_*`, `cashier_sessions`, `cash_movements` | Denied | Denied | Internal finance/expense access | Denied unless explicitly permitted | Full |
| `staff_shift_plans`, `staff_attendance` | Denied | Denied | Internal workforce access | Denied unless assigned/staff policy permits | Full |
| `provider_compensation_rules`, `provider_payouts` | Denied | Denied | Authorized finance/management only | Denied by default | Full |
| `communication_preferences` | Denied | Own preferences | Communications management | Communications management if granted | Full |
| `communication_templates`, `communication_settings` | Denied | Denied | Communications/system admin | Denied unless permission granted | Full |
| `communication_delivery_logs`, `communication_outbox` | Denied | Denied by default in current tightened policy | Communications/system admin | Denied unless permission granted | Full |
| `patient_import_batches`, `patient_import_rows`, `legacy_import_staged_records` | Denied | Denied | `patients.import` only | Denied unless permission granted | Full |
| `saved_report_views`, `report_export_logs` | Denied | Denied | Reports permissions | Reports permissions if granted | Full |
| `audit_logs` | Denied | Denied | `audit_logs.view` read, internal insert | Denied unless permission granted | Full |
| System admin/health/backup tables | Denied | Denied | System admin permissions only | Denied unless permission granted | Full |

## Production Tests Required

- Patient A cannot select/update Patient B data.
- Pulilan-only staff cannot read or mutate Plaridel inventory, cash, expenses, or appointments unless explicitly assigned.
- Dentist cannot access provider compensation or finance reports without permission.
- Anonymous role cannot read any sensitive operational tables.
- `service_role` is used only in trusted Edge Functions/workers, never in the browser bundle.
