-- Fix public Care Team avatar signing when profiles RLS hides the super admin profile from anon users.
-- Keep the internal-avatars bucket private; allow object reads only for active public-team profiles/providers.

create or replace function public.can_read_public_team_avatar(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles p
      where p.id::text = split_part(object_name, '/', 1)
        and p.status = 'active'
        and (
          p.role = 'super_admin'
          or coalesce(p.show_on_public_team, false)
        )
    )
    or exists (
      select 1
      from public.providers pr
      where pr.profile_id::text = split_part(object_name, '/', 1)
        and pr.status = 'active'
        and coalesce(pr.show_on_public_team, true)
    );
$$;

revoke all on function public.can_read_public_team_avatar(text) from public;
grant execute on function public.can_read_public_team_avatar(text) to anon, authenticated;

drop policy if exists "Public team avatars are readable" on storage.objects;

create policy "Public team avatars are readable"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'internal-avatars'
    and public.can_read_public_team_avatar(name)
  );
