alter table public.prescriptions
  drop constraint if exists prescriptions_status_check;

alter table public.prescriptions
  add constraint prescriptions_status_check
  check (status in ('active', 'inactive', 'completed', 'voided'));

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
          or 'prescriptions.create' = any(p.permissions)
          or 'prescriptions.edit' = any(p.permissions)
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
          'prescriptions.create' = any(p.permissions)
          or 'prescriptions.edit' = any(p.permissions)
          or p.role in ('dentist', 'associate_dentist')
        )
    ),
    false
  )
$$;

revoke all on function public.can_author_prescription() from public, anon;
grant execute on function public.can_author_prescription() to authenticated, service_role;
