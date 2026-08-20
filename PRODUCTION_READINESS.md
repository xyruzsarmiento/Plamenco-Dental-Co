# Plamenco Dental Co. Production Readiness

Final release recommendation: `NOT READY - BLOCKERS REMAIN`

Code and documentation are prepared for production configuration, but production launch is blocked until P0 security/payment checks and required environment verification are completed.

| Area | Status | Notes |
|---|---|---|
| Frontend | READY WITH CONFIGURATION | Vite/React build passes locally; production hosting still needs configured env/domain. |
| Database | READY WITH CONFIGURATION | Migrations are ordered and non-destructive by keyword scan; must be applied only after backup. |
| Authentication | BLOCKED | Production Site URL, redirect URLs, real account tests, and email confirmation need verification. Legacy local staff-password fallback is now disabled unless explicit dev/demo flag is enabled. |
| Patient Portal | BLOCKED | Patient isolation requires two real Supabase patient accounts and direct-access testing. |
| Staff Portal | NOT VERIFIED | Needs real staff role test and branch/permission checks. |
| Dentist Portal | NOT VERIFIED | Needs real dentist and associate dentist account tests. |
| Super Admin | READY WITH CONFIGURATION | Control center exists; bootstrap must use secure invitation/Auth flow. |
| Appointments | NOT VERIFIED | Needs clinic-day UAT with Pulilan/Plaridel schedules. |
| Clinical | NOT VERIFIED | Needs dentist UAT; avoid destructive edits to completed history. |
| Billing | NOT VERIFIED | Local logic exists; real invoice/payment workflow needs UAT. |
| Payments | BLOCKED | Online gateway webhook/signature/amount/idempotency verification required. |
| Inventory | READY WITH CONFIGURATION | Opening balances and physical reconciliation required. |
| Expenses | READY WITH CONFIGURATION | Categories and approval/history practices need clinic confirmation. |
| Reports | NOT VERIFIED | Exports exist; reconcile against first-day clinic records. |
| PDF | NOT VERIFIED | Browser print/export path needs role-based UAT. |
| Excel | NOT VERIFIED | Export path and import files must remain private. |
| Email | READY WITH CONFIGURATION | Server-side provider credentials and delivery logs required. |
| SMS | READY WITH CONFIGURATION | Server-side provider credentials and failure handling required. |
| Messenger | READY WITH CONFIGURATION | Meta app/page/webhook configuration required. |
| Historical Import | READY WITH CONFIGURATION | Real workbook not provided; do not migrate without clinic review. |
| Backups | BLOCKED | Backup and restore capability not verified. |
| Security | BLOCKED | P0 role/isolation tests remain. |
| Deployment | READY WITH CONFIGURATION | Vercel SPA rewrite and headers exist; preview deployment should precede production. |
| Domain | READY WITH CONFIGURATION | HTTPS domain and auth redirects still need final values. |
| Monitoring | READY WITH CONFIGURATION | System Health foundation exists; external monitoring/provider logs need configuration. |

## Security Pass

- No service-role env usage found in browser source by pattern scan.
- `.env` and patient workbook patterns are ignored; `.env.example` remains trackable.
- Production local staff-password authentication is disabled by default; staff/dentist/admin access should use Supabase Auth profiles.
- Authenticated routes now switch robots metadata to `noindex, nofollow` in the SPA.
- RLS policies exist across patient, appointment, billing, communication, inventory, expense, reporting, and admin tables, but production role tests are still required.
- Payment amount validation and idempotency are present in the server-side payment webhook RPC, but provider sandbox/live tests remain required.
- Private storage bucket coverage is partial: expense attachments bucket exists; clinical documents, payment proofs, and historical imports need explicit bucket/policy verification.

## Part 28 Stabilization Artifacts

- `PRODUCTION_RELEASE_CHECKLIST.md`
- `SECURITY_AUDIT.md`
- `QA_REPORT.md`
- `KNOWN_ISSUES.md`
- `E2E_TEST_MATRIX.md`
