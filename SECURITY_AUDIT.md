# Plamenco Dental Co. Security Audit

Audit date: 2026-08-18

| Finding | Severity | Affected Area | Resolution | Remaining Risk |
|---|---|---|---|---|
| Legacy local staff-password login could be used before Supabase authentication. | P0 | Authentication | Gated behind `import.meta.env.DEV` and `VITE_ENABLE_LEGACY_LOCAL_AUTH=true`; production default is disabled. | Existing local staff records may still contain password fields; remove before go-live. |
| Patient portal route ID must not grant access by itself. | P0 | Patient Portal | `RequirePatientAuth` redirects mismatched `/portal/:patientId` to the authenticated patient's own portal. | Server-side RLS must still be verified with two real patient accounts. |
| Production RLS has not been tested against real roles. | P0 | Supabase | Policies exist across migrations for patient/internal access and management permissions. | Requires direct API tests for patient, staff, dentist, admin, and super admin accounts. |
| Branch isolation has not been proven server-side. | P0 | Branch Data | Branch IDs are modeled across appointments, inventory, expenses, reports, staff/provider assignments. | Pulilan-only and Plaridel-only account tests are still blocked without real Supabase profiles. |
| Historical broad authenticated policies existed in clinical and communication tables. | P0 | Supabase RLS | Part 29 drops and recreates narrower policies for communication preferences/templates/settings, clinical amendments, prescriptions, and audit logs. | Must be verified in staging because SQL policy behavior depends on the final migrated database. |
| Permission helper allowed inactive profiles after an earlier override. | P0 | Supabase RLS | Part 29 restores `status = 'active'` inside `has_profile_permission(text)`. | Staging API tests must include inactive profile denial. |
| External payment webhooks are not provider-verified. | P0 | Payments | Edge Function validates signature and delegates to idempotent RPC. | Sandbox/live provider test still required before accepting online payments. |
| Scheduled communication/reminder workers could be invoked directly if deployed without an invocation secret. | P0 | Edge Functions / Communications | Part 30 requires `CRON_SECRET` on `queue-appointment-reminders` and `process-communication-outbox`. | Staging and production scheduler configuration must send the secret header. |
| Backup/restore capability is not platform-verified. | P1 | Disaster Recovery | System Health records backup evidence and verification status without fake backup claims. | Supabase plan, retention, and restore rehearsal remain unverified. |
| Browser `prompt`, `alert`, and `confirm` are still used in several admin workflows. | P2 | UX / Dangerous Actions | Documented as known issue; not fully replaced in this pass to avoid broad workflow rewrite. | Replace with accessible confirmation/forms before heavy clinic use. |
| Large-table reads and `select('*')` remain in sync/admin helpers. | P2 | Performance / Data Minimization | Identified for optimization; Part 29 adds schema diagnostics but does not rewrite app query surfaces. | Server-side pagination and scoped columns needed before production-sized datasets. |
| Authenticated portal pages should not be indexed. | P2 | SEO / Privacy | Added route-aware robots meta switching to `noindex, nofollow` for auth/private routes. | Verify deployed crawler behavior and hosting headers if stricter noindex is required. |

## Secret Scan Summary

No literal secret values were printed or recorded. Pattern scan found secret variable names only in `.env.example`, Edge Functions, and configuration documentation. `.gitignore` excludes `.env`, backups, dumps, credentials, certificates, migration spreadsheets, and private exports.

## Part 29 Database Hardening

- Added a forward-only consolidation migration with no `drop table`, `truncate`, or `drop column` operations.
- Added read-only integrity diagnostics through `public.run_database_integrity_checks()`.
- Marked `supabase/schema.sql` as legacy baseline only; ordered migrations are the production source of truth.

## Part 30 Deployment Hardening

- Added GitHub Actions CI for schema verification, deployment verification, lint, and build.
- Added scheduled Edge Function `CRON_SECRET` checks.
- Removed hardcoded canonical domain until the clinic production domain is approved.
- Added environment-wide `noindex` behavior for non-production deployments.
