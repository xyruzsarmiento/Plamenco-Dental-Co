-- PART 10: secure branch assignment management and provider scheduling integrity.
-- Uses existing staff_branch_assignments/provider_branch_assignments. No duplicate assignment model.

create or replace function public.can_manage_staff_assignments()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (p.role in ('super_admin','admin') or 'staff.manage' = any(p.permissions))
    ), false
  )
$$;

create or replace function public.can_manage_provider_assignments()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and (p.role in ('super_admin','admin') or 'dentists.manage' = any(p.permissions))
    ), false
  )
$$;

create or replace function public.replace_staff_branch_assignments(
  p_profile_id uuid,
  p_branch_ids uuid[],
  p_primary_branch_id uuid default null
)
returns setof public.staff_branch_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_branch uuid;
begin
  if not public.can_manage_staff_assignments() then
    raise exception 'Not authorized to manage staff branch assignments' using errcode = '42501';
  end if;

  if p_profile_id = auth.uid() and not public.is_super_admin() then
    raise exception 'You cannot change your own branch assignments' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = p_profile_id and status = 'active';
  if v_role is null or v_role <> 'staff' then
    raise exception 'Target profile is not an active staff account' using errcode = '22023';
  end if;

  if p_primary_branch_id is not null and not (p_primary_branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))) then
    raise exception 'Primary branch must be one of the assigned branches' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_branch_ids, '{}'::uuid[])) b
    left join public.branches br on br.id = b and br.status = 'active'
    where br.id is null
  ) then
    raise exception 'All assigned branches must be active clinic branches' using errcode = '22023';
  end if;

  update public.staff_branch_assignments
  set status = 'inactive', is_primary = false, updated_at = now()
  where profile_id = p_profile_id
    and not (branch_id = any(coalesce(p_branch_ids, '{}'::uuid[])));

  foreach v_branch in array coalesce(p_branch_ids, '{}'::uuid[]) loop
    insert into public.staff_branch_assignments(profile_id, branch_id, is_primary, status)
    values (p_profile_id, v_branch, v_branch = coalesce(p_primary_branch_id, p_branch_ids[1]), 'active')
    on conflict (profile_id, branch_id) do update
      set status = 'active',
          is_primary = excluded.is_primary,
          updated_at = now();
  end loop;

  if cardinality(coalesce(p_branch_ids, '{}'::uuid[])) > 0 then
    update public.staff_branch_assignments
      set is_primary = (branch_id = coalesce(p_primary_branch_id, p_branch_ids[1])), updated_at = now()
      where profile_id = p_profile_id and status = 'active';
  end if;

  return query
  select * from public.staff_branch_assignments
  where profile_id = p_profile_id and status = 'active'
  order by is_primary desc, created_at asc;
end;
$$;

create or replace function public.replace_provider_branch_assignments(
  p_provider_id uuid,
  p_branch_ids uuid[],
  p_primary_branch_id uuid default null
)
returns setof public.provider_branch_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_branch uuid;
begin
  if not public.can_manage_provider_assignments() then
    raise exception 'Not authorized to manage dentist branch assignments' using errcode = '42501';
  end if;

  select profile_id into v_profile_id from public.providers
  where id = p_provider_id and status in ('active','on_leave');
  if not found then
    raise exception 'Dentist/provider was not found' using errcode = '22023';
  end if;

  if v_profile_id = auth.uid() and not public.is_super_admin() then
    raise exception 'You cannot change your own dentist branch assignments' using errcode = '42501';
  end if;

  if p_primary_branch_id is not null and not (p_primary_branch_id = any(coalesce(p_branch_ids, '{}'::uuid[]))) then
    raise exception 'Primary branch must be one of the assigned branches' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_branch_ids, '{}'::uuid[])) b
    left join public.branches br on br.id = b and br.status = 'active'
    where br.id is null
  ) then
    raise exception 'All assigned branches must be active clinic branches' using errcode = '22023';
  end if;

  -- Removed branch assignments immediately stop future availability in that branch.
  update public.provider_schedule_blocks
  set status = 'inactive', updated_at = now()
  where provider_id = p_provider_id
    and status = 'active'
    and not (branch_id = any(coalesce(p_branch_ids, '{}'::uuid[])));

  update public.provider_branch_assignments
  set status = 'inactive', is_primary = false, updated_at = now()
  where provider_id = p_provider_id
    and not (branch_id = any(coalesce(p_branch_ids, '{}'::uuid[])));

  foreach v_branch in array coalesce(p_branch_ids, '{}'::uuid[]) loop
    insert into public.provider_branch_assignments(provider_id, branch_id, is_primary, status)
    values (p_provider_id, v_branch, v_branch = coalesce(p_primary_branch_id, p_branch_ids[1]), 'active')
    on conflict (provider_id, branch_id) do update
      set status = 'active',
          is_primary = excluded.is_primary,
          updated_at = now();
  end loop;

  if cardinality(coalesce(p_branch_ids, '{}'::uuid[])) > 0 then
    update public.provider_branch_assignments
      set is_primary = (branch_id = coalesce(p_primary_branch_id, p_branch_ids[1])), updated_at = now()
      where provider_id = p_provider_id and status = 'active';
  end if;

  return query
  select * from public.provider_branch_assignments
  where provider_id = p_provider_id and status = 'active'
  order by is_primary desc, created_at asc;
end;
$$;

create or replace function public.enforce_provider_schedule_assignment_and_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and not exists (
    select 1 from public.provider_branch_assignments a
    where a.provider_id = new.provider_id
      and a.branch_id = new.branch_id
      and a.status = 'active'
  ) then
    raise exception 'Dentist is not assigned to this branch' using errcode = '23514';
  end if;

  if new.status = 'active' and exists (
    select 1 from public.provider_schedule_blocks b
    where b.provider_id = new.provider_id
      and b.id <> coalesce(new.id, gen_random_uuid())
      and b.status = 'active'
      and b.day_of_week = new.day_of_week
      and b.start_time < new.end_time
      and new.start_time < b.end_time
  ) then
    raise exception 'Dentist schedule overlaps another branch/time block on the same day' using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists provider_schedule_assignment_overlap_guard on public.provider_schedule_blocks;
create trigger provider_schedule_assignment_overlap_guard
before insert or update on public.provider_schedule_blocks
for each row execute function public.enforce_provider_schedule_assignment_and_overlap();

-- Appointments already have a provider-wide exclusion constraint, so a provider cannot
-- hold simultaneous appointments even when those appointments are in different branches.
-- Add branch-assignment validation so a provider cannot be booked into an unassigned branch.
create or replace function public.enforce_appointment_provider_branch_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.provider_id is not null and new.branch_id is not null
     and new.status not in ('cancelled','rejected','no_show')
     and not exists (
       select 1 from public.provider_branch_assignments a
       where a.provider_id = new.provider_id
         and a.branch_id = new.branch_id
         and a.status = 'active'
     ) then
    raise exception 'Selected dentist is not assigned to this appointment branch' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists appointment_provider_branch_assignment_guard on public.appointments;
create trigger appointment_provider_branch_assignment_guard
before insert or update of provider_id, branch_id, status on public.appointments
for each row execute function public.enforce_appointment_provider_branch_assignment();

revoke all on function public.replace_staff_branch_assignments(uuid, uuid[], uuid) from public, anon;
revoke all on function public.replace_provider_branch_assignments(uuid, uuid[], uuid) from public, anon;
grant execute on function public.replace_staff_branch_assignments(uuid, uuid[], uuid) to authenticated;
grant execute on function public.replace_provider_branch_assignments(uuid, uuid[], uuid) to authenticated;

revoke all on function public.can_manage_staff_assignments() from public, anon;
revoke all on function public.can_manage_provider_assignments() from public, anon;
grant execute on function public.can_manage_staff_assignments() to authenticated;
grant execute on function public.can_manage_provider_assignments() to authenticated;
