# Task Automation Rules

Part 41 registers automation rules as configuration records, but all rules are disabled by default until clinic policy is confirmed.

## Deterministic keys and deduplication

Automatic work uses a deterministic key such as `RULE_KEY:source_type:source_id:context`. A partial unique index allows only one active task for a given `task_key`; completed/cancelled history is preserved. The trusted `create_operational_task` RPC returns an existing active task when the same event is retried.

## Registered rules

- `CONSENT_PENDING` — form assignment / appointment consent follow-up.
- `PLAN_SCHEDULING` — accepted treatment-plan item requiring real scheduling.
- `PAYMENT_FAILURE` — provider-backed payment failure requiring review.
- `COMMUNICATION_FAILURE` — actual provider communication failure.
- `RECALL_CONTACT` — recall contact work from Part 39.
- `INVENTORY_REORDER` — configured reorder-point review.
- `EXPENSE_APPROVAL` — configured expense approval workflow.

These are configuration placeholders only. They do not create tasks until enabled and wired to trusted source events.

## Auto-close rules

Automation may close a task only when the source-of-truth condition is verified. A task record alone must never make a form signed, appointment booked, payment successful, recall completed, inventory replenished, or expense approved.

## Failure and retry behavior

Automation retries must call the idempotent creation path. Worker retries, duplicate webhooks, double events, or repeated database events must not create duplicate active tasks. Failed automation should leave the source system unchanged and expose an operational error rather than fake success.
