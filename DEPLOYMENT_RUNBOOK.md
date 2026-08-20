# Plamenco Dental Co. Deployment Runbook

Do not deploy production automatically. Use preview/staging first.

## Platform

- Frontend: Vite static build, suitable for Vercel.
- Build command: `npm.cmd run build`
- Output directory: `dist`
- SPA routes: handled by `vercel.json` rewrite.
- Security headers: configured in `vercel.json`.
- Deployment verification: `npm.cmd run verify:deployment`
- Backend: Supabase database, Auth, Storage, Edge Functions, secrets, and scheduled jobs.

## Environment Separation

- Local development: `.env.local`, local browser storage, test data only.
- Test/sandbox: separate Supabase project and provider sandbox credentials.
- Production: production Supabase project, production domain, live provider credentials only after sandbox sign-off.

See `ENVIRONMENT_STRATEGY.md` for the detailed development, staging, and production separation policy.

## Deployment Sequence

1. Confirm release checklist and unresolved blockers.
2. Create/verify database and storage backups.
3. Deploy preview build.
4. Verify routes, assets, auth redirects, Supabase connectivity, protected routes, role routing, reports loading, and integration status.
5. Apply migrations in backed-up target environment.
6. Deploy Supabase Edge Functions.
7. Configure Supabase secrets and scheduled jobs, including `CRON_SECRET` for reminder/outbox workers.
8. Verify RLS, storage policies, Auth Site URL, redirect URLs, and email templates.
9. Promote frontend only after P0 blockers are closed.
10. Run post-deployment smoke test and record results.

## Rollback

- Frontend issue: redeploy previous known-good Vercel deployment.
- Database issue: Git rollback is not database rollback. Use a migration-specific rollback plan or restore backup after impact review.
- Integration issue: disable only the affected integration path where supported, keep manual clinic workflows available, and preserve logs.

See `ROLLBACK_GUIDE.md` before production release.
