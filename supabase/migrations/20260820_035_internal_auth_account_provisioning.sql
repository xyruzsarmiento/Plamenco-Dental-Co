-- Part 45 RC1 fix: make auth-user provisioning safe for internal clinic accounts.
-- Patient rows are created only for explicit patient registrations; manually-created
-- Supabase Auth users can then be assigned internal roles through public.profiles.

create or replace function public.handle_new_patient_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  account_role text := lower(coalesce(new.raw_user_meta_data ->> 'role', ''));
begin
  -- The application patient registration flow explicitly sends role='patient'.
  -- Dashboard-created internal accounts normally have no patient metadata and
  -- therefore must not be forced through the patient-table trigger.
  if account_role <> 'patient' then
    return new;
  end if;

  insert into public.patients (
    auth_user_id,
    patient_id,
    first_name,
    middle_name,
    last_name,
    full_name,
    phone,
    email,
    date_of_birth,
    origin,
    registration_date,
    status,
    medical_notes
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'patient_id', ''), 'PT-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || substr(md5(random()::text), 1, 6)),
    coalesce(nullif(new.raw_user_meta_data ->> 'first_name', ''), 'Patient'),
    coalesce(new.raw_user_meta_data ->> 'middle_name', ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'last_name', ''), 'Account'),
    trim(
      coalesce(nullif(new.raw_user_meta_data ->> 'first_name', ''), 'Patient') || ' ' ||
      coalesce(new.raw_user_meta_data ->> 'middle_name', '') || ' ' ||
      coalesce(nullif(new.raw_user_meta_data ->> 'last_name', ''), 'Account')
    ),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    lower(coalesce(new.email, '')),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    'online_registration',
    current_date,
    'active',
    'Patient account created via Supabase Auth.'
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_patient_auth_user();

create or replace function public.handle_new_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_role text := lower(coalesce(new.raw_user_meta_data ->> 'role', 'patient'));
  safe_role text;
begin
  safe_role := case
    when requested_role in ('super_admin', 'admin', 'dentist', 'associate_dentist', 'staff', 'patient')
      then requested_role
    else 'patient'
  end;

  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    status
  )
  values (
    new.id,
    trim(
      coalesce(new.raw_user_meta_data ->> 'first_name', '') || ' ' ||
      coalesce(new.raw_user_meta_data ->> 'last_name', '')
    ),
    lower(coalesce(new.email, '')),
    safe_role,
    'active'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = case
      when excluded.full_name <> '' then excluded.full_name
      else public.profiles.full_name
    end,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_created on auth.users;
create trigger on_auth_user_profile_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_profile();
