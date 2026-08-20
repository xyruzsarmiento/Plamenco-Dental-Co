# Plamenco Dental Co. Staging Checklist

Use staging to prove the release before touching production.

## Environment

- [ ] Dedicated staging Supabase project exists.
- [ ] Staging Vercel deployment does not use production Supabase variables.
- [ ] `VITE_DEPLOYMENT_ENV=staging`.
- [ ] Staging Auth Site URL points to the staging app URL.
- [ ] Staging redirect URLs include only approved staging and local development URLs.
- [ ] Staging storage buckets and policies are configured.
- [ ] Staging Edge Function secrets are separate from production.

## Build And Routing

- [ ] `npm.cmd install` or CI `npm ci` completed.
- [ ] `npm.cmd run verify:schema` passed.
- [ ] `npm.cmd run verify:deployment` passed.
- [ ] `npm.cmd run lint` passed.
- [ ] `npm.cmd run build` passed.
- [ ] Vercel preview/staging build succeeded.
- [ ] `/`, `/login`, `/register`, `/book`, `/reset-password`, `/portal/PT-TEST`, `/app`, `/app/patients`, and `/app/system-admin` refresh without Vercel 404.
- [ ] Logo, landing image, clinic image, and cashier image load.

## Database

- [ ] Migrations replayed in filename order.
- [ ] `public.run_database_integrity_checks()` run as authorized system admin.
- [ ] Critical integrity findings resolved or documented before approval.
- [ ] RLS tested for anon, patient, staff, dentist, associate dentist, admin, and super admin.
- [ ] Pulilan-only account cannot read/write Plaridel-only operational data.
- [ ] Plaridel-only account cannot read/write Pulilan-only operational data.

## Auth

- [ ] Registration confirmation email redirects to staging.
- [ ] Password reset email redirects to staging.
- [ ] No production localhost redirect remains in Supabase Auth config.
- [ ] Inactive profile cannot use privileged access.
- [ ] Patient A cannot access Patient B portal/API records.

## Integrations

- [ ] Payment provider uses sandbox/test mode only.
- [ ] Duplicate payment webhook does not duplicate collections or receipts.
- [ ] SMS test uses clinic-approved test recipient only.
- [ ] Email test uses clinic-approved test mailbox only.
- [ ] Messenger webhook uses test/staging Page setup only.
- [ ] `queue-appointment-reminders` requires `CRON_SECRET`.
- [ ] `process-communication-outbox` requires `CRON_SECRET`.

## Approval

- [ ] Known P0 blockers closed.
- [ ] P1 blockers accepted or resolved.
- [ ] Release approver recorded.
- [ ] Production migration plan reviewed.
- [ ] Production recovery point plan reviewed.
