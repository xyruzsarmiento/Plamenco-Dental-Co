# Plamenco Dental Co. QA Report

Status values: `PASS`, `FAIL`, `NOT RUN`, `BLOCKED`, `NOT CONFIGURED`.

| Feature | Scenario | Expected | Actual | Status | Notes |
|---|---|---|---|---|---|
| Build | Production build | TypeScript and Vite build complete. | `npm.cmd run build` passed after Part 29 edits. | PASS | Vite still reports large chunk warning. |
| Lint | Static lint | Existing lint script completes. | `npm.cmd run lint` passed after Part 29 edits. | PASS | `oxlint` only; no separate test script exists. |
| Schema Artifacts | Offline migration/documentation sanity check | Required Part 29 docs and consolidation SQL markers exist. | `npm.cmd run verify:schema` passed after Part 29 edits. | PASS | Does not replace a real Supabase migration replay. |
| Deployment Readiness | Offline deployment sanity check | Vercel rewrite, env example, gitignore, public assets, Edge Functions, and cron guards are present. | `npm.cmd run verify:deployment` passed after Part 30 edits. | PASS | Does not replace actual Vercel/Supabase staging deployment. |
| Daily Workflow | Staff operational home | Today view shows branch/search filter, queue status, waiting patients, dentist queue, and billing handoff. | Dashboard connected to existing appointment/treatment/billing stores in Part 31. | PASS LOCAL | Real multi-user Supabase behavior still needs staging. |
| Public Booking | Branch-aware patient booking | Patient chooses branch, service, dentist preference, date, time, details, and confirmation. | Public booking updated in Part 32. | PASS LOCAL | Needs mobile and Supabase staging verification. |
| Patient Status Language | No raw enums in patient appointment/payment history | Patient-facing labels are friendly. | Portal status labels added in Part 32. | PASS LOCAL | Needs visual review across all patient tabs. |
| Patient Privacy | Patient-visible data boundaries | Matrix distinguishes patient-visible vs internal-only data. | `PATIENT_DATA_VISIBILITY.md` added. | NOT RUN | RLS/API tests still required. |
| Check-In | Scheduled arrival | Confirmed appointment can move to checked in from daily home. | Uses existing appointment transition and timestamp model. | PASS LOCAL | Needs RLS/two-user staging test. |
| Dentist Visit | Start visit | Waiting/checked-in patient can move to in treatment and create/reuse clinical visit. | Dashboard Start Visit calls existing transition and clinical visit creation. | PASS LOCAL | Dashboard opens appointments module for clinical workspace review. |
| Billing Handoff | Completed visit | Completed appointment with unbilled treatments/open balance appears for cashier review. | For Billing queue derives from appointments, treatments, charges, and invoices. | PASS LOCAL | Payment recording still tested through Billing page, not dashboard. |
| Database Integrity RPC | Duplicate/orphan/invalid data diagnostics | System admin can run read-only integrity report. | Migration and docs added. | NOT RUN | Requires migrated Supabase staging database. |
| Routes | Public and protected routes | No blank page/404 for known routes. | Local smoke check returned 200 for `/`, `/login`, `/register`, `/book`, `/app`, `/app/system-admin`, `/portal/PT-TEST`, and `/reset-password`. | PASS | This verifies SPA route response, not role authorization. |
| Auth | Production staff auth | Supabase Auth/profile required in production. | Local fallback now dev-flag gated. | PASS | `VITE_ENABLE_LEGACY_LOCAL_AUTH=false` by default. |
| Patient IDOR | Mismatched portal URL | Patient cannot stay on another patient URL. | Frontend guard redirects. | PASS | Server-side two-account RLS test still blocked. |
| Payments | Webhook idempotency | Duplicate gateway event does not duplicate payment/receipt. | Store test exists; Edge Function delegates to RPC. | NOT RUN | Provider sandbox test not configured. |
| Appointments | Status transitions | Impossible transitions rejected. | Store transition map and expected updated timestamp guard inspected. | PASS | UI E2E still needed. |
| Inventory | Negative stock | Stock operation cannot create negative quantity. | Store throws on negative stock. | PASS | Database concurrency test not run. |
| Backup/System Health | No fake operational state | Unknown/not configured shown when checks are unavailable. | Part 27 dashboard uses evidence registry and unknown states. | PASS | Platform backup not verified. |
| SEO Privacy | Private portals | Auth/private routes noindex. | Route-aware robots meta added. | PASS | Deployment crawler behavior still to verify. |
| SEO Privacy | Staging/preview | Non-production deployments noindex. | `VITE_DEPLOYMENT_ENV` drives global noindex outside production. | PASS | Must set Vercel environment variable correctly. |
| Modals | Dangerous actions | Accessible app-native confirmations/forms. | Browser prompts/alerts remain in several pages. | FAIL | Known issue; broad remediation needed. |
| Performance | Bundle size | No unexplained oversized production bundle. | Build warns main JS chunk exceeds 500 kB. | FAIL | Code splitting review needed. |
