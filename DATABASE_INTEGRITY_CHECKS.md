# Plamenco Dental Co. Database Integrity Checks

Part 29 adds a read-only diagnostic function:

```sql
select *
from public.run_database_integrity_checks()
order by severity, affected_count desc, check_key;
```

Only authenticated profiles with `system_admin.view` can run it.

## Included Checks

| Check Key | Severity | Purpose |
|---|---|---|
| `patients.duplicate_patient_id` | critical | Detects duplicate clinic patient numbers. |
| `patients.duplicate_auth_user` | critical | Detects more than one patient linked to the same auth user. |
| `appointments.invalid_time_range` | critical | Finds appointments where start time is not before end time. |
| `appointments.missing_branch` | high | Finds appointments without a branch. |
| `appointments.orphan_patient` | critical | Finds appointments whose patient cannot be matched. |
| `treatments.orphan_patient` | critical | Finds treatments whose patient cannot be matched. |
| `invoices.balance_mismatch` | high | Finds invoice totals that disagree with paid and balance values. |
| `payments.orphan_patient` | high | Finds payments whose patient cannot be matched. |
| `payment_gateway_events.duplicate_provider_event` | critical | Detects duplicate gateway event identifiers. |
| `branch_inventory.negative_quantity` | critical | Finds negative stock balances. |
| `stock_movements.orphan_inventory_item` | high | Finds stock movements whose inventory item cannot be matched. |
| `communications.orphan_patient` | high | Finds delivery logs whose patient cannot be matched. |
| `provider_payouts.duplicate_period_provider` | high | Finds duplicate provider payout rows for the same period. |

## Expected Result

Before production go-live, every critical check should return `0`. High-severity checks should also be resolved unless there is a documented import exception with owner approval.

## Notes

- The function does not modify data.
- The Part 29 migration adds `NOT VALID` constraints so existing legacy data is not blocked during deployment.
- After cleanup, constraints can be validated in a future forward migration during a maintenance window.
- Do not expose this RPC to public pages or anonymous users.
