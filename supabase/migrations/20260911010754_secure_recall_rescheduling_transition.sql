-- Move a booked recall back into the scheduling queue without losing the
-- appointment that explains why the patient needs a new schedule.
create or replace function public.mark_recall_needs_rescheduling(
  p_recall_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recall public.patient_recalls%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into v_recall
  from public.patient_recalls
  where id = p_recall_id
  for update;

  if not found then
    raise exception 'Recall not found.';
  end if;

  if not public.can_manage_patient_recall(v_recall.patient_id, v_recall.branch_id, v_recall.provider_id) then
    raise exception 'Not authorized to update this recall.';
  end if;

  if v_recall.status = 'needs_rescheduling' then
    return;
  end if;

  if v_recall.status <> 'booked' or nullif(trim(v_recall.linked_appointment_id), '') is null then
    raise exception 'Only a booked recall with a linked appointment can be marked for rescheduling.';
  end if;

  update public.patient_recalls
  set status = 'needs_rescheduling',
      updated_at = now()
  where id = v_recall.id;
end;
$$;

revoke all on function public.mark_recall_needs_rescheduling(uuid) from public;
revoke all on function public.mark_recall_needs_rescheduling(uuid) from anon;
grant execute on function public.mark_recall_needs_rescheduling(uuid) to authenticated;
