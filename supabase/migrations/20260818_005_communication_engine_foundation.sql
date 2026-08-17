create table if not exists public.communication_preferences (
  patient_id text primary key references public.patients(patient_id) on delete cascade,
  sms_enabled boolean not null default false,
  email_enabled boolean not null default false,
  messenger_enabled boolean not null default false,
  in_app_enabled boolean not null default true,
  preferred_channel text not null default 'in_app' check (preferred_channel in ('sms', 'email', 'messenger', 'in_app')),
  messenger_recipient_id text,
  messenger_connected_at timestamptz,
  consent_updated_at timestamptz,
  consent_updated_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  channel text not null check (channel in ('sms', 'email', 'messenger', 'in_app')),
  title text not null,
  subject text default '',
  body text not null,
  updated_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_key, channel)
);

create table if not exists public.communication_delivery_logs (
  id text primary key,
  patient_id text not null references public.patients(patient_id) on delete cascade,
  appointment_id text,
  channel text not null check (channel in ('sms', 'email', 'messenger', 'in_app')),
  template_key text not null,
  recipient text not null default '',
  subject text not null default '',
  message text not null,
  status text not null check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped')),
  provider text not null,
  provider_message_id text default '',
  attempt_count integer not null default 0,
  idempotency_key text not null unique,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_outbox (
  id text primary key,
  delivery_log_id text not null references public.communication_delivery_logs(id) on delete cascade,
  channel text not null check (channel in ('sms', 'email', 'messenger', 'in_app')),
  provider text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_settings (
  id text primary key default 'clinic',
  sms_provider text not null default 'semaphore',
  sms_sender_name text not null default 'PLAMENCO',
  sms_configured boolean not null default false,
  email_provider text not null default 'not_configured',
  email_configured boolean not null default false,
  messenger_provider text not null default 'meta_messenger',
  messenger_configured boolean not null default false,
  default_channels text[] not null default array['in_app', 'sms', 'email', 'messenger'],
  reminder_offsets_hours integer[] not null default array[48, 24, 2],
  max_retry_attempts integer not null default 3,
  timezone text not null default 'Asia/Manila',
  updated_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_delivery_logs_patient_idx on public.communication_delivery_logs(patient_id, created_at desc);
create index if not exists communication_delivery_logs_appointment_idx on public.communication_delivery_logs(appointment_id, created_at desc);
create index if not exists communication_outbox_status_idx on public.communication_outbox(status, next_attempt_at);

alter table public.communication_preferences enable row level security;
alter table public.communication_templates enable row level security;
alter table public.communication_delivery_logs enable row level security;
alter table public.communication_outbox enable row level security;
alter table public.communication_settings enable row level security;

drop policy if exists "communication_preferences_read_authenticated" on public.communication_preferences;
drop policy if exists "communication_preferences_write_authenticated" on public.communication_preferences;
drop policy if exists "communication_templates_read_authenticated" on public.communication_templates;
drop policy if exists "communication_templates_write_authenticated" on public.communication_templates;
drop policy if exists "communication_logs_read_authenticated" on public.communication_delivery_logs;
drop policy if exists "communication_logs_write_authenticated" on public.communication_delivery_logs;
drop policy if exists "communication_outbox_authenticated" on public.communication_outbox;
drop policy if exists "communication_settings_authenticated" on public.communication_settings;

create policy "communication_preferences_read_authenticated"
on public.communication_preferences for select
using (auth.role() = 'authenticated');

create policy "communication_preferences_write_authenticated"
on public.communication_preferences for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "communication_templates_read_authenticated"
on public.communication_templates for select
using (auth.role() = 'authenticated');

create policy "communication_templates_write_authenticated"
on public.communication_templates for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "communication_logs_read_authenticated"
on public.communication_delivery_logs for select
using (auth.role() = 'authenticated');

create policy "communication_logs_write_authenticated"
on public.communication_delivery_logs for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "communication_outbox_authenticated"
on public.communication_outbox for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "communication_settings_authenticated"
on public.communication_settings for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');
