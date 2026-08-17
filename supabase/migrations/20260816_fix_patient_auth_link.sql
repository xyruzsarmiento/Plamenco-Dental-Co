-- Fix the patient-to-auth relationship for the actual Supabase schema used by this app.
-- The app requires every patient row to be linked to the authenticated auth.users row.

alter table public.patients
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade;

create or replace function public.handle_new_patient_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.patients (
    auth_user_id,
    patient_id,
    first_name,
    middle_name,
    last_name,
    phone,
    email,
    date_of_birth,
    registration_date,
    status,
    medical_notes
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'patient_id', 'PT-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 6)),
    coalesce(new.raw_user_meta_data ->> 'first_name', 'Patient'),
    coalesce(new.raw_user_meta_data ->> 'middle_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', 'Account'),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    lower(coalesce(new.email, '')),
    nullif(new.raw_user_meta_data ->> 'date_of_birth', ''),
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

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'patients'
      and policyname = 'patients_read_own_record'
  ) then
    create policy "patients_read_own_record"
    on public.patients
    for select
    using (auth_user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'patients'
      and policyname = 'patients_insert_own_record'
  ) then
    create policy "patients_insert_own_record"
    on public.patients
    for insert
    with check (auth_user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'patients'
      and policyname = 'patients_update_own_record'
  ) then
    create policy "patients_update_own_record"
    on public.patients
    for update
    using (auth_user_id = auth.uid())
    with check (auth_user_id = auth.uid());
  end if;
end $$;
