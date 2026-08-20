# Incident Response Runbook

## General response
1. Identify affected environment, users, branch and time window.
2. Stop or disable the failing integration/workflow when continued writes may worsen impact.
3. Preserve logs, audit records, provider event IDs and relevant record IDs.
4. Do not delete evidence or rewrite historical financial/clinical records.
5. Apply the smallest safe fix, verify, then document outcome.

## Login/Auth outage
- Confirm Supabase Auth/provider status and production environment configuration.
- Do not bypass authentication with temporary public access.

## Database/Supabase outage
- Place affected workflows in unavailable/error state; do not show fake empty data.
- Avoid queued client-side mutations that may replay unpredictably.

## Payment provider issue
- Stop automated confirmation when provider verification is unavailable.
- Preserve webhook/provider IDs; reconcile before manual correction.
- Never post duplicate payment to compensate for uncertainty.

## Communication outage
- Keep messages queued/failed according to actual provider state.
- Do not label Sent/Delivered without provider evidence.

## Failed migration
- Stop further migrations.
- Record the exact SQL/error and which statements committed.
- Prefer a forward corrective migration; do not drop data to make migration pass.

## Data exposure suspicion
- Restrict affected route/table/storage policy immediately where safe.
- Preserve access/audit evidence.
- Identify affected records/users/time window and escalate to clinic owner/security lead.

## Incorrect invoice/payment
- Preserve original records.
- Use supported void/refund/correction workflow rather than deleting history.

## Deployment regression
- Roll frontend back to last known-good deployment when database compatibility allows.
- Re-run smoke tests after rollback.
