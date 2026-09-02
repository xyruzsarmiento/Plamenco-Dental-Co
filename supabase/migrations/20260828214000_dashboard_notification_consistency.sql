alter table public.notifications
  add column if not exists recipient_profile_id uuid references public.profiles(id) on delete cascade,
  add column if not exists branch_id uuid references public.branches(id) on delete set null,
  add column if not exists action_path text,
  add column if not exists event_key text,
  add column if not exists read_at timestamptz;

create unique index if not exists notifications_event_key_uidx
  on public.notifications(event_key)
  where event_key is not null;

create index if not exists notifications_recipient_profile_idx
  on public.notifications(recipient_profile_id, is_read, created_at desc)
  where recipient_profile_id is not null;

create index if not exists notifications_user_email_idx
  on public.notifications(lower(user_email), is_read, created_at desc)
  where user_email is not null;

create index if not exists notifications_branch_idx
  on public.notifications(branch_id, created_at desc)
  where branch_id is not null;

create or replace function public.notification_accessible_to_current_user_v135(p_notification public.notifications)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_uid is null then
    return false;
  end if;

  if p_notification.recipient_profile_id is not null then
    return p_notification.recipient_profile_id = v_uid;
  end if;

  if coalesce(p_notification.user_email, '') <> '' then
    return lower(p_notification.user_email) = v_email;
  end if;

  if p_notification.branch_id is not null then
    return public.has_profile_permission('notifications.view')
      and public.can_operate_branch(p_notification.branch_id::text);
  end if;

  return public.has_profile_permission('notifications.view')
    and public.has_profile_permission('system_admin.view');
end;
$$;

drop policy if exists notifications_read_own_or_internal on public.notifications;
drop policy if exists notifications_update_own_or_internal on public.notifications;
drop policy if exists notifications_read_scoped_v135 on public.notifications;
drop policy if exists notifications_update_scoped_v135 on public.notifications;
create policy notifications_read_scoped_v135
on public.notifications for select to authenticated
using (public.notification_accessible_to_current_user_v135(notifications));

create policy notifications_update_scoped_v135
on public.notifications for update to authenticated
using (public.notification_accessible_to_current_user_v135(notifications))
with check (public.notification_accessible_to_current_user_v135(notifications));

create or replace function public.upsert_notification_v135(
  p_user_email text,
  p_recipient_profile_id uuid,
  p_branch_id uuid,
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
  insert into public.notifications(
    user_email,
    recipient_profile_id,
    branch_id,
    kind,
    priority,
    title,
    message,
    related_id,
    action_path,
    event_key,
    is_read
  )
  values (
    nullif(lower(btrim(coalesce(p_user_email, ''))), ''),
    p_recipient_profile_id,
    p_branch_id,
    p_kind,
    coalesce(nullif(p_priority, ''), 'normal'),
    p_title,
    p_message,
    p_related_id,
    p_action_path,
    nullif(p_event_key, ''),
    false
  )
  on conflict (event_key) where event_key is not null do update
  set title = excluded.title,
      message = excluded.message,
      priority = excluded.priority,
      action_path = excluded.action_path,
      branch_id = excluded.branch_id;
end;
$$;

create or replace function public.notify_branch_operations_v135(
  p_branch_id uuid,
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
declare
  v_profile record;
begin
  if p_branch_id is null then
    return;
  end if;

  for v_profile in
    select distinct p.id
    from public.profiles p
    left join public.staff_branch_assignments sba
      on sba.profile_id = p.id
     and sba.branch_id = p_branch_id
     and sba.status = 'active'
    where p.status = 'active'
      and (
        p.role = 'super_admin'
        or (p.role = 'staff' and sba.id is not null)
      )
      and 'notifications.view' = any(coalesce(p.permissions, array[]::text[]))
  loop
    perform public.upsert_notification_v135(
      null,
      v_profile.id,
      p_branch_id,
      p_kind,
      p_priority,
      p_title,
      p_message,
      p_related_id,
      p_action_path,
      p_event_key_prefix || ':profile:' || v_profile.id::text
    );
  end loop;
end;
$$;

create or replace function public.notify_patient_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text;
  v_service_name text;
  v_provider_name text;
  v_title text;
  v_message text;
  v_date_label text := 'the scheduled date';
  v_time_label text := 'the scheduled time';
  v_provider_profile_id uuid;
begin
  select p.email into v_email from public.patients p where p.id = new.patient_id;
  select s.name into v_service_name from public.services s where s.id = new.service_id;
  select pr.display_name, pr.profile_id into v_provider_name, v_provider_profile_id from public.providers pr where pr.id = coalesce(new.proposed_provider_id, new.provider_id);
  v_service_name := coalesce(nullif(btrim(v_service_name), ''), 'Dental appointment');
  v_provider_name := coalesce(nullif(btrim(v_provider_name), ''), 'Dental provider');

  begin
    if new.appointment_date is not null then
      v_date_label := to_char(new.appointment_date::date, 'Mon DD, YYYY');
    end if;
  exception when others then
    v_date_label := 'the scheduled date';
  end;

  begin
    if new.start_time is not null then
      v_time_label := to_char(new.start_time::time, 'HH12:MI AM');
    end if;
  exception when others then
    v_time_label := 'the scheduled time';
  end;

  if tg_op = 'INSERT' then
    if coalesce(btrim(v_email), '') <> '' then
      perform public.upsert_notification_v135(
        v_email,
        null,
        new.branch_id,
        'appointment',
        'normal',
        'Appointment request received',
        format('%s on %s at %s is awaiting clinic review.', v_service_name, v_date_label, v_time_label),
        new.id::text,
        '/portal?tab=appointments',
        'appointment:' || new.id::text || ':patient:request-received'
      );
    end if;

    if new.status = 'pending' then
      perform public.notify_branch_operations_v135(
        new.branch_id,
        'appointment',
        'normal',
        'New appointment request',
        format('%s on %s at %s is waiting for clinic review.', v_service_name, v_date_label, v_time_label),
        new.id::text,
        '/app/appointments',
        'appointment:' || new.id::text || ':branch:new-request'
      );
    end if;
  elsif old.proposed_provider_id is distinct from new.proposed_provider_id and new.proposed_provider_id is not null and v_provider_profile_id is not null then
    perform public.upsert_notification_v135(
      null,
      v_provider_profile_id,
      new.branch_id,
      'appointment',
      'normal',
      'Appointment request awaiting response',
      format('%s on %s at %s has been sent to you for acceptance.', v_service_name, v_date_label, v_time_label),
      new.id::text,
      '/app',
      'appointment:' || new.id::text || ':provider-nominated:' || new.proposed_provider_id::text
    );
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    v_title := case new.status
      when 'confirmed' then 'Appointment confirmed'
      when 'cancelled' then 'Appointment cancelled'
      when 'rejected' then 'Appointment not approved'
      when 'rescheduled' then 'Appointment rescheduled'
      when 'checked_in' then 'You are checked in'
      when 'waiting' then 'You are in the waiting queue'
      when 'in_progress' then 'Your visit has started'
      when 'completed' then 'Appointment completed'
      when 'no_show' then 'Appointment marked missed'
      else 'Appointment updated'
    end;
    v_message := case new.status
      when 'confirmed' then format('%s accepted %s on %s at %s.', v_provider_name, v_service_name, v_date_label, v_time_label)
      else format('%s on %s at %s is now %s.', v_service_name, v_date_label, v_time_label, replace(new.status, '_', ' '))
    end;

    if coalesce(btrim(v_email), '') <> '' then
      perform public.upsert_notification_v135(
        v_email,
        null,
        new.branch_id,
        'appointment',
        case when new.status in ('cancelled', 'rejected') then 'high' else 'normal' end,
        v_title,
        v_message,
        new.id::text,
        '/portal?tab=appointments',
        'appointment:' || new.id::text || ':patient:status:' || new.status
      );
    end if;

    if new.status in ('confirmed', 'cancelled', 'rejected', 'no_show') then
      perform public.notify_branch_operations_v135(
        new.branch_id,
        'appointment',
        case when new.status in ('cancelled', 'rejected', 'no_show') then 'high' else 'normal' end,
        case new.status
          when 'confirmed' then 'Dentist accepted appointment'
          when 'cancelled' then 'Appointment cancelled'
          when 'rejected' then 'Appointment rejected'
          when 'no_show' then 'Appointment marked no-show'
          else 'Appointment updated'
        end,
        v_message,
        new.id::text,
        '/app/appointments',
        'appointment:' || new.id::text || ':branch:status:' || new.status
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_patient_appointment_event on public.appointments;
create trigger trg_notify_patient_appointment_event
after insert or update of status, proposed_provider_id, provider_id on public.appointments
for each row execute function public.notify_patient_appointment_event();

create or replace function public.notify_patient_payment_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text;
  v_invoice_number text;
begin
  if new.status <> 'completed' or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  select p.email into v_email from public.patients p where p.id = new.patient_id;
  if coalesce(btrim(v_email), '') = '' then return new; end if;

  select i.invoice_number into v_invoice_number from public.invoices i where i.id = new.invoice_id;

  perform public.upsert_notification_v135(
    v_email,
    null,
    new.branch_id,
    'payment',
    'normal',
    'Payment confirmed',
    format('Your payment of PHP %s for invoice %s has been verified and posted.', to_char(new.amount_cents / 100.0, 'FM999G999G990D00'), coalesce(v_invoice_number, 'invoice')),
    new.id::text,
    '/portal?tab=payments',
    'payment:' || new.id::text || ':patient:completed'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_patient_payment_event on public.payments;
create trigger trg_notify_patient_payment_event
after insert or update of status on public.payments
for each row execute function public.notify_patient_payment_event();

create or replace function public.notify_patient_document_event_v135()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text;
  v_document_name text;
begin
  if coalesce(new.patient_visible, false) is not true or new.archived_at is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' and (
    coalesce(old.patient_visible, false) is true
    and old.archived_at is null
    and old.name is not distinct from new.name
  ) then
    return new;
  end if;

  select p.email into v_email from public.patients p where p.id = new.patient_id;
  if coalesce(btrim(v_email), '') = '' then return new; end if;
  v_document_name := coalesce(nullif(btrim(new.name), ''), 'A clinic document');

  perform public.upsert_notification_v135(
    v_email,
    null,
    new.branch_id,
    'document',
    'normal',
    'New document available',
    format('%s is now available in your patient portal.', v_document_name),
    new.id::text,
    '/portal?tab=documents',
    'document:' || new.id::text || ':patient:visible'
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_patient_document_event_v135 on public.documents;
create trigger trg_notify_patient_document_event_v135
after insert or update of patient_visible, archived_at, name on public.documents
for each row execute function public.notify_patient_document_event_v135();

create or replace function public.get_current_user_notifications_v135(p_limit integer default 50)
returns table (
  id uuid,
  kind text,
  priority text,
  title text,
  message text,
  related_id text,
  action_path text,
  is_read boolean,
  read_at timestamptz,
  branch_id uuid,
  recipient_profile_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select n.id, n.kind, n.priority, n.title, n.message, n.related_id, n.action_path,
         n.is_read, n.read_at, n.branch_id, n.recipient_profile_id, n.created_at
  from public.notifications n
  where public.notification_accessible_to_current_user_v135(n)
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function public.mark_notification_read_v135(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.notifications n
  set is_read = true,
      read_at = coalesce(read_at, now())
  where n.id = p_notification_id
    and public.notification_accessible_to_current_user_v135(n);
end;
$$;

create or replace function public.mark_all_notifications_read_v135()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
begin
  update public.notifications n
  set is_read = true,
      read_at = coalesce(read_at, now())
  where n.is_read = false
    and public.notification_accessible_to_current_user_v135(n);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.notification_accessible_to_current_user_v135(public.notifications) from public, anon, authenticated;
revoke all on function public.upsert_notification_v135(text, uuid, uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_branch_operations_v135(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notify_patient_appointment_event() from public, anon, authenticated;
revoke all on function public.notify_patient_payment_event() from public, anon, authenticated;
revoke all on function public.notify_patient_document_event_v135() from public, anon, authenticated;
revoke all on function public.get_current_user_notifications_v135(integer) from public, anon;
revoke all on function public.mark_notification_read_v135(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read_v135() from public, anon;

grant execute on function public.get_current_user_notifications_v135(integer) to authenticated, service_role;
grant execute on function public.mark_notification_read_v135(uuid) to authenticated, service_role;
grant execute on function public.mark_all_notifications_read_v135() to authenticated, service_role;
