-- Part 10 final audit: keep Profile self-service updates narrow at the database layer.
-- RLS limits which rows can be changed; column grants and this trigger limit which
-- profile fields a signed-in user can change from browser clients.

revoke update on table public.profiles from authenticated;

grant select, insert on table public.profiles to authenticated;
grant update (
  full_name,
  email,
  phone,
  job_title,
  address,
  avatar_url,
  updated_at
) on table public.profiles to authenticated;

create or replace function public.prevent_self_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_email text;
begin
  if new.avatar_url is distinct from old.avatar_url
    and nullif(new.avatar_url, '') is not null
    and new.avatar_url !~* '^(https?:|data:|blob:)'
    and split_part(new.avatar_url, '/', 1) <> new.id::text
  then
    raise exception 'Avatar path must belong to the profile account.' using errcode = '42501';
  end if;

  if old.id = (select auth.uid()) then
    select lower(email) into v_auth_email
    from auth.users
    where id = (select auth.uid());

    if new.email is distinct from old.email
      and lower(coalesce(new.email, '')) is distinct from coalesce(v_auth_email, '')
    then
      raise exception 'Profile email must match the authenticated account email.' using errcode = '42501';
    end if;

    if new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.permissions is distinct from old.permissions
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Sensitive account fields cannot be changed from the personal profile page.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_self_profile_privilege_escalation_before_update on public.profiles;
create trigger prevent_self_profile_privilege_escalation_before_update
before update on public.profiles
for each row execute function public.prevent_self_profile_privilege_escalation();

revoke all on function public.prevent_self_profile_privilege_escalation() from public, anon;
