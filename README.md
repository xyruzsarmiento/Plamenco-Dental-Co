# Plamenco Dental Co

Dental Clinic Management System foundation for a small clinic workflow.

## Current Audit

- Framework: Vite, React, TypeScript
- Frontend: modular React app under `src/app`, `src/components`, `src/features`, `src/lib`, and `src/pages`
- Backend: Supabase Edge Function integration boundary for account invitations, communication outbox processing, appointment reminder scheduling, Meta Messenger webhook handling, and payment gateway webhooks
- Database: Supabase client adapter and migrations under `supabase/migrations`
- Authentication: protected route foundation with Supabase Auth integration and environment-aware redirect URLs
- Components: reusable button, input, select, badge, empty state, page scaffold, app layout, and sidebar navigation
- Styling: global CSS design system in `src/index.css`
- Routing: React Router with protected workspace routes and login route
- Environment variables: see `.env.example`
- Utilities: Supabase config helper in `src/lib/supabase.ts`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Environment

Copy `.env.example` to `.env.local` for local development and provide values locally only:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Only browser-safe variables should use `VITE_*`. SMS, email, Meta Messenger, payment gateway, webhook, and service-role credentials must be configured as Supabase Edge Function secrets, never in frontend source.

`VITE_ENABLE_LEGACY_LOCAL_AUTH` is a development-only escape hatch for old local staff records and must remain `false` in production. Production staff, dentist, admin, and patient access should use Supabase Auth plus profile/permission records.

## Environment Classification

| Variable | Required For | Scope |
|---|---|---|
| `VITE_SUPABASE_URL` | Browser Supabase client | Client safe |
| `VITE_SUPABASE_ANON_KEY` | Browser Supabase client | Client safe |
| `VITE_ENABLE_LEGACY_LOCAL_AUTH` | Local development fallback only | Client safe, development only |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions and trusted workers | Server only |
| `EMAIL_*`, `SMS_*`, `META_*`, `PAYMENT_*` | Provider integrations and webhooks | Server only |

## Production Integration

- SPA hosting needs a fallback rewrite to `index.html`; `vercel.json` is included for Vercel direct-route support.
- Supabase Auth Site URL and redirect URLs must point to the selected HTTPS production domain before go-live.
- Deploy Edge Functions from `supabase/functions` and configure required server-side secrets in Supabase.
- Use provider sandbox/test credentials for payment development until the production merchant account is approved.
- Run the appointment reminder function from a server-side schedule such as Supabase Scheduled Functions or cron; do not rely on a browser tab staying open.
- See `GO_LIVE_CHECKLIST.md` for the production readiness checklist.
- Production handover documents live in `CLINIC_HANDOVER.md`, `PRODUCTION_READINESS.md`, `RELEASE_CHECKLIST.md`, `BACKUP_RECOVERY.md`, `INCIDENT_RESPONSE.md`, `STAFF_GUIDE.md`, `DENTIST_GUIDE.md`, `SUPER_ADMIN_GUIDE.md`, `PATIENT_GUIDE.md`, and `CLINIC_OWNER_GUIDE.md`.
- Do not deploy production until P0 blockers in `LAUNCH_BLOCKERS.md` are resolved and the clinic signs `CLIENT_SIGNOFF_CHECKLIST.md`.

## Part 1 Scope

This part establishes the application shell, design system, routing, auth foundation, database connection placeholder, responsive sidebar, and placeholder pages. It does not implement patient management, appointments, billing, dental records, or the odontogram yet.
