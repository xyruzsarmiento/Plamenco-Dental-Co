# Changelog

## v1.0.0 - Production Launch Candidate

- Added billing, payments, receipts, refunds, and patient account foundations.
- Added branch-specific inventory, purchasing, stock movements, and reconciliation support.
- Added operating expenses, vendors, attachments, recurring expenses, and expense reporting.
- Added enterprise reports, saved report views, PDF/Excel/CSV export paths, and report export logging.
- Added Super Admin control center, role/permission matrix, account invitations, health indicators, and clinic configuration.
- Added production integration boundaries for Edge Functions, communications, payment webhooks, reminders, and Meta Messenger.
- Added historical patient import workspace with mapping, validation, duplicate review, dry run, import history, and guarded rollback.
- Added UAT, go-live, backup/recovery, incident response, release, first-day, first-week, and handover documentation.

## v1.1.0 - Executive Business Intelligence Candidate

- Added executive BI metrics for revenue, collections, expenses, operating result, receivables, discounts, refunds, completion rate, cancellation rate, and no-show rate.
- Added branch comparison, patient growth, busiest day/hour, service performance, provider performance, payment mix, inventory alert, purchasing, deterministic insight, and data-quality analytics.
- Upgraded the main dashboard to show executive analytics only to Super Admin/Admin/financial-report roles.
- Restricted the full Reports page to `reports.view` so limited report users do not receive clinic-wide financial analytics.
- Documented shared formulas in `ANALYTICS_DEFINITIONS.md`.

## v1.2.0 - Production Deployment Pipeline Candidate

- Added environment strategy for development, staging, and production Supabase/Vercel separation.
- Added deployment, staging, and rollback guides.
- Added GitHub Actions CI for install, schema verification, deployment verification, lint, and build.
- Added deployment readiness verification for Vercel SPA routing, env examples, gitignore safety, public assets, Edge Function inventory, and scheduled worker protection.
- Added `CRON_SECRET` protection to scheduled communication/reminder Edge Functions.
- Added non-production `noindex` behavior with `VITE_DEPLOYMENT_ENV`.
- Removed the hardcoded canonical domain until the clinic production domain is approved.

## v1.3.0 - Daily Clinic Workflow Candidate

- Reworked the staff/dentist operational dashboard around Today's Patient Flow.
- Added branch and search filters to the daily queue.
- Added direct check-in, waiting, start visit, complete, patient, and billing actions from daily context.
- Added a derived Patients for Billing lane using completed appointments, treatments, charges, and invoices.
- Added workflow audit and concise staff/dentist operating guides.

## v1.4.0 - Patient Journey Candidate

- Reworked public booking into a branch-aware guided flow with service, dentist preference, date, time, details, and confirmation.
- Reused existing availability and appointment creation logic to avoid fake slots.
- Removed fake medical/profile defaults from public booking patient creation.
- Added patient-friendly status labels in portal appointment, dental record, treatment, invoice, and payment views.
- Added patient journey audit, communication matrix, and patient data visibility matrix.
