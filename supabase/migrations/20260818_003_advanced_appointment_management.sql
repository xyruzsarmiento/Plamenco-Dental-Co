-- Advanced appointment management foundation.
-- Adds branch/provider scheduling fields and database-level provider overlap prevention.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$
begin
  if not exists (select 1 from pg_class where relkind = 'S' and relname = 'appointment_number_seq') then
    create sequence public.appointment_number_seq start 1;
  end if;
end;
$$;

alter table public.appointments
  add column if not exists appointment_number text,
  add column if not exists branch_id uuid references public.branches(id) on delete restrict,
  add column if not exists provider_id uuid references public.providers(id) on delete restrict,
  add column if not exists duration_minutes integer,
  add column if not exists estimated_amount_cents integer,
  add column if not exists payment_status text not null default 'not_billed',
  add column if not exists reason_for_visit text default '',
  add column if not exists patient_notes text default '',
  add column if not exists internal_notes text default '',
  add column if not exists booking_source text not null default 'staff_entry';

update public.appointments
set appointment_number = 'APT-' || lpad(nextval('public.appointment_number_seq')::text, 6, '0')
where appointment_number is null or appointment_number = '';

alter table public.appointments
  alter column appointment_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_appointment_number_key'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments add constraint appointments_appointment_number_key unique (appointment_number);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_status_check_v2'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments drop constraint if exists appointments_status_check;
    alter table public.appointments
      add constraint appointments_status_check_v2
      check (status in ('pending', 'confirmed', 'rejected', 'cancelled', 'rescheduled', 'no_show', 'checked_in', 'waiting', 'in_progress', 'completed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_payment_status_check'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_payment_status_check
      check (payment_status in ('not_billed', 'unpaid', 'partially_paid', 'paid', 'refunded'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_booking_source_check'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_booking_source_check
      check (booking_source in ('patient_portal', 'walk_in', 'phone', 'facebook', 'staff_entry', 'imported'));
  end if;
end;
$$;

create or replace function public.set_appointment_number()
returns trigger
language plpgsql
as $$
begin
  if new.appointment_number is null or new.appointment_number = '' then
    new.appointment_number := 'APT-' || lpad(nextval('public.appointment_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists set_appointment_number_before_insert on public.appointments;
create trigger set_appointment_number_before_insert
before insert on public.appointments
for each row execute procedure public.set_appointment_number();

create or replace function public.appointment_time_range(appointment_date date, start_time text, end_time text)
returns tsrange
language sql
immutable
as $$
  select tsrange(
    (appointment_date::text || ' ' || start_time)::timestamp,
    (appointment_date::text || ' ' || end_time)::timestamp,
    '[)'
  )
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'appointments_provider_no_overlap'
      and conrelid = 'public.appointments'::regclass
  ) then
    alter table public.appointments
      add constraint appointments_provider_no_overlap
      exclude using gist (
        provider_id with =,
        public.appointment_time_range(appointment_date, start_time, end_time) with &&
      )
      where (
        provider_id is not null
        and status in ('pending', 'confirmed', 'rescheduled', 'checked_in', 'waiting', 'in_progress', 'completed')
      );
  end if;
end;
$$;

create index if not exists appointments_date_idx on public.appointments (appointment_date);
create index if not exists appointments_branch_date_idx on public.appointments (branch_id, appointment_date);
create index if not exists appointments_provider_date_idx on public.appointments (provider_id, appointment_date);
create index if not exists appointments_patient_date_idx on public.appointments (patient_id, appointment_date);
create index if not exists appointments_status_idx on public.appointments (status);

drop policy if exists "appointments_read_self_or_internal" on public.appointments;
drop policy if exists "appointments_select_self_internal_or_provider" on public.appointments;
drop policy if exists "appointments_write_internal_or_self_request" on public.appointments;

create policy "appointments_select_self_internal_or_provider"
on public.appointments for select
using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.patients p
    where (
      p.id::text = appointments.patient_id::text
      or p.patient_id = appointments.patient_id::text
    )
      and p.auth_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.providers pr
    where pr.id::text = appointments.provider_id::text
      and pr.profile_id = auth.uid()
  )
);

create policy "appointments_write_internal_or_self_request"
on public.appointments for all
using (
  public.is_internal_profile()
  or (
    booking_source = 'patient_portal'
    and exists (
      select 1
      from public.patients p
      where (
        p.id::text = appointments.patient_id::text
        or p.patient_id = appointments.patient_id::text
      )
        and p.auth_user_id = auth.uid()
    )
  )
)
with check (
  public.is_internal_profile()
  or (
    booking_source = 'patient_portal'
    and status = 'pending'
    and exists (
      select 1
      from public.patients p
      where (
        p.id::text = appointments.patient_id::text
        or p.patient_id = appointments.patient_id::text
      )
        and p.auth_user_id = auth.uid()
    )
  )
);
