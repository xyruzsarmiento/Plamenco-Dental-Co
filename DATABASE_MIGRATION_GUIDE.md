# Plamenco Dental Co. Database Migration Guide

This project uses forward-only Supabase migrations. Do not run ad-hoc schema paste files against production, and do not use destructive reset commands against a live clinic database.

## Source Of Truth

- Canonical schema path: `supabase/migrations`.
- Current stabilization migration: `20260818_023_database_integrity_schema_consolidation.sql`.
- Legacy reference only: `supabase/schema.sql`.
- Required documentation: `DATABASE_SOURCE_OF_TRUTH.md`, `DATABASE_ARCHITECTURE.md`, `RLS_POLICY_MATRIX.md`, and `DATABASE_INTEGRITY_CHECKS.md`.

## Preflight

1. Confirm the working tree contains no accidental `.env`, Supabase service role key, API key, or SQL dump with patient data.
2. Run `npm.cmd install` only when dependencies are missing or `package-lock.json` changed.
3. Run `npm.cmd run verify:schema`.
4. Run `npm.cmd run lint`.
5. Run `npm.cmd run build`.
6. Create a verified database backup and record the backup location outside the repo.
7. Confirm the target Supabase project URL and project ref before applying anything.

## Migration Order

Apply migrations in filename order from `supabase/migrations`.

Do not skip earlier migrations on a fresh project. Part 29 assumes prior objects from roles, patient management, appointments, billing, inventory, expenses, reports, communications, import, and backup modules already exist.

## Staging Procedure

1. Create or choose a staging Supabase project.
2. Apply all migrations in order using the Supabase CLI or SQL editor workflow approved for the clinic.
3. Confirm no migration reports destructive operations.
4. Run the application against staging with browser-safe anon credentials only.
5. Run database integrity diagnostics:

```sql
select *
from public.run_database_integrity_checks()
order by severity, affected_count desc, check_key;
```

6. Test anonymous, patient, staff, dentist, branch manager, and super admin access paths.
7. Validate that broad authenticated access does not expose financial, clinical, audit, or communication records.

## Production Procedure

1. Schedule a clinic maintenance window.
2. Pause import jobs, automated messaging, payment webhook processing, and backup/restore jobs if they can write during migration.
3. Take a fresh backup and verify it is restorable.
4. Apply only unapplied migrations, in order.
5. Run `run_database_integrity_checks()` as an authorized system admin.
6. Validate login, patient lookup, appointment booking, billing, inventory stock posting, expenses, reports, and system health pages.
7. Resume paused integrations.
8. Record migration timestamp, operator, Supabase project ref, and verification results.

## Rollback Policy

For schema mistakes, prefer a forward corrective migration. For data corruption or failed production deployment, restore from the verified backup according to `DISASTER_RECOVERY.md` and `BACKUP_RECOVERY.md`.

Never use `drop table`, `truncate`, `git reset --hard`, or a database reset command as an improvised production rollback.
