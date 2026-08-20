# Plamenco Dental Co. Production Release Checklist

Do not mark production ready while any P0 blocker remains open.

## Configuration

- [ ] Production Supabase project selected and backed up.
- [ ] Development, staging, and production Supabase projects are separate.
- [ ] `VITE_DEPLOYMENT_ENV=production` configured only for production.
- [ ] `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` configured in hosting.
- [ ] Preview/staging deployments do not use production Supabase variables.
- [ ] Supabase Auth Site URL and redirect URLs configured for production HTTPS domain.
- [ ] Email confirmation URL verified.
- [ ] Password reset URL verified.
- [ ] `VITE_ENABLE_LEGACY_LOCAL_AUTH` absent or `false` in production.
- [ ] Server-only Supabase service-role key configured only as Edge Function secret.
- [ ] `CRON_SECRET` configured only for scheduled Edge Function invocations.
- [ ] Vercel SPA rewrite verified for direct nested routes.
- [ ] Production custom domain and canonical host approved by clinic owner.

## Security

- [ ] RLS enabled and verified table by table.
- [ ] `RLS_POLICY_MATRIX.md` verified with direct anon, patient, staff, dentist, branch manager, admin, and super admin API calls.
- [ ] Patient A cannot access Patient B records by direct URL/API.
- [ ] Staff, dentist, associate dentist, admin, and super admin direct API permissions verified.
- [ ] Pulilan-only staff cannot access Plaridel-only operational records.
- [ ] Clinical records, documents, internal notes, invoices, payments, expenses, provider compensation, and audit logs checked for role leakage.
- [ ] Storage bucket public/private policy reviewed.
- [ ] No committed `.env`, workbook, backup, dump, certificate, or credential files.

## Integrations

- [ ] Edge Functions deployed to the correct Supabase project.
- [ ] Scheduled jobs send `CRON_SECRET` and cannot be triggered anonymously.
- [ ] Payment webhook signature verification tested.
- [ ] Payment amount matching and duplicate webhook idempotency tested.
- [ ] SMS provider configured and failure behavior tested.
- [ ] Email provider configured and failure behavior tested.
- [ ] Messenger page/webhook configured and signature verification tested.
- [ ] Appointment reminder scheduled job deployed and observed.
- [ ] Communication outbox worker deployed and observed.

## Data

- [ ] `npm.cmd run verify:schema` passes before production migration.
- [ ] `npm.cmd run verify:deployment` passes before production release.
- [ ] Production migrations applied only after verified recovery point.
- [ ] Part 29 migration applied after all earlier migrations in filename order.
- [ ] `public.run_database_integrity_checks()` returns no unresolved critical findings.
- [ ] Legacy import dry run completed with clinic-approved workbook.
- [ ] Duplicate import handling reviewed.
- [ ] Import does not trigger patient communications or false same-day analytics.
- [ ] Opening inventory balances physically reconciled.
- [ ] Expense categories and branch accounting rules approved.

## QA

- [ ] `npm.cmd run lint` passes.
- [ ] `npm.cmd run build` passes.
- [ ] GitHub Actions CI passes on the release branch.
- [ ] `CLINIC_WORKFLOW_AUDIT.md` P0/P1 workflow issues are closed or accepted by clinic owner.
- [ ] Route sweep covers public, patient, staff, dentist, and super admin routes.
- [ ] End-to-end core patient journey tested.
- [ ] No-show, walk-in, legacy patient, inventory, expense, and communication failure scenarios tested.
- [ ] Responsive QA completed at 1920, 1440, 1280, 1024, 768, and 390 px.
- [ ] Accessibility pass covers forms, keyboard navigation, focus, icon labels, and modal replacement priorities.

## Recovery

- [ ] Platform database backup availability confirmed.
- [ ] Storage/document backup process confirmed.
- [ ] `ROLLBACK_GUIDE.md` reviewed by release owner.
- [ ] Restore permission owners confirmed.
- [ ] Test restore rehearsal completed in non-production.
- [ ] RPO and RTO approved by clinic owner.
