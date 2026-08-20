# Deployment and Rollback Plan

## Pre-deploy
1. Confirm required migrations are committed and reviewed.
2. Take/verify database backup evidence before destructive or high-risk migration work.
3. Confirm production Supabase/Vercel environment variables without exposing secret values.
4. Run `npm run build`, `npm run lint`, `npm run verify:schema`, and `npm run verify:deployment` where available.
5. Resolve Critical/High blockers.

## Migration application
- Apply migrations forward in order.
- Record exact migration file and SQL Editor result.
- For Part 40 migration 030, verify old blanket communication policies are gone and hardened policies exist.
- Never mark a migration applied merely because the file exists in GitHub.

## Deploy
- Deploy the exact reviewed `main` commit.
- Verify Vercel build result.
- Smoke test `/`, `/login`, `/app`, `/app/appointments`, `/app/patients`, `/app/treatment-plans`, `/app/forms-consent`, `/app/recalls`, and a patient portal route.
- Confirm protected routes remain noindex and direct refresh does not 404.

## Frontend rollback
Use Vercel deployment rollback/redeploy of the last known-good commit when a frontend regression is isolated from data migrations.

## Database rollback
Do not blindly reverse applied data migrations. Prefer a forward corrective migration. If corruption/data loss is suspected, stop writes, preserve evidence, and use verified backup/restore procedures.

## Feature disable path
Where an integration is unavailable, disable the affected provider/configuration rather than simulate success.
