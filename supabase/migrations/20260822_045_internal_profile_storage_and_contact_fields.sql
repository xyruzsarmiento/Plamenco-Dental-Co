alter table public.profiles
  add column if not exists phone text not null default '',
  add column if not exists job_title text not null default '',
  add column if not exists address text not null default '';

comment on column public.profiles.phone is
  'User-maintained contact phone for the authenticated internal profile. Do not use for authorization.';
comment on column public.profiles.job_title is
  'User-maintained position/title for display in internal profile pages. Do not use for authorization.';
comment on column public.profiles.address is
  'Optional user-maintained address for the authenticated internal profile. Do not use for authorization.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'internal-avatars',
  'internal-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists internal_avatars_select_authenticated on storage.objects;
create policy internal_avatars_select_authenticated
on storage.objects for select
to authenticated
using (bucket_id = 'internal-avatars');

drop policy if exists internal_avatars_insert_own_folder on storage.objects;
create policy internal_avatars_insert_own_folder
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'internal-avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and public.is_internal_profile()
);

drop policy if exists internal_avatars_update_own_folder on storage.objects;
create policy internal_avatars_update_own_folder
on storage.objects for update
to authenticated
using (
  bucket_id = 'internal-avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and public.is_internal_profile()
)
with check (
  bucket_id = 'internal-avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and public.is_internal_profile()
);

drop policy if exists internal_avatars_delete_own_folder on storage.objects;
create policy internal_avatars_delete_own_folder
on storage.objects for delete
to authenticated
using (
  bucket_id = 'internal-avatars'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and public.is_internal_profile()
);

create or replace function public.prevent_self_profile_privilege_escalation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.avatar_url is distinct from old.avatar_url
    and nullif(new.avatar_url, '') is not null
    and new.avatar_url !~* '^(https?:|data:|blob:)'
    and split_part(new.avatar_url, '/', 1) <> new.id::text
  then
    raise exception 'Avatar path must belong to the profile account.' using errcode = '42501';
  end if;

  if old.id = (select auth.uid())
    and (
      new.id is distinct from old.id
      or new.email is distinct from old.email
      or new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.permissions is distinct from old.permissions
    )
  then
    raise exception 'Sensitive account fields cannot be changed from the personal profile page.' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_self_profile_privilege_escalation_before_update on public.profiles;
create trigger prevent_self_profile_privilege_escalation_before_update
before update on public.profiles
for each row execute function public.prevent_self_profile_privilege_escalation();
