-- Retention metadata and legacy credential cleanup.
-- Supabase Auth remains the only production authentication source.

create or replace function public.set_patient_archive_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'inactive' and old.status is distinct from 'inactive' then
    new.archived_at := coalesce(new.archived_at, now());
  elsif new.status = 'active' and old.status is distinct from 'active' then
    new.archived_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists patients_set_archive_metadata on public.patients;
create trigger patients_set_archive_metadata
before update of status on public.patients
for each row execute function public.set_patient_archive_metadata();

update public.patients
set archived_at = coalesce(archived_at, updated_at, now())
where status = 'inactive' and archived_at is null;

-- Keep the legacy column temporarily for source compatibility, but remove all
-- credential material. Production AuthProvider authenticates via Supabase Auth.
alter table public.staff alter column password set default '';
update public.staff set password = '' where password <> '';

revoke execute on function public.set_patient_archive_metadata() from public, anon, authenticated;
