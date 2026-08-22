create or replace function public.normalize_communication_patient_reference()
returns trigger
language plpgsql
as $$
declare
  public_patient_id text;
begin
  if new.patient_id is null or btrim(new.patient_id) = '' then
    return new;
  end if;

  if exists (select 1 from public.patients p where p.patient_id = new.patient_id) then
    return new;
  end if;

  select p.patient_id into public_patient_id
  from public.patients p
  where p.id::text = new.patient_id
  limit 1;

  if public_patient_id is not null then
    new.patient_id := public_patient_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_communication_delivery_patient on public.communication_delivery_logs;
create trigger trg_normalize_communication_delivery_patient
before insert or update of patient_id on public.communication_delivery_logs
for each row execute function public.normalize_communication_patient_reference();

drop trigger if exists trg_normalize_communication_outbox_patient on public.communication_outbox;
create trigger trg_normalize_communication_outbox_patient
before insert or update of patient_id on public.communication_outbox
for each row execute function public.normalize_communication_patient_reference();
