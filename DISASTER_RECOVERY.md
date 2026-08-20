# Plamenco Dental Co. Disaster Recovery

This runbook protects clinic operations when the application, database, storage, integrations, or deployment becomes unreliable. It is not a substitute for Supabase platform backups, storage backup tooling, or provider incident dashboards.

## Recovery Principles

- Stop new destructive work first: pause imports, schema migrations, bulk edits, and payment reconciliation changes.
- Preserve evidence: record timestamps, release/version, affected users, failed jobs, provider incidents, and screenshots of errors.
- Prefer restore rehearsal in an isolated Supabase project before touching production.
- Treat database backups, storage backups, configuration exports, and application data exports as different assets.
- Never expose service-role keys, payment secrets, SMS tokens, Messenger tokens, or patient passwords in logs or support tickets.

## Backup Types

| Type | Purpose | Not Equivalent To |
|---|---|---|
| Platform database backup | Relational PostgreSQL recovery for patients, appointments, treatments, billing, inventory, expenses, audit, and settings. | Storage objects or provider configuration. |
| Data export | Reporting, review, or migration support. | Full relational backup with constraints, indexes, auth, and RLS. |
| Pre-migration snapshot | Recovery point before imports or schema changes. | Ongoing automated backup policy. |
| Configuration backup | Supabase, Vercel, DNS, provider settings, Edge Function secrets inventory. | Patient or financial data backup. |
| Storage backup | Patient documents, receipts, invoices, attachments, clinic assets, import files. | Database backup. |

## Incident Paths

### Database Unavailable

1. Confirm whether Supabase project status is down or credentials/configuration changed.
2. Stop writes that depend on patient, appointment, billing, inventory, expense, or audit data.
3. Check the latest verified platform database recovery point.
4. If restore is needed, draft a restore plan and prefer test-environment restore first.
5. After recovery, verify auth, RLS, migrations, record counts, and critical workflows.

### Application Unavailable

1. Check Vercel/deployment status, domain/DNS, and browser console/network errors.
2. Roll back only through approved deployment tooling.
3. Confirm Supabase Auth redirect URLs still match the production domain.
4. Verify login, patient search, appointment scheduling, billing, and communications after recovery.

### Storage Unavailable

1. Confirm bucket access, signed URL generation, and Supabase Storage status.
2. Do not mark clinical or financial workflows complete if required proof/document files cannot be accessed.
3. Compare database file references against storage availability.
4. Do not delete orphaned files automatically.

### Supabase Outage

1. Confirm Supabase status and affected services: Postgres, Auth, Storage, Edge Functions.
2. Move clinic operations to downtime workflow: manual appointment notes, paper receipts, and deferred sync list.
3. Record all manual changes for reconciliation.
4. Resume writes only after service health and data consistency are verified.

### Payment Provider Unavailable

1. Disable or pause online gateway collection if failures affect reconciliation.
2. Keep manual payment methods available if approved by clinic policy.
3. Review pending, processing, and failed online payments before reprocessing.
4. Verify webhook signature, amount matching, idempotency, and receipt generation.

### SMS, Email, or Messenger Unavailable

1. Check provider dashboard/webhook status without sending automatic test spam.
2. Review outbox failures and retry only approved messages.
3. Use alternate channels for urgent appointment or payment notices.
4. Confirm delivery logs recover after provider service returns.

### Deployment Broken

1. Pause production release activity.
2. Identify last known good build and environment variables.
3. Roll back through Vercel only after confirming the database schema still matches the code.
4. Verify auth redirects, routing, and core workflows.

### Bad Migration Deployed

1. Stop further migrations immediately.
2. Capture exact migration name, time, SQL output, and affected tables.
3. Identify latest verified database recovery point.
4. Prefer forward corrective migration when safe; use restore only with explicit approval.
5. Reconcile post-backup data if restore is required.

### Accidental Data Modification

1. Identify actor, audit entries, affected records, and time window.
2. Stop related workflow activity.
3. Determine whether manual correction, compensating records, or restore is safest.
4. Avoid broad restore when a precise audited correction is possible.

### Credential Compromise Suspected

1. Rotate affected credentials from provider dashboards.
2. Revoke sessions/tokens where supported.
3. Review audit logs, Edge Function logs, webhook activity, and payment events.
4. Document exposure scope and notify required stakeholders.

## RPO and RTO

The clinic must decide acceptable Recovery Point Objective and Recovery Time Objective before production launch. Until those are approved, the system must not promise zero data loss or instant recovery.
