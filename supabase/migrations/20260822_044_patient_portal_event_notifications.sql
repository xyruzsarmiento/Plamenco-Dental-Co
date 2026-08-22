-- Patient portal database-backed notifications for appointment/payment events.
-- Trigger functions are not client-callable; patient read/update remains governed by notifications RLS.

create or replace function public.notify_patient_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_service_name text;
  v_title text;
  v_message text;
  v_date_label text := 'the scheduled date';
  v_time_label text := 'the scheduled time';
begin
  select p.email into v_email from public.patients p where p.id = new.patient_id;
  if coalesce(trim(v_email), '') = '' then return new; end if;

  select s.name into v_service_name from public.services s where s.id = new.service_id;
  v_service_name := coalesce(nullif(trim(v_service_name), ''), 'Dental appointment');

  begin
    if nullif(trim(coalesce(new.appointment_date, '')), '') is not null then
      v_date_label := to_char(trim(new.appointment_date)::date, 'Mon DD, YYYY');
    end if;
  exception when others then
    v_date_label := 'the scheduled date';
  end;

  begin
    if nullif(trim(coalesce(new.start_time, '')), '') is not null then
      v_time_label := to_char(trim(new.start_time)::time, 'HH12:MI AM');
    end if;
  exception when others then
    v_time_label := 'the scheduled time';
  end;

  if tg_op = 'INSERT' then
    v_title := 'Appointment request received';
    v_message := format('%s on %s at %s is awaiting clinic confirmation.', v_service_name, v_date_label, v_time_label);
  elsif old.status is distinct from new.status then
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
    v_message := format('%s on %s at %s is now %s.', v_service_name, v_date_label, v_time_label, replace(new.status, '_', ' '));
  else
    return new;
  end if;

  insert into public.notifications(user_email, kind, priority, title, message, related_id, is_read)
  values (
    lower(v_email),
    'appointment',
    case when new.status in ('cancelled', 'rejected') then 'high' else 'normal' end,
    v_title,
    v_message,
    new.id::text,
    false
  );
  return new;
end;
$$;

revoke all on function public.notify_patient_appointment_event() from public, anon, authenticated;

drop trigger if exists trg_notify_patient_appointment_event on public.appointments;
create trigger trg_notify_patient_appointment_event
after insert or update of status on public.appointments
for each row execute function public.notify_patient_appointment_event();

create or replace function public.notify_patient_payment_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invoice_number text;
begin
  if new.status <> 'completed' or (tg_op = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  select p.email into v_email from public.patients p where p.id = new.patient_id;
  if coalesce(trim(v_email), '') = '' then return new; end if;

  select i.invoice_number into v_invoice_number from public.invoices i where i.id = new.invoice_id;

  insert into public.notifications(user_email, kind, priority, title, message, related_id, is_read)
  values (
    lower(v_email),
    'payment',
    'normal',
    'Payment confirmed',
    format(
      'Your payment of ₱%s for invoice %s has been verified and posted.',
      to_char(new.amount_cents / 100.0, 'FM999G999G990D00'),
      coalesce(v_invoice_number, 'invoice')
    ),
    new.id::text,
    false
  );
  return new;
end;
$$;

revoke all on function public.notify_patient_payment_event() from public, anon, authenticated;

drop trigger if exists trg_notify_patient_payment_event on public.payments;
create trigger trg_notify_patient_payment_event
after insert or update of status on public.payments
for each row execute function public.notify_patient_payment_event();
