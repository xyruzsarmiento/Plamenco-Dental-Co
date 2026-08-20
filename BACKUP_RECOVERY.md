# Plamenco Dental Co. Backup and Recovery

Do not apply production migrations, imports, or major releases until a recent backup is verified.

## Scope

- Database: Supabase Postgres schema and data.
- Storage: private clinical documents, payment proofs, expense receipts, and import artifacts.
- Configuration: Supabase Auth settings, Edge Function secrets, scheduled jobs, storage buckets, provider dashboards, DNS, Vercel project settings.
- Operational records: appointments, clinical history, invoices, payments, receipts, inventory movements, expenses, reports, and audit logs.

## Baseline Recommendation

- Automated database backup: daily, if enabled by the Supabase plan.
- Manual backup: before migrations, large imports, payment-provider changes, and major releases.
- Storage backup: separate process for private buckets; database-only backup is not enough.
- Retention: confirm with clinic owner/legal/accounting before setting deletion timelines.

## Required Verification

1. Confirm the Supabase plan and backup feature actually enabled.
2. Record where backups are listed and who can restore them.
3. Verify backup timestamp before each migration/import.
4. Perform a restore rehearsal in a safe non-production project when available.
5. Compare restored counts for patients, appointments, invoices, payments, receipts, inventory, expenses, documents, and audit logs.

## Restore Procedure

1. Stop destructive changes and pause deployment/import activity.
2. Capture the incident, timestamp, affected modules, and recent release/import IDs.
3. Identify the latest usable database and storage backup.
4. Estimate data created after the backup timestamp; those records may need manual reconciliation.
5. Restore only by an authorized administrator.
6. Verify schema, auth, RLS, storage access, Edge Functions, and critical workflows.
7. Reconcile post-backup appointments, payments, clinical updates, inventory movements, and expenses.
8. Document resolution and client sign-off.

## RPO/RTO

If backups are daily, the possible data gap can approach 24 hours. Actual recovery time depends on Supabase plan, backup size, storage recovery process, DNS/deployment health, and administrator availability. Do not promise zero data loss or instant recovery without validated infrastructure.

## Part 27 Operational Registry

The Super Admin System Health dashboard now maintains a registry for backup evidence, verification status, job runs, and restore plans. This registry is an operational log only:

- Recording a platform backup reference does not create a Supabase backup.
- Marking a backup verified requires evidence such as restore rehearsal, checksum review, or record-count validation.
- Restore plans are drafted and approved for controlled recovery planning; the application does not provide a casual production restore button.
- Database backup, storage backup, configuration backup, pre-migration snapshot, and application export are displayed as separate types.

Before large patient imports or risky schema migrations, record the latest verified recovery point and review migration safety warnings in System Health.
