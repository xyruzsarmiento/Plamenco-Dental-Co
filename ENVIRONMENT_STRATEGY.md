# Plamenco Dental Co. Environment Strategy

The release path is local development to GitHub to Vercel preview to staging to production. Each environment must use its own Supabase project and provider configuration unless the clinic owner explicitly approves a narrower setup for a temporary period.

## Development

Purpose: local coding, debugging, and developer testing.

- Frontend: local Vite dev server from `npm.cmd run dev`.
- Supabase: development project only, never the production clinic database.
- Data: synthetic or sanitized data.
- Env file: `.env.local`, ignored by Git.
- Communications: no real patient SMS, email, or Messenger delivery.
- Payments: no live payment credentials.
- Search indexing: `VITE_DEPLOYMENT_ENV=development` keeps all routes `noindex`.

## Staging

Purpose: production-like verification before release.

- Frontend: Vercel preview/staging deployment from `develop` or release branch.
- Supabase: dedicated staging project.
- Data: synthetic, sanitized, or clinic-approved migration rehearsal data.
- Migrations: apply all pending migrations here before production.
- Edge Functions: deployed with staging secrets only.
- Communications: use safe test recipients or provider sandbox modes.
- Payments: sandbox/test mode only.
- Search indexing: `VITE_DEPLOYMENT_ENV=staging` keeps all routes `noindex`.

## Production

Purpose: real clinic operations for Pulilan and Plaridel.

- Frontend: Vercel production deployment from `main`.
- Supabase: dedicated production project.
- Data: real patient, clinical, financial, inventory, and audit data.
- Migrations: reviewed, backed up, and applied only through the release procedure.
- Edge Functions: deployed with production secrets only after approval.
- Communications and payments: live only after provider onboarding and smoke tests.
- Search indexing: `VITE_DEPLOYMENT_ENV=production`; private/auth routes remain `noindex`.

## Environment Variable Classification

| Variable | Class | Required Where | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Client safe, environment specific | Frontend | Browser-safe project URL for the matching environment. |
| `VITE_SUPABASE_ANON_KEY` | Client safe, environment specific | Frontend | Supabase anon key; relies on RLS, not secrecy. |
| `VITE_DEPLOYMENT_ENV` | Client safe, environment specific | Frontend | Use `development`, `staging`, or `production`; controls robots behavior. |
| `VITE_ENABLE_LEGACY_LOCAL_AUTH` | Client safe, development only | Local dev only | Must be absent or `false` outside local development. |
| `SUPABASE_URL` | Server only, environment specific | Edge Functions | Matching Supabase project URL. |
| `SUPABASE_ANON_KEY` | Server only, environment specific | Invite Edge Function | Used to authenticate the caller token. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only secret | Edge Functions | Never expose to Vite/browser. |
| `CRON_SECRET` | Server only secret | Scheduled Edge Functions | Required by reminder/outbox jobs. |
| `SITE_URL`, `PUBLIC_SITE_URL`, `APP_URL` | Environment specific | Auth/invites/docs | Must match the current environment host. |
| `EMAIL_PROVIDER_ENDPOINT`, `EMAIL_API_KEY`, `EMAIL_FROM` | Server only, optional until email enabled | Communication worker | Use staging/test provider config before production. |
| `SMS_PROVIDER_ENDPOINT`, `SMS_API_KEY`, `SMS_SENDER_NAME` | Server only, optional until SMS enabled | Communication worker | Staging must not message real patients casually. |
| `META_PAGE_ACCESS_TOKEN`, `META_APP_SECRET`, `META_VERIFY_TOKEN` | Server only, optional until Messenger enabled | Messenger functions | Requires actual clinic Facebook Page authorization. |
| `PAYMENT_WEBHOOK_SECRET` | Server only, optional until online payments enabled | Payment webhook | Separate sandbox/live secrets. |

`PAYMENT_PROVIDER`, `PAYMENT_ENVIRONMENT`, and `PAYMENT_SECRET_KEY` are documented placeholders for the payment provider onboarding path. They must not be used in the browser bundle.
