-- Part 40: production security hardening.
-- Removes legacy blanket-authenticated access from communication logs/outbox.
-- Forward-safe and rerunnable: exact policy names are dropped before recreation.

alter table public.communication_delivery_logs enable row level security;
alter table public.communication_outbox enable row level security;

-- Legacy Part 5 policies granted every authenticated user broad access.
drop policy if exists "communication_logs_read_authenticated" on public.communication_delivery_logs;
drop policy if exists "communication_logs_write_authenticated" on public.communication_delivery_logs;
drop policy if exists "communication_outbox_authenticated" on public.communication_outbox;

-- Also drop the hardened names before recreation so this migration can be rerun safely.
drop policy if exists "communication_logs_read_self_or_authorized" on public.communication_delivery_logs;
drop policy if exists "communication_logs_insert_authorized" on public.communication_delivery_logs;
drop policy if exists "communication_logs_update_authorized" on public.communication_delivery_logs;
drop policy if exists "communication_outbox_read_authorized" on public.communication_outbox;
drop policy if exists "communication_outbox_insert_authorized" on public.communication_outbox;
drop policy if exists "communication_outbox_update_authorized" on public.communication_outbox;

create policy "communication_logs_read_self_or_authorized"
on public.communication_delivery_logs
for select
using (
  public.has_profile_permission('communications.manage'::text)
  or public.has_profile_permission('notifications.view'::text)
  or exists (
    select 1
    from public.patients p
    where p.patient_id = communication_delivery_logs.patient_id
      and p.auth_user_id = auth.uid()
  )
);

create policy "communication_logs_insert_authorized"
on public.communication_delivery_logs
for insert
with check (
  public.has_profile_permission('communications.manage'::text)
  or public.has_profile_permission('notifications.send'::text)
);

create policy "communication_logs_update_authorized"
on public.communication_delivery_logs
for update
using (
  public.has_profile_permission('communications.manage'::text)
  or public.has_profile_permission('notifications.send'::text)
)
with check (
  public.has_profile_permission('communications.manage'::text)
  or public.has_profile_permission('notifications.send'::text)
);

create policy "communication_outbox_read_authorized"
on public.communication_outbox
for select
using (
  public.has_profile_permission('communications.manage'::text)
  or public.has_profile_permission('notifications.send'::text)
);

create policy "communication_outbox_insert_authorized"
on public.communication_outbox
for insert
with check (
  public.has_profile_permission('communications.manage'::text)
  or public.has_profile_permission('notifications.send'::text)
);

create policy "communication_outbox_update_authorized"
on public.communication_outbox
for update
using (
  public.has_profile_permission('communications.manage'::text)
  or public.has_profile_permission('notifications.send'::text)
)
with check (
  public.has_profile_permission('communications.manage'::text)
  or public.has_profile_permission('notifications.send'::text)
);

-- Do not expose direct table deletion through ordinary authenticated policies.
-- Service-role Edge Functions continue to bypass RLS for trusted delivery processing.

comment on table public.communication_delivery_logs is
'Provider-backed communication delivery history. Patient reads are self-only; internal access requires communication/notification permissions.';

comment on table public.communication_outbox is
'Server-side communication delivery queue. Direct authenticated access is restricted to explicitly authorized internal roles.';
