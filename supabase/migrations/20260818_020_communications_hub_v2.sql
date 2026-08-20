-- Part 25: Communications Hub V2.
-- Adds source, branch, manual-send, payment, and retry metadata without replacing existing communication tables.

alter table public.communication_delivery_logs
  add column if not exists branch_id text,
  add column if not exists payment_id text,
  add column if not exists related_type text,
  add column if not exists related_id text,
  add column if not exists max_attempts integer,
  add column if not exists dispatch_mode text not null default 'automated',
  add column if not exists sent_by text default '',
  add column if not exists business_event text default '',
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_retry_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'communication_delivery_logs_related_type_check'
  ) then
    alter table public.communication_delivery_logs
      add constraint communication_delivery_logs_related_type_check
      check (related_type is null or related_type in ('appointment', 'payment', 'invoice', 'patient', 'manual', 'system'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'communication_delivery_logs_dispatch_mode_check'
  ) then
    alter table public.communication_delivery_logs
      add constraint communication_delivery_logs_dispatch_mode_check
      check (dispatch_mode in ('automated', 'manual'));
  end if;
end $$;

alter table public.communication_outbox
  add column if not exists patient_id text,
  add column if not exists branch_id text,
  add column if not exists max_attempts integer;

create index if not exists communication_delivery_logs_branch_status_idx
on public.communication_delivery_logs (branch_id, status, created_at desc);

create index if not exists communication_delivery_logs_related_idx
on public.communication_delivery_logs (related_type, related_id, created_at desc);

create index if not exists communication_delivery_logs_payment_idx
on public.communication_delivery_logs (payment_id, created_at desc)
where payment_id is not null;

create index if not exists communication_outbox_branch_status_idx
on public.communication_outbox (branch_id, status, next_attempt_at);

drop policy if exists "communication_logs_read_authenticated" on public.communication_delivery_logs;
drop policy if exists "communication_logs_write_authenticated" on public.communication_delivery_logs;

create policy "communication_logs_read_authenticated"
on public.communication_delivery_logs for select
using (
  auth.role() = 'authenticated'
  and not exists (select 1 from public.patients p where p.auth_user_id = auth.uid())
);

create policy "communication_logs_write_authenticated"
on public.communication_delivery_logs for all
using (
  auth.role() = 'authenticated'
  and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
)
with check (
  auth.role() = 'authenticated'
  and exists (select 1 from public.staff s where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
);
