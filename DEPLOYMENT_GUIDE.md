# Plamenco Dental Co. Deployment Guide

This guide prepares a release. It does not authorize production deployment, DNS changes, live payments, or real patient messaging.

## Current Architecture

- Framework: React, TypeScript, Vite.
- Build command: `npm.cmd run build`.
- Output directory: `dist`.
- Hosting target: Vercel static frontend with SPA rewrites in `vercel.json`.
- Backend: Supabase Auth, Postgres, Storage, Edge Functions, RLS, scheduled jobs.
- Repository: `https://github.com/xyruzsarmiento/Plamenco-Dental-Co`.

## Local Verification

```cmd
npm.cmd install
npm.cmd run verify:schema
npm.cmd run verify:deployment
npm.cmd run lint
npm.cmd run build
```

There is no package-level `test` script yet. Existing TypeScript test files should be wired into a test runner in a later pass.

## GitHub Workflow

Use a simple branch model:

- `main`: production-ready code only.
- `develop`: staging/integration branch.
- `feature/*` or `fix/*`: optional isolated work.

The added GitHub Actions workflow runs install, schema verification, deployment verification, lint, and build on `main`, `develop`, and pull requests.

## Vercel Frontend

Configure Vercel with:

- Install command: `npm ci`.
- Build command: `npm run build`.
- Output directory: `dist`.
- Production branch: `main`.
- Preview deployments: pull requests and non-production branches.

`vercel.json` rewrites all direct routes to `/`, so refreshes such as `/portal/PT-TEST`, `/app/patients`, and `/reset-password` load the SPA instead of a Vercel 404.

## Supabase Migrations

Apply migrations in filename order from `supabase/migrations`.

Recommended release order:

1. Verify backup/recovery point.
2. Review pending migrations.
3. Apply migrations to development/test.
4. Apply migrations to staging.
5. Run `public.run_database_integrity_checks()`.
6. Deploy staging frontend and Edge Functions.
7. Run smoke, role, branch, auth, storage, payment sandbox, and communication safety tests.
8. Approve production release.
9. Verify production recovery point.
10. Apply production database migrations.
11. Deploy production frontend and Edge Functions.
12. Run production smoke tests and monitor System Health.

Use expand/migrate/contract for risky schema changes. Do not drop columns/tables or rewrite data in the same release without explicit review and recovery planning.

## Edge Functions

Current functions:

- `invite-internal-account`
- `payment-gateway-webhook`
- `meta-messenger-webhook`
- `queue-appointment-reminders`
- `process-communication-outbox`

When the Supabase CLI is installed and authenticated, deploy functions per environment:

```cmd
supabase functions deploy invite-internal-account --project-ref <staging-or-production-ref>
supabase functions deploy payment-gateway-webhook --project-ref <staging-or-production-ref>
supabase functions deploy meta-messenger-webhook --project-ref <staging-or-production-ref>
supabase functions deploy queue-appointment-reminders --project-ref <staging-or-production-ref>
supabase functions deploy process-communication-outbox --project-ref <staging-or-production-ref>
```

Set secrets separately for each Supabase project. Scheduled jobs must send `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`.

## Smoke Test

After every staging or production release:

- Landing page loads.
- Direct nested routes refresh without 404.
- Static image assets load.
- Login, registration, email confirmation, and password reset point to the correct environment.
- Patient portal, staff portal, dentist access, and Super Admin access behave by role.
- Supabase reads work for allowed users and fail for denied users.
- System Health loads without fake operational claims.
- Payment and communication integrations remain disabled unless approved and configured.
