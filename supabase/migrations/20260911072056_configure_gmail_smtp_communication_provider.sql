-- Keep the provider choice in the database, while requiring server-side SMTP
-- secrets and an explicit operator enablement before patient email is queued.
insert into public.communication_settings (id, email_provider, email_configured, updated_by)
values ('clinic', 'gmail_smtp', false, 'system migration')
on conflict (id) do update
set email_provider = case
  when public.communication_settings.email_provider = 'not_configured' then excluded.email_provider
  else public.communication_settings.email_provider
end,
updated_at = now();
