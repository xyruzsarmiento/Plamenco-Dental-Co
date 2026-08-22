-- Restrict report-delivery worker RPCs to the trusted backend role.
-- These functions already enforce service_role internally; this migration also
-- removes unnecessary Data API EXECUTE exposure for signed-in users.

revoke execute on function public.mark_management_report_run_failed(uuid,text) from public, anon, authenticated;
revoke execute on function public.mark_management_report_run_generated(uuid,text,text) from public, anon, authenticated;
revoke execute on function public.record_management_report_delivery(uuid,text,text,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.update_management_report_delivery_state(uuid,text,text,text) from public, anon, authenticated;

grant execute on function public.mark_management_report_run_failed(uuid,text) to service_role;
grant execute on function public.mark_management_report_run_generated(uuid,text,text) to service_role;
grant execute on function public.record_management_report_delivery(uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.update_management_report_delivery_state(uuid,text,text,text) to service_role;
