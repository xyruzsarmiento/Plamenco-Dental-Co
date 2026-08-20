# Plamenco Dental Co. Release Checklist

Release candidate: `v1.0.0` production launch

- [ ] Build passed
- [ ] Lint passed
- [ ] Schema verification passed
- [ ] Deployment readiness verification passed
- [ ] CI passed
- [ ] Existing tests passed or failures documented
- [ ] UAT passed
- [ ] P0 blockers resolved
- [ ] P1 blockers reviewed and accepted/resolved
- [ ] Database backed up
- [ ] Backup verified
- [ ] Migrations reviewed
- [ ] Environment variables verified
- [ ] Development, staging, and production environment variables are separated
- [ ] Supabase Edge Function secrets configured
- [ ] Scheduled Edge Functions protected by `CRON_SECRET`
- [ ] RLS verified
- [ ] Storage buckets and policies verified
- [ ] Auth Site URL and redirect URLs verified
- [ ] HTTPS production domain active
- [ ] Branches configured
- [ ] Services and prices confirmed
- [ ] Providers configured
- [ ] Staff configured with least privilege
- [ ] Super Admin bootstrap completed securely
- [ ] Integrations configured
- [ ] Payment sandbox verified
- [ ] Payment production webhook verified before enabling live online payments
- [ ] Historical migration reconciled if performed
- [ ] Inventory opening balances confirmed
- [ ] Reports verified against clinic records
- [ ] Client sign-off received
