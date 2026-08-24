alter table public.patient_recalls enable row level security;
alter table public.recall_contact_attempts enable row level security;

revoke all on table public.patient_recalls from public;
revoke all on table public.patient_recalls from anon;
revoke all on table public.recall_contact_attempts from public;
revoke all on table public.recall_contact_attempts from anon;

grant select, insert, update on table public.patient_recalls to authenticated;
grant select, insert on table public.recall_contact_attempts to authenticated;

drop policy if exists "patient_recalls_read_authorized" on public.patient_recalls;
create policy "patient_recalls_read_authorized"
on public.patient_recalls
for select
to authenticated
using (public.can_view_patient_recall(patient_id, branch_id, provider_id));

drop policy if exists "patient_recalls_insert_authorized" on public.patient_recalls;
create policy "patient_recalls_insert_authorized"
on public.patient_recalls
for insert
to authenticated
with check (public.can_manage_patient_recall(patient_id, branch_id, provider_id));

drop policy if exists "patient_recalls_update_authorized" on public.patient_recalls;
create policy "patient_recalls_update_authorized"
on public.patient_recalls
for update
to authenticated
using (public.can_manage_patient_recall(patient_id, branch_id, provider_id))
with check (public.can_manage_patient_recall(patient_id, branch_id, provider_id));

drop policy if exists "recall_contact_attempts_read_authorized" on public.recall_contact_attempts;
create policy "recall_contact_attempts_read_authorized"
on public.recall_contact_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.patient_recalls r
    where r.id = recall_contact_attempts.recall_id
      and public.can_view_patient_recall(r.patient_id, r.branch_id, r.provider_id)
  )
);

drop policy if exists "recall_contact_attempts_insert_authorized" on public.recall_contact_attempts;
create policy "recall_contact_attempts_insert_authorized"
on public.recall_contact_attempts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.patient_recalls r
    where r.id = recall_contact_attempts.recall_id
      and r.patient_id = recall_contact_attempts.patient_id
      and public.can_manage_patient_recall(r.patient_id, r.branch_id, r.provider_id)
  )
);
