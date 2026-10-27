-- Configure the communication engine to use UniSMS and Gmail SMTP.
-- Credentials remain in Supabase Edge Function secrets and are never stored in SQL.
-- Preserve existing configured flags; the operator must verify secrets before enabling delivery.

insert into public.communication_settings (id, sms_provider, email_provider)
values ('clinic', 'unisms', 'gmail_smtp')
on conflict (id) do update
set
  sms_provider = excluded.sms_provider,
  email_provider = excluded.email_provider,
  updated_at = now();
