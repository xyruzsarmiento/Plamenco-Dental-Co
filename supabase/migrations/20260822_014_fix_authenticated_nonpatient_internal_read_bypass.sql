-- Close the "authenticated but not a patient" authorization gap.
-- Internal finance/workforce data now requires a real active internal profile.
-- Also replace auth.role()-based directory policies with TO authenticated.

alter policy cash_movements_internal_read on public.cash_movements to authenticated using (public.is_internal_profile());
alter policy cashier_sessions_internal_read on public.cashier_sessions to authenticated using (public.is_internal_profile());
alter policy expense_attachments_internal_read on public.expense_attachments to authenticated using (public.is_internal_profile());
alter policy expense_categories_internal_read on public.expense_categories to authenticated using (public.is_internal_profile());
alter policy expense_payments_internal_read on public.expense_payments to authenticated using (public.is_internal_profile());
alter policy expense_recurring_internal_read on public.expense_recurring_templates to authenticated using (public.is_internal_profile());
alter policy expense_vendors_internal_read on public.expense_vendors to authenticated using (public.is_internal_profile());
alter policy expenses_internal_read on public.expenses to authenticated using (public.is_internal_profile());
alter policy staff_attendance_internal_read on public.staff_attendance to authenticated using (public.is_internal_profile());
alter policy staff_shift_plans_internal_read on public.staff_shift_plans to authenticated using (public.is_internal_profile());

alter policy communication_outbox_write_authorized on public.communication_outbox to authenticated
  using (public.is_management_role() or public.has_profile_permission('communications.manage') or public.has_profile_permission('system_admin.manage'))
  with check (public.is_management_role() or public.has_profile_permission('communications.manage') or public.has_profile_permission('system_admin.manage'));

alter policy payment_gateway_events_read_authorized on public.payment_gateway_events to authenticated
  using (public.is_management_role() or public.has_profile_permission('payments.verify') or public.has_profile_permission('system_admin.view'));
alter policy payment_gateway_events_write_authorized on public.payment_gateway_events to authenticated
  using (public.is_management_role() or public.has_profile_permission('payments.verify') or public.has_profile_permission('system_admin.manage'))
  with check (public.is_management_role() or public.has_profile_permission('payments.verify') or public.has_profile_permission('system_admin.manage'));

alter policy branches_read_authenticated on public.branches to authenticated using (true);
alter policy operatories_read_authenticated on public.operatories to authenticated using (true);
alter policy payment_methods_read_authenticated on public.payment_methods to authenticated using (true);
alter policy provider_availability_overrides_read_authenticated on public.provider_availability_overrides to authenticated using (true);
alter policy provider_branch_assignments_read_authenticated on public.provider_branch_assignments to authenticated using (true);
alter policy provider_schedule_blocks_read_authenticated on public.provider_schedule_blocks to authenticated using (true);
alter policy providers_read_authenticated on public.providers to authenticated using (true);
alter policy schedule_blocks_read_authenticated on public.schedule_blocks to authenticated using (true);
alter policy staff_branch_assignments_read_authenticated on public.staff_branch_assignments to authenticated using (true);
