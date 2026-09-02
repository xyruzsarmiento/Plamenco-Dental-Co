-- Release-candidate security hardening.
-- Keep intended authenticated RPC entrypoints callable, but remove accidental
-- anonymous/public EXECUTE exposure on internal SECURITY DEFINER helpers.

-- Internal trigger/helper functions are executed by triggers or other trusted
-- functions. They are not public API endpoints.
revoke all on function public.enforce_appointment_provider_branch_assignment() from public, anon, authenticated;
revoke all on function public.enforce_provider_schedule_assignment_and_overlap() from public, anon, authenticated;
revoke all on function public.part11_lock_form_submission_context() from public, anon, authenticated;
revoke all on function public.part11_validate_form_assignment_context() from public, anon, authenticated;
revoke all on function public.part12_guard_profile_privilege_changes() from public, anon, authenticated;
revoke all on function public.patient_booking_provider_available_v132(uuid, uuid, date, time, time) from public, anon, authenticated;
revoke all on function public.recall_appointment_belongs_to_patient(text, text) from public, anon, authenticated;

-- Authenticated-only helper/RPC functions.
revoke all on function public.is_active_internal_account() from public, anon;
grant execute on function public.is_active_internal_account() to authenticated;

revoke all on function public.get_patient_booking_busy_windows_v130(date, date) from public, anon;
grant execute on function public.get_patient_booking_busy_windows_v130(date, date) to authenticated;

revoke all on function public.get_staff_branch_report_v131(date, date, text) from public, anon;
grant execute on function public.get_staff_branch_report_v131(date, date, text) to authenticated;

revoke all on function public.replace_provider_weekly_schedule_v131(uuid, jsonb) from public, anon;
grant execute on function public.replace_provider_weekly_schedule_v131(uuid, jsonb) to authenticated;

revoke all on function public.create_provider_availability_override_v131(uuid, uuid, date, text, time, time, text, text) from public, anon;
grant execute on function public.create_provider_availability_override_v131(uuid, uuid, date, text, time, time, text, text) to authenticated;

comment on function public.get_staff_branch_report_v131(date, date, text) is
  'Release-candidate hardened: callable by authenticated users only; function body enforces reports.view_limited and active branch access.';

comment on function public.get_patient_booking_busy_windows_v130(date, date) is
  'Release-candidate hardened: callable by authenticated patient accounts only; returns non-identifying booking occupancy windows.';
