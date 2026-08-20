# Plamenco Dental Co. Clinic Handover

Handover status: `NOT READY - BLOCKERS REMAIN`

This packet separates code completion from production configuration. Do not treat the system as deployed or production-ready until the unresolved P0 blockers are closed and the clinic signs off.

## Handover Packet

- `PRODUCTION_READINESS.md` - final readiness matrix and release recommendation.
- `LAUNCH_BLOCKERS.md` - prioritized blockers and required resolutions.
- `CLINIC_DECISIONS_REQUIRED.md` - clinic choices still needed.
- `GO_LIVE_CHECKLIST.md` - go-live operational checklist.
- `RELEASE_CHECKLIST.md` - release candidate checklist.
- `DEPLOYMENT_RUNBOOK.md` - deployment, preview, migration, and rollback sequence.
- `BACKUP_RECOVERY.md` - backup, restore, RPO/RTO, and disaster recovery plan.
- `INCIDENT_RESPONSE.md` - safe response for account, database, payment, and integration incidents.
- `UAT_CHECKLIST.md` and `UAT_REPORT.md` - testing status and acceptance rules.
- `DATA_MIGRATION.md` - historical workbook migration workflow.
- `CLIENT_DEMO_SCRIPT.md` - staging demo path.
- `STAFF_GUIDE.md`, `DENTIST_GUIDE.md`, `SUPER_ADMIN_GUIDE.md`, `PATIENT_GUIDE.md`, `CLINIC_OWNER_GUIDE.md` - role guides.
- `FIRST_DAY_CHECKLIST.md`, `FIRST_WEEK_REVIEW.md`, `CLIENT_SIGNOFF_CHECKLIST.md` - launch-day and post-launch governance.

## Handover Conditions

- No shared production credentials.
- No real patient spreadsheets in Git.
- No production launch before backup/restore verification.
- No online payments until gateway webhook and amount validation are verified.
- No go-live until patient isolation and role authorization are tested with real Supabase accounts.
- No historical import until the real workbook is inspected, mapped, dry-run reviewed, backed up, imported, reconciled, and signed off.
