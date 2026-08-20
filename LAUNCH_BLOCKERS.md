# Plamenco Dental Co. Launch Blockers

Status values: `OPEN`, `CONFIGURATION REQUIRED`, `READY FOR TEST`, `RESOLVED`, `ACCEPTED RISK`.

Production is not approved while any P0 item remains unresolved.

| Priority | Area | Blocker | Status | Required Resolution |
|---|---|---|---|---|
| P0 | Payments | Online payment gateway sandbox/live webhook verification is not complete. | CONFIGURATION REQUIRED | Configure gateway credentials and webhook URL, verify signatures, amount matching, idempotency, success, failure, and duplicate event handling. |
| P0 | Security | Patient isolation has not been tested with two real Supabase Auth patient accounts. | READY FOR TEST | Confirm Patient A cannot access Patient B profile, appointments, clinical records, invoices, payments, receipts, documents, or notifications through direct URLs/API calls. |
| P0 | Security | Role permission enforcement has not been tested with real Staff, Dentist, Associate Dentist, Admin, and Super Admin accounts. | READY FOR TEST | Verify protected routes and backend policies deny unauthorized direct access. |
| P0 | Security | Production staff/dentist/admin access must use Supabase Auth profiles, not legacy local staff passwords. | RESOLVED | Local staff-password fallback is disabled outside development unless `VITE_ENABLE_LEGACY_LOCAL_AUTH=true`; keep that variable false/absent in production. |
| P1 | Supabase | Production migrations, RLS, Edge Functions, scheduled jobs, storage buckets, and secrets have not been verified in the actual Supabase project. | CONFIGURATION REQUIRED | Apply migrations to a backed-up sandbox/production project, deploy functions, configure secrets, and run smoke tests. |
| P1 | Clinic Workflow | Full clinic-day UAT has not been completed with Pulilan and Plaridel realistic staging data. | READY FOR TEST | Run the UAT script in `UAT_CHECKLIST.md` and record actual results. |
| P1 | Communications | Email, SMS, and Messenger delivery/failure handling are not provider-verified. | CONFIGURATION REQUIRED | Configure provider credentials and verify delivery logs, outbox retries, failures, and opt-out/preferences. |
| P1 | Data Migration | Real historical workbook has not been provided, inspected, migrated, reconciled, or signed off. | CONFIGURATION REQUIRED | Use `DATA_MIGRATION.md` workflow with clinic-supplied files only. |
| P1 | Backups | Production database/storage backup availability and restore procedure have not been verified. | CONFIGURATION REQUIRED | Confirm backup mechanism, retention, restore permissions, and at least one safe restore rehearsal in non-production. |
| P2 | Performance | Production-sized data behavior has not been load reviewed for patients, appointments, reports, audit logs, inventory, and import history. | OPEN | Add pagination/index review before high-volume launch. |
| P2 | UX / Accessibility | Browser prompt/alert/confirm flows remain in important admin, inventory, expense, billing, staff, import, and clinical workflows. | OPEN | Replace with accessible app-native modals/forms, prioritizing financial and clinical actions. |
| P2 | Clinic Configuration | Actual branch contact details, schedules, services, prices, providers, staff, inventory opening balances, and expense categories need clinic confirmation. | CONFIGURATION REQUIRED | Complete `CLINIC_DECISIONS_REQUIRED.md` and Super Admin setup review. |
