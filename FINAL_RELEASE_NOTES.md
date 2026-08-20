# Plamenco Dental Co. — Release Candidate 1

Version: `1.0.0-rc.1`

Status: Release Candidate under Part 45 QA. This is not yet a production acceptance declaration.

## Included modules
Public website, authentication, patient portal, appointments/front desk, patient intake, forms and consent, clinical records, treatments, treatment plans, prescriptions, billing/payments, inventory, expenses, communications, notifications, recall/follow-up, operational tasks, reports, management automation, RBAC/RLS foundations, audit, private storage patterns and PWA support.

## Part 45 QA state
Manual RC1 bug testing is now the active phase. Defects are tracked in `RC1_QA_TRACKER.md`. Every reported defect must record root cause, fix commit, regression areas and retest state. A committed fix is not the same as production verification.

No Part 45 bugs have been recorded yet.

## Release conditions
The release may move to `v1.0.0` only after Critical blockers are cleared, clinic configuration is completed, required migrations are applied, production credentials/providers are configured, deployment/build verification is successful, acceptance tests are executed and the clinic actually signs off.

## Known verification gaps
See `KNOWN_LIMITATIONS.md`, `PRODUCTION_READINESS_CHECKLIST.md`, `CLIENT_ACCEPTANCE_TEST.md`, and `RC1_QA_TRACKER.md`. Payment/provider delivery, backup/restore, full live RBAC/RLS matrix, real-data reconciliation and report automation delivery must not be described as verified without evidence.

## Database
Part 45 has not introduced a database migration at QA initialization. Any database defect found during testing must be repaired with a new forward migration when appropriate; applied migrations should not be casually rewritten.

## Deployment
The current Vercel status for the RC1 baseline is blocked by a Vercel build-rate-limit response. This is not evidence that the TypeScript/Vite build passed or failed. Build verification remains NOT VERIFIED until actual build evidence is available.

## Acceptance
Client sign-off: NOT RECORDED.
Production release: NOT APPROVED.
