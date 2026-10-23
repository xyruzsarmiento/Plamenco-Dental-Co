-- Ensure the public Care Team includes every active dentist and the active super admin.
-- Existing deployments need this migration because editing an older migration does not rerun it.

alter table public.profiles
  alter column show_on_public_team set default true;

update public.profiles
set show_on_public_team = true
where role = 'super_admin'
  and status = 'active';

create or replace function public.get_public_clinic_team_v133()
returns table (
  id text,
  display_name text,
  role text,
  specialization text,
  bio text,
  branch_names text[],
  photo_path text,
  photo_url text,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  with provider_team as (
    select
      pr.id::text as id,
      nullif(trim(pr.display_name), '') as display_name,
      pr.role::text as role,
      nullif(trim(pr.specialization), '') as specialization,
      nullif(trim(pr.bio), '') as bio,
      coalesce(
        array_remove(array_agg(distinct b.name order by b.name) filter (where b.id is not null), null),
        array[]::text[]
      ) as branch_names,
      nullif(trim(coalesce(pr.photo_url, p.avatar_url, '')), '') as photo_path,
      case
        when coalesce(pr.photo_url, p.avatar_url, '') ~* '^(https?:|data:|blob:)'
          then coalesce(pr.photo_url, p.avatar_url)
        else null
      end as photo_url,
      case when pr.role = 'dentist' then 10 else 20 end as sort_order
    from public.providers pr
    left join public.profiles p on p.id = pr.profile_id
    left join public.provider_branch_assignments pba
      on pba.provider_id = pr.id and pba.status = 'active'
    left join public.branches b
      on b.id = pba.branch_id and b.status = 'active'
    where pr.status = 'active'
      and pr.role in ('dentist', 'associate_dentist')
      and coalesce(pr.show_on_public_team, true)
    group by pr.id, pr.display_name, pr.role, pr.specialization, pr.bio, pr.photo_url, p.avatar_url
  ),
  leadership_team as (
    select
      p.id::text as id,
      nullif(trim(p.full_name), '') as display_name,
      'clinic_leadership'::text as role,
      nullif(trim(coalesce(p.job_title, 'Clinic leadership')), '') as specialization,
      null::text as bio,
      array[]::text[] as branch_names,
      nullif(trim(coalesce(p.avatar_url, '')), '') as photo_path,
      case
        when coalesce(p.avatar_url, '') ~* '^(https?:|data:|blob:)' then p.avatar_url
        else null
      end as photo_url,
      5 as sort_order
    from public.profiles p
    where p.status = 'active'
      and p.role = 'super_admin'
      and coalesce(p.show_on_public_team, true)
      and not exists (
        select 1
        from public.providers pr
        where pr.profile_id = p.id
          and pr.status = 'active'
          and coalesce(pr.show_on_public_team, true)
      )
  )
  select *
  from (
    select * from leadership_team
    union all
    select * from provider_team
  ) team
  where display_name is not null
  order by sort_order, display_name;
$$;

revoke all on function public.get_public_clinic_team_v133() from public;
grant execute on function public.get_public_clinic_team_v133() to anon, authenticated;

-- The same public-team flag controls access to profile avatar objects in this bucket.
drop policy if exists "Public team avatars are readable" on storage.objects;
create policy "Public team avatars are readable"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'internal-avatars'
    and (
      exists (
        select 1
        from public.profiles p
        where p.id::text = split_part(storage.objects.name, '/', 1)
          and p.status = 'active'
          and coalesce(p.show_on_public_team, true)
      )
      or exists (
        select 1
        from public.providers pr
        where pr.profile_id::text = split_part(storage.objects.name, '/', 1)
          and pr.status = 'active'
          and coalesce(pr.show_on_public_team, true)
      )
    )
  );
