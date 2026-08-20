# Production Readiness Checklist

Status values: READY, READY WITH CONFIGURATION, BLOCKED, NOT VERIFIED, NOT IMPLEMENTED.

## Build and deployment
- `npm run build`: NOT VERIFIED in connector session.
- `npm run lint`: NOT VERIFIED in connector session.
- Vercel SPA rewrite exists in `vercel.json`.
- Production environment variables: NOT VERIFIED.
- Supabase redirect URLs/domain ownership: NOT VERIFIED.

## Security
- Patient cross-record access: NOT VERIFIED by live role test.
- Branch isolation: NOT VERIFIED by live role test.
- Provider clinical scoping: NOT VERIFIED by live role test.
- Sensitive storage anonymous-access test: NOT VERIFIED.
- Legacy blanket communication log/outbox RLS: hardened by Part 40 migration 030; migration must be applied before launch.
- Client secret scan: repository search found no direct evidence during this pass, but packaged-bundle verification remains NOT VERIFIED.

## Clinical and operational
- Appointment lifecycle/concurrency: PARTIALLY READY; requires live concurrent booking tests.
- Clinical draft/finalize/amend workflow: PARTIALLY READY; requires live authorization tests.
- Intake/medical-history provenance: PARTIALLY READY.
- Consent version/signature immutability: implemented at DB layer; live cross-user/storage tests NOT VERIFIED.
- Treatment plan pricing snapshots: implemented; full scheduling/performed-treatment handoff still requires end-to-end verification.
- Recall/follow-up: foundation implemented; provider communication and appointment-sync workflow remains PARTIALLY READY.

## Financial
- Invoice/payment/refund reconciliation: NOT VERIFIED against production data.
- Payment webhook replay/idempotency: NOT VERIFIED against a configured gateway.
- Collections vs billed vs receivables definitions: documented, but report-wide reconciliation remains PARTIALLY READY.
- Inventory ledger and expense double-count checks: NOT VERIFIED against production data.

## Launch blockers
Do not launch while any Critical item remains: RLS/data leak, public private-file access, duplicate financial posting, broken appointment conflict validation, unapplied required migration, broken production build, or missing required production auth configuration.
