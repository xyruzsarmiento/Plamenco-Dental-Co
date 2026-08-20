# Plamenco Dental Co. Rollback Guide

Rollback strategy depends on what failed. Do not assume reverting code reverses database, storage, provider, or Auth changes.

## Frontend Rollback

Use when the database remains backward-compatible and the failure is in the Vercel frontend.

1. Stop further promotions.
2. Identify the last known-good Vercel deployment.
3. Promote/redeploy that Vercel deployment.
4. Run production smoke tests.
5. Record the incident and follow-up fix in `CHANGELOG.md` or incident notes.

## Edge Function Rollback

Use when a webhook, scheduled job, invite function, or communication worker release fails.

1. Pause affected provider webhook, cron, or worker trigger if needed.
2. Redeploy the prior known-good function version from Git.
3. Reapply the correct environment secrets.
4. Replay only provider events that are safe and idempotent.
5. Verify System Health and affected tables.

## Database Corrective Migration

Use when the production database is still healthy enough for a forward fix.

1. Stop random SQL attempts.
2. Capture the exact failed migration/error and current migration state.
3. Write a new forward migration that corrects the issue.
4. Test it against staging restored from a recent production-like backup.
5. Apply during an approved window.

## Database Recovery

Use when production data integrity is compromised or a corrective migration is not safe.

1. Escalate to the authorized restore approver.
2. Confirm latest verified database and storage recovery points.
3. Follow `DISASTER_RECOVERY.md`, `BACKUP_RECOVERY.md`, and `DATABASE_MIGRATION_GUIDE.md`.
4. Reconcile records created after the recovery point.
5. Keep audit evidence of decision, operator, timestamp, and affected data window.

## Integration Kill Switches

Optional integrations may be disabled while the core clinic system stays available:

- Disable live online payments until gateway verification passes.
- Disable SMS/email/Messenger sending by configuration/provider secrets.
- Pause scheduled reminder and outbox jobs by withholding `CRON_SECRET` or disabling the scheduler.

Do not delete historical communication, payment, or webhook records during rollback.
