-- Database-owned patient numbering and a defensive self-service update guard.
-- Existing internal staff RLS remains authoritative for clinic-side patient management.

create sequence if not exists public.patient_number_seq;

select setval(
  'public.patient_number_seq',
  greatest(
    coalesce((select max((regexp_match(patient_id, '^PT-([0-9]+)$'))[1]::bigint) from public.patients), 0) + 1,
    (select last_value + 1 from public.patient_number_seq)
  ),
  false
);

create or replace function public.assign_patient_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if nullif(btrim(new.patient_id), '') is null then
    new.patient_id := 'PT-' || lpad(nextval('public.patient_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

revoke all on function public.assign_patient_number() from public;
revoke all on function public.assign_patient_number() from anon;
revoke all on function public.assign_patient_number() from authenticated;

drop trigger if exists patients_assign_patient_number on public.patients;
create trigger patients_assign_patient_number
before insert on public.patients
for each row execute function public.assign_patient_number();

create or replace function public.guard_patient_self_service_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or public.is_internal_profile() then
    return new;
  end if;

  if old.auth_user_id = v_uid then
    if new.id is distinct from old.id
      or new.patient_id is distinct from old.patient_id
      or new.auth_user_id is distinct from old.auth_user_id
      or new.status is distinct from old.status
      or new.archived_at is distinct from old.archived_at
      or new.origin is distinct from old.origin
      or new.registration_date is distinct from old.registration_date
      or new.preferred_branch_id is distinct from old.preferred_branch_id
      or new.allergies is distinct from old.allergies
      or new.medical_conditions is distinct from old.medical_conditions
      or new.current_medications is distinct from old.current_medications
      or new.previous_surgeries is distinct from old.previous_surgeries
      or new.medical_notes is distinct from old.medical_notes
      or new.administrative_notes is distinct from old.administrative_notes
      or new.import_batch_id is distinct from old.import_batch_id
      or new.import_source_row is distinct from old.import_source_row
      or new.original_imported_name is distinct from old.original_imported_name
      or new.created_at is distinct from old.created_at then
      raise exception 'Patient self-service cannot modify protected clinic fields.' using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Not authorized to update this patient.' using errcode = '42501';
end;
$$;

revoke all on function public.guard_patient_self_service_update() from public;
revoke all on function public.guard_patient_self_service_update() from anon;
revoke all on function public.guard_patient_self_service_update() from authenticated;

drop trigger if exists patients_guard_self_service_update on public.patients;
create trigger patients_guard_self_service_update
before update on public.patients
for each row execute function public.guard_patient_self_service_update();
