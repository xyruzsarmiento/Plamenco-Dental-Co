-- Restore consistent prescription mutation authorization for internal clinical users.
-- The prescriptions UI allows super admins and authorized clinicians to edit
-- lifecycle state; the database policy must match that contract.

create or replace function public.can_author_prescription()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (
          p.role in ('super_admin', 'admin')
          or 'prescriptions.create' = any(coalesce(p.permissions, '{}'::text[]))
          or 'prescriptions.edit' = any(coalesce(p.permissions, '{}'::text[]))
        )
    )
    or exists (
      select 1
      from public.profiles p
      join public.providers pr on pr.profile_id = p.id
      where p.id = auth.uid()
        and p.status = 'active'
        and pr.status = 'active'
        and pr.role in ('dentist', 'associate_dentist')
        and (
          p.role in ('dentist', 'associate_dentist')
          or 'prescriptions.create' = any(coalesce(p.permissions, '{}'::text[]))
          or 'prescriptions.edit' = any(coalesce(p.permissions, '{}'::text[]))
        )
    ),
    false
  )
$$;

revoke all on function public.can_author_prescription() from public, anon;
grant execute on function public.can_author_prescription() to authenticated, service_role;

alter table public.prescriptions enable row level security;

grant select, insert, update on table public.prescriptions to authenticated;

drop policy if exists "prescriptions_update_clinical_authorized" on public.prescriptions;
create policy "prescriptions_update_clinical_authorized"
on public.prescriptions
for update
to authenticated
using (public.can_author_prescription())
with check (public.can_author_prescription());

-- Keep the insert policy aligned as well so creation and later edits do not
-- diverge when permissions are changed or a super admin is performing support.
drop policy if exists "prescriptions_write_clinical_authorized" on public.prescriptions;
create policy "prescriptions_write_clinical_authorized"
on public.prescriptions
for insert
to authenticated
with check (public.can_author_prescription());
