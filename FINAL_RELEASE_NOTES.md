# Plamenco Dental Co. — Release Candidate 1

Version: `1.0.0-rc.1`

Status: Release Candidate. This is not yet a production acceptance declaration.

## Included modules
Public website, authentication, patient portal, appointments/front desk, patient intake, forms and consent, clinical records, treatments, treatment plans, prescriptions, billing/payments, inventory, expenses, communications, notifications, recall/follow-up, operational tasks, reports, management automation, RBAC/RLS foundations, audit, private storage patterns and PWA support.

## Release conditions
The release may move to `v1.0.0` only after Critical blockers are cleared, clinic configuration is completed, required migrations are applied, production credentials/providers are configured, deployment/build verification is successful, acceptance tests are executed and the clinic actually signs off.

## Known verification gaps
See `KNOWN_LIMITATIONS.md`, `PRODUCTION_READINESS_CHECKLIST.md`, and `CLIENT_ACCEPTANCE_TEST.md`. Payment/provider delivery, backup/restore, full live RBAC/RLS matrix, real-data reconciliation and report automation delivery must not be described as verified without evidence.

## Database
Part 44 introduces no database migration in this pass.

## Deployment
Deployment/build status must be recorded from actual CI/Vercel evidence. Do not infer success from repository state alone.
