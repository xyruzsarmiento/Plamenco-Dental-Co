-- Part 7: harden recall/follow-up appointment linking.
-- A recall can only be linked/completed with an appointment belonging to the same patient.

create or replace function public.recall_appointment_belongs_to_patient(
  p_recall_patient_id text,
  p_appointment_id text
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    where a.id::text = p_appointment_id
      and p.patient_id = p_recall_patient_id
  );
$$;

create or replace function public.link_recall_appointment(
  p_recall_id uuid,
  p_appointment_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recall public.patient_recalls%rowtype;
begin
  select * into v_recall from public.patient_recalls where id = p_recall_id for update;
  if not found then raise exception 'Recall not found.'; end if;
  if not public.can_manage_patient_recall(v_recall.patient_id, v_recall.branch_id, v_recall.provider_id) then
    raise exception 'Not authorized to update this recall.';
  end if;
  if coalesce(trim(p_appointment_id), '') = '' then
    raise exception 'Appointment ID is required.';
  end if;
  if not public.recall_appointment_belongs_to_patient(v_recall.patient_id, trim(p_appointment_id)) then
    raise exception 'Appointment does not belong to the recall patient.';
  end if;

  update public.patient_recalls
  set linked_appointment_id = trim(p_appointment_id),
      status = 'booked',
      updated_at = now()
  where id = p_recall_id;
end;
$$;

create or replace function public.complete_patient_recall(
  p_recall_id uuid,
  p_appointment_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recall public.patient_recalls%rowtype;
  v_appointment_id text := nullif(trim(p_appointment_id), '');
begin
  select * into v_recall from public.patient_recalls where id = p_recall_id for update;
  if not found then raise exception 'Recall not found.'; end if;
  if not public.can_manage_patient_recall(v_recall.patient_id, v_recall.branch_id, v_recall.provider_id) then
    raise exception 'Not authorized to complete this recall.';
  end if;
  if v_appointment_id is not null and not public.recall_appointment_belongs_to_patient(v_recall.patient_id, v_appointment_id) then
    raise exception 'Appointment does not belong to the recall patient.';
  end if;

  update public.patient_recalls
  set status = 'completed',
      linked_appointment_id = coalesce(v_appointment_id, linked_appointment_id),
      completed_at = now(),
      completed_by = auth.uid(),
      updated_at = now()
  where id = p_recall_id;
end;
$$;

revoke all on function public.recall_appointment_belongs_to_patient(text, text) from public;
revoke all on function public.link_recall_appointment(uuid, text) from public;
revoke all on function public.complete_patient_recall(uuid, text) from public;

grant execute on function public.link_recall_appointment(uuid, text) to authenticated;
grant execute on function public.complete_patient_recall(uuid, text) to authenticated;
