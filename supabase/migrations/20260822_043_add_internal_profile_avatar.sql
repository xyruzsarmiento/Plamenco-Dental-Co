alter table public.profiles
  add column if not exists avatar_url text not null default '';

comment on column public.profiles.avatar_url is
  'User-controlled account avatar shown in authenticated internal portal chrome. Do not use for authorization.';
