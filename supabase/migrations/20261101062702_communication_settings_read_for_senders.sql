drop policy if exists communication_settings_read_authorized
  on public.communication_settings;

create policy communication_settings_read_for_senders
on public.communication_settings
for select
to authenticated
using (
  public.has_profile_permission('communications.manage')
  or public.has_profile_permission('system_admin.view')
  or public.has_profile_permission('notifications.send')
);
