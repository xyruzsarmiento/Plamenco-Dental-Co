# Plamenco Dental Co. Incident Response

Record all incidents with timestamp, reporter, affected module, severity, scope, action taken, and resolution.

## System Inaccessible

1. Check Vercel deployment status, domain/DNS, Supabase status, and browser console/network errors.
2. Use clinic continuity process for appointments, check-in, treatment, and cash/manual payments.
3. Avoid redeploying unreviewed code directly to production.

## Compromised Staff Account

1. Deactivate the account.
2. Reset credentials through Supabase Auth.
3. Review audit logs and recent actions.
4. Review affected patients, payments, inventory, expenses, and exports.
5. Restore access only after resolution.

## Wrong Patient Access Suspected

1. Preserve evidence and do not edit records to hide the issue.
2. Disable affected account/session where necessary.
3. Review RLS, auth profile, patient auth_user_id, route, and audit logs.
4. Escalate to clinic owner and technical administrator.

## Payment Discrepancy

1. Do not delete payment records.
2. Compare gateway dashboard, payment record, invoice, webhook event, receipt, and audit log.
3. Use refund, void, or adjustment workflows where appropriate.

## Database Issue

1. Stop destructive changes.
2. Capture the exact error and affected release/import/migration.
3. Verify latest backup and assess scope.
4. Restore only when justified and authorized.
5. Reconcile transactions created after backup timestamp.

## Integration Failure

If SMS, email, Messenger, or payment provider fails, record the failure and keep core clinic operations available. Payment gateway failures must not mark payments successful.
