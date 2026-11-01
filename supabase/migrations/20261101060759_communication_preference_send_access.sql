-- Allow appointment notification senders to read patient channel consent.
-- Dentists and associate dentists have notifications.send (not
-- communications.manage), so the previous self-or-manage policy returned an
-- empty result for them. The empty RLS result was then treated as an empty
-- preference cache and silently reset all external channels to disabled.

drop policy if exists communication_preferences_read_self_or_manage
  on public.communication_preferences;

create policy communication_preferences_read_self_or_send
on public.communication_preferences
for select
to authenticated
using (
  public.has_profile_permission('communications.manage')
  or public.has_profile_permission('notifications.send')
  or exists (
    select 1
    from public.patients p
    where p.patient_id = communication_preferences.patient_id
      and p.auth_user_id = auth.uid()
  )
);
