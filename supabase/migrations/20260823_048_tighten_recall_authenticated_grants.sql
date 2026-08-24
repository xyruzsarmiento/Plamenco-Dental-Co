revoke all on table public.patient_recalls from authenticated;
revoke all on table public.recall_contact_attempts from authenticated;

grant select, insert, update on table public.patient_recalls to authenticated;
grant select, insert on table public.recall_contact_attempts to authenticated;
