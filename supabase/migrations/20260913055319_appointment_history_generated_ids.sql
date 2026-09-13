-- Keep the existing text primary-key contract while making PostgreSQL the
-- authoritative generator for appointment history identifiers.
alter table public.appointment_status_history
  alter column id set default ('appt-history-' || gen_random_uuid()::text);

-- Initial history must commit in the same transaction as the appointment.
create or replace function public.record_initial_appointment_history()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  insert into public.appointment_status_history (
    appointment_id,
    event_type,
    from_status,
    to_status,
    changed_by,
    changed_at,
    reason,
    notes,
    metadata
  ) values (
    new.id::text,
    'created',
    null,
    new.status,
    new.created_by,
    new.created_at,
    '',
    coalesce(new.notes, ''),
    jsonb_build_object(
      'appointmentNumber', new.appointment_number,
      'branchId', new.branch_id,
      'providerId', new.provider_id,
      'serviceId', new.service_id,
      'bookingSource', new.booking_source
    )
  );

  return new;
end;
$$;

revoke all on function public.record_initial_appointment_history() from public, anon, authenticated;

drop trigger if exists record_initial_appointment_history_after_insert on public.appointments;
create trigger record_initial_appointment_history_after_insert
after insert on public.appointments
for each row execute function public.record_initial_appointment_history();
