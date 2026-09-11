# Outbound Email Setup

This project uses two server-side email paths. Supabase Auth owns invitation, password-reset, and verification tokens. Patient-care messages use the existing communication outbox and delivery log.

## Patient-care messages

The intended flow is:

`appointment or billing event -> communication_delivery_logs -> communication_outbox -> process-communication-outbox -> SMTP -> delivery log`

Appointment confirmations, reschedules, cancellations, reminders, and manual resend actions already enter the shared communication service. Reminder scheduling is handled by `queue-appointment-reminders`. The worker does not run from appointment React components.

Recall/follow-up and financial records already have patient-facing/in-app communication concepts, but their current mutation paths do not automatically create an email outbox job for every event. They must be routed through the same communication service before those specific email notices are enabled; changing the SMTP adapter alone does not silently turn them into email.

`process-communication-outbox` uses Gmail SMTP when all of these Supabase Edge Function secrets are present:

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=clinic-mailbox@example.com
SMTP_PASSWORD=<Google App Password>
SMTP_FROM_EMAIL=clinic-mailbox@example.com
SMTP_FROM_NAME=Plamenco Dental Co.
```

Port `465` is also supported for implicit TLS. Port `587` uses STARTTLS. The worker marks an email `sent` only after Gmail accepts the SMTP message. Connection or provider failures remain `failed` or `queued` according to retry policy, while the appointment/payment/clinical transaction remains unchanged. `communication_delivery_logs` records the recipient, template, related entity, queued time, sent time, failure state, attempt count, and provider message id where available.

The older `EMAIL_PROVIDER_ENDPOINT` / `EMAIL_API_KEY` / `EMAIL_FROM` path remains as a server-side HTTP-provider fallback when SMTP is not configured. It must not be populated in browser environment variables.

After configuring the secrets, set the clinic row so the queue can select email:

```sql
update public.communication_settings
set email_provider = 'gmail_smtp',
    email_configured = true,
    updated_at = now()
where id = 'clinic';
```

Keep this `false` until the SMTP secrets and a safe test recipient have been verified in the matching environment. Development should use a disposable mailbox or a local capture service; it must not send real patient mail by default.

## Supabase Auth email

Configure this in the Supabase Dashboard for each project under Authentication email/SMTP settings, or through the Supabase Management API. Use the same Gmail SMTP host, port, username, App Password, sender email, and sender name. This is separate from the patient communication worker because Supabase Auth must keep ownership of secure invitation and recovery tokens.

Set the Auth URL configuration separately:

```text
Development site URL: http://localhost:5173
Development redirect URL: http://localhost:5173/accept-invite
Production site URL: https://<actual-deployed-domain>
Production redirect URL: https://<actual-deployed-domain>/accept-invite
```

The invitation Edge Function generates the callback from `SITE_URL` / `PUBLIC_SITE_URL` / `APP_URL` and appends `/accept-invite`. It never constructs auth tokens in React. `SITE_URL` must be configured per environment; do not use localhost as a production default.

## Secret handling

- Store SMTP credentials only in Supabase project secrets or an equivalent server-side secret manager.
- Do not add them to `VITE_*` variables, React code, localStorage, PostgreSQL application tables, or Git.
- Use a Google App Password with 2-Step Verification enabled. Do not use the ordinary Gmail password.
- Rotate the App Password if it is exposed and review Gmail account activity.

## Resend and operations

Failed patient email jobs remain visible in `communication_delivery_logs` and can be retried through the existing communication operations path. A successful clinical or billing event is never rolled back because email delivery fails.

Before enabling production delivery, run the worker with a disposable recipient, confirm the corresponding outbox row moves from `queued` to `sent`, and confirm the delivery log has `sent_at`. Also force an SMTP failure and confirm the business record remains intact while the delivery log records the failure.
