# Operational Task Workflow

Part 41 adds an internal operational work queue. Tasks organize work; they do not replace the source-of-truth patient, appointment, form, treatment-plan, payment, recall, inventory, expense, or communication record.

## Lifecycle

`open -> in_progress -> waiting|blocked -> completed`

A task may also be `cancelled`. Reopening a completed task is recorded as a new task event; prior completion history is retained. Blocked tasks require a reason. Overdue is derived from `due_at` in Asia/Manila and is an operational state, not a medical urgency classification.

## Sources

Every task has `source_type` and `source_id`. Automated tasks also have a deterministic `task_key` and optional `automation_rule_key`. `source_route` is a navigation aid only; authorization is still enforced by the source module.

Supported source concepts include patient, appointment, clinical visit, form assignment, treatment plan/item, treatment, invoice/payment/refund, recall, communication delivery log, inventory item/purchase order, and expense.

## Assignment and claiming

Tasks may be unassigned or assigned to an internal profile. Claiming uses a row lock plus `expected_updated_at` to prevent two users silently claiming the same stale task state. Reassignment is auditable. Branch-scoped work must remain within authorized branch access.

## Completion

Task completion never changes the underlying source record. Source-sensitive automation must validate the source condition before auto-closing. Until those specific source validators are implemented, staff must resolve the source workflow first and then complete the task only when the underlying condition is truly resolved.

Examples:

- Consent Pending closes after the actual assigned form is completed.
- Treatment Plan Scheduling closes after a real appointment is linked through the existing appointment engine.
- Payment Review closes only after the billing/payment issue is resolved in the billing subsystem.
- Recall Contact follows the existing recall lifecycle and communication delivery truth.

## Historical handling

Tasks and task events are not cascade-deleted when a source record becomes unavailable. The task remains as operational history and the UI should show that the source is no longer available when it cannot be resolved.
