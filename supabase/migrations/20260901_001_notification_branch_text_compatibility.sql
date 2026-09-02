create or replace function public.notification_branch_uuid_v136(p_branch_id text)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog, public
as $$
begin
  if nullif(btrim(coalesce(p_branch_id, '')), '') is null then
    return null;
  end if;

  if btrim(p_branch_id) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return btrim(p_branch_id)::uuid;
  end if;

  return null;
end;
$$;

create or replace function public.upsert_notification_v135(
  p_user_email text,
  p_recipient_profile_id uuid,
  p_branch_id text,
  p_kind text,
  p_priority text,
  p_title text,
  p_message text,
  p_related_id text,
  p_action_path text,
  p_event_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.upsert_notification_v135(
    p_user_email,
    p_recipient_profile_id,
    public.notification_branch_uuid_v136(p_branch_id),
    p_kind,
    p_priority,
    p_title,
    p_message,
    p_related_id,
    p_action_path,
    p_event_key
  );
end;
$$;

create or replace function public.notify_branch_operations_v135(
  p_branch_id text,
  p_kind text,
  p_priority text,
  p_title text,
  p_message text,
  p_related_id text,
  p_action_path text,
  p_event_key_prefix text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.notify_branch_operations_v135(
    public.notification_branch_uuid_v136(p_branch_id),
    p_kind,
    p_priority,
    p_title,
    p_message,
    p_related_id,
    p_action_path,
    p_event_key_prefix
  );
end;
$$;

revoke all on function public.notification_branch_uuid_v136(text) from public, anon, authenticated;
revoke all on function public.upsert_notification_v135(text, uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_branch_operations_v135(text, text, text, text, text, text, text, text) from public, anon, authenticated;
