-- Appointment operations, status history, check-in, queue and no-show foundation.

alter table public.appointments
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by text default '',
  add column if not exists waiting_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists started_by text default '',
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by text default '',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text default '',
  add column if not exists no_show_at timestamptz,
  add column if not exists no_show_by text default '',
  add column if not exists rescheduled_at timestamptz,
  add column if not exists rescheduled_by text default '';

create table if not exists public.appointment_status_history (
  id text primary key,
  appointment_id text not null,
  event_type text not null check (event_type in ('created', 'status_changed', 'checked_in', 'moved_to_waiting', 'started', 'completed', 'cancelled', 'no_show', 'rescheduled', 'provider_changed')),
  from_status text,
  to_status text,
  changed_by text not null default '',
  changed_at timestamptz not null default now(),
  reason text default '',
  notes text default '',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists appointment_status_history_appointment_idx on public.appointment_status_history (appointment_id, changed_at);
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'branch_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'appointments'
      and column_name = 'provider_id'
  ) then
    create index if not exists appointments_operations_today_idx
    on public.appointments (appointment_date, branch_id, provider_id, status);
  else
    create index if not exists appointments_operations_today_idx
    on public.appointments (appointment_date, status);
  end if;
end;
$$;

alter table public.appointment_status_history enable row level security;

drop policy if exists "appointment_status_history_read_authorized" on public.appointment_status_history;
drop policy if exists "appointment_status_history_write_internal" on public.appointment_status_history;

create policy "appointment_status_history_read_authorized"
on public.appointment_status_history for select
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.appointments a
    join public.patients p on (
      p.id::text = a.patient_id::text
      or p.patient_id = a.patient_id::text
    )
    where a.id::text = appointment_status_history.appointment_id::text
      and p.auth_user_id = auth.uid()
  )
);

create policy "appointment_status_history_write_internal"
on public.appointment_status_history for all
using (public.is_internal_profile())
with check (public.is_internal_profile());

create or replace function public.validate_appointment_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if old.status = 'pending' and new.status not in ('confirmed', 'rejected', 'cancelled') then
      raise exception 'Invalid appointment status transition';
    elsif old.status = 'confirmed' and new.status not in ('checked_in', 'rescheduled', 'cancelled', 'no_show') then
      raise exception 'Invalid appointment status transition';
    elsif old.status = 'checked_in' and new.status not in ('waiting', 'in_progress', 'cancelled') then
      raise exception 'Invalid appointment status transition';
    elsif old.status = 'waiting' and new.status not in ('in_progress', 'cancelled') then
      raise exception 'Invalid appointment status transition';
    elsif old.status = 'in_progress' and new.status not in ('completed') then
      raise exception 'Invalid appointment status transition';
    elsif old.status in ('completed', 'rejected', 'cancelled', 'no_show', 'rescheduled') then
      raise exception 'Appointment status is terminal';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_appointment_status_transition_before_update on public.appointments;
create trigger validate_appointment_status_transition_before_update
before update on public.appointments
for each row execute procedure public.validate_appointment_status_transition();
