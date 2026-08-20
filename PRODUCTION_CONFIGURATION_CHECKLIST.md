# Production Configuration Checklist

Use only these states: Configured, Not Configured, Not Required, Unverified.

| Configuration | Status | Evidence / Owner |
|---|---|---|
| Supabase URL | Unverified | Confirm production environment |
| Supabase anon key | Unverified | Confirm production environment; not a secret service-role key |
| Site URL | Unverified | Confirm final domain |
| Auth redirect URLs | Unverified | Verify production and password-reset redirects |
| Production domain | Unverified | Confirm DNS/HTTPS |
| Vercel production environment | Unverified | Confirm project/environment assignment |
| Payment provider | Unverified | Provider, credentials, webhook and live-mode test required |
| Payment webhook verification | Unverified | Verify signature/idempotency behavior |
| Email provider | Unverified | Server-side provider configuration required |
| SMS provider | Unverified | Server-side provider configuration required if used |
| Messenger provider | Unverified | Configure only if clinic enables it |
| In-app notifications | Unverified | Verify persisted read/unread behavior |
| Private document storage | Unverified | Verify bucket privacy and signed access |
| Signature storage | Unverified | Verify private access |
| Report storage | Unverified | Must not be public |
| Receipt storage | Unverified | Verify patient ownership and private access |
| Scheduler / cron | Unverified | Required only for enabled automation |
| Management report worker | Unverified | Generation/delivery worker must be server-side |
| Asia/Manila timezone | Unverified | Verify scheduled jobs/business-date behavior |
| Backup verification | Unverified | Evidence required |
| Restore rehearsal | Unverified | Evidence required |
| Incident contacts | Unverified | Clinic decision required |

Never place service-role keys, payment secrets, email passwords, SMS tokens, Messenger tokens or other private credentials in this file.
