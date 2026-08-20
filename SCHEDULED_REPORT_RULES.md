# Scheduled Report Rules

## Period calculation

All clinic-facing periods use `Asia/Manila` semantics. Daily runs represent an explicit clinic business date. Weekly runs store an explicit start and end. Monthly runs store the explicit calendar period selected/configured by the clinic.

## Idempotency

A logical run key is derived from schedule ID, report type, period start, and period end. The first scheduled/manual run for a period uses generation attempt 1. A normal retry returns the same logical run. Explicit manual regeneration creates a higher generation attempt and never overwrites the previous run.

## Generation state

Valid progression is persisted. `Queued` means waiting for trusted generation. `Generated` requires the trusted worker to actually produce the report artifact/summary. A generation error must produce `Failed`, not an empty successful report.

## Delivery state

Each recipient has an independent delivery row. Enqueue is not Sent. Sent is not Delivered. Delivered requires provider confirmation. A run may become Partially Delivered when only some recipient deliveries succeed.

## Retry

Retries must be bounded and keyed to the existing run/delivery record. Worker retry must not create a second logical report for the same schedule and period.

## Next run and enabling

No timing is inferred. A non-manual schedule cannot be enabled without explicit schedule configuration. Recipient configuration must also exist before enabling. The final scheduler implementation must calculate `next_run_at` using clinic-approved timing in `Asia/Manila`.

## Recipient authorization

User-linked recipients must be revalidated against the current role, branch scope, and report permissions before restricted data is sent. External email delivery is not assumed authorized by merely storing an address.
