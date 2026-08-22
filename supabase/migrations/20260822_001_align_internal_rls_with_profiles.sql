-- Align operational RLS with the current profile-based auth model.
-- Legacy policies checked public.staff by JWT email. Internal accounts now live
-- in public.profiles, so super_admin/admin users could read these tables but
-- were incorrectly denied writes.

-- Expenses
drop policy if exists "expenses_internal_write" on public.expenses;
create policy "expenses_internal_write" on public.expenses
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "expense_payments_internal_write" on public.expense_payments;
create policy "expense_payments_internal_write" on public.expense_payments
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "expense_vendors_internal_write" on public.expense_vendors;
create policy "expense_vendors_internal_write" on public.expense_vendors
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "expense_recurring_internal_write" on public.expense_recurring_templates;
create policy "expense_recurring_internal_write" on public.expense_recurring_templates
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "expense_attachments_internal_write" on public.expense_attachments;
create policy "expense_attachments_internal_write" on public.expense_attachments
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

-- Billing operational writes
drop policy if exists "charges_write_internal" on public.charges;
create policy "charges_write_internal" on public.charges
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "payment_allocations_write_internal" on public.payment_allocations;
create policy "payment_allocations_write_internal" on public.payment_allocations
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "receipts_write_internal" on public.receipts;
create policy "receipts_write_internal" on public.receipts
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "refunds_write_internal" on public.refunds;
create policy "refunds_write_internal" on public.refunds
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

-- Preserve patient self-read semantics while recognizing internal profiles.
drop policy if exists "charges_read_self_or_internal" on public.charges;
create policy "charges_read_self_or_internal" on public.charges
for select using (
  public.is_internal_profile()
  or exists (
    select 1 from public.patients p
    where p.auth_user_id = auth.uid()
      and (p.id::text = charges.patient_id or p.patient_id = charges.patient_id)
  )
);

drop policy if exists "payment_allocations_read_self_or_internal" on public.payment_allocations;
create policy "payment_allocations_read_self_or_internal" on public.payment_allocations
for select using (
  public.is_internal_profile()
  or exists (
    select 1
    from public.invoices i
    join public.patients p on (p.id::text = i.patient_id::text or p.patient_id = i.patient_id::text)
    where i.id::text = payment_allocations.invoice_id
      and p.auth_user_id = auth.uid()
  )
);

drop policy if exists "receipts_read_self_or_internal" on public.receipts;
create policy "receipts_read_self_or_internal" on public.receipts
for select using (
  public.is_internal_profile()
  or exists (
    select 1 from public.patients p
    where p.auth_user_id = auth.uid()
      and (p.id::text = receipts.patient_id or p.patient_id = receipts.patient_id)
  )
);

drop policy if exists "refunds_read_self_or_internal" on public.refunds;
create policy "refunds_read_self_or_internal" on public.refunds
for select using (
  public.is_internal_profile()
  or exists (
    select 1 from public.patients p
    where p.auth_user_id = auth.uid()
      and (p.id::text = refunds.patient_id or p.patient_id = refunds.patient_id)
  )
);

-- Other internal operations that still depended on the obsolete staff table.
drop policy if exists "cash_movements_internal_write" on public.cash_movements;
create policy "cash_movements_internal_write" on public.cash_movements
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "cashier_sessions_internal_write" on public.cashier_sessions;
create policy "cashier_sessions_internal_write" on public.cashier_sessions
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "provider_compensation_rules_internal_read" on public.provider_compensation_rules;
create policy "provider_compensation_rules_internal_read" on public.provider_compensation_rules
for select using (public.is_internal_profile());

drop policy if exists "provider_compensation_rules_internal_write" on public.provider_compensation_rules;
create policy "provider_compensation_rules_internal_write" on public.provider_compensation_rules
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "provider_payouts_internal_read" on public.provider_payouts;
create policy "provider_payouts_internal_read" on public.provider_payouts
for select using (public.is_internal_profile());

drop policy if exists "provider_payouts_internal_write" on public.provider_payouts;
create policy "provider_payouts_internal_write" on public.provider_payouts
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "staff_attendance_internal_write" on public.staff_attendance;
create policy "staff_attendance_internal_write" on public.staff_attendance
for all using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists "staff_shift_plans_internal_write" on public.staff_shift_plans;
create policy "staff_shift_plans_internal_write" on public.staff_shift_plans
for all using (public.is_internal_profile()) with check (public.is_internal_profile());
