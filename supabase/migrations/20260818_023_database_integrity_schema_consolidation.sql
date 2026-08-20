-- Part 29: database integrity, production migration, and schema consolidation.
-- Forward-only, non-destructive stabilization. This migration records source-of-truth intent,
-- tightens broad policies, and adds read-only diagnostics without deleting or rewriting data.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create or replace function public.has_profile_permission(permission_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and status = 'active'
        and (
          role in ('super_admin', 'admin')
          or permission_key = any(permissions)
        )
    ),
    false
  )
$$;

create or replace function public.profile_has_active_branch(p_branch_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    public.has_profile_permission('system_admin.view'::text)
    or exists (
      select 1
      from public.staff_branch_assignments sba
      where sba.profile_id = auth.uid()
        and sba.status = 'active'
        and sba.branch_id::text = p_branch_id
    )
    or exists (
      select 1
      from public.providers pr
      join public.provider_branch_assignments pba on pba.provider_id = pr.id
      where pr.profile_id = auth.uid()
        and pr.status in ('active', 'on_leave')
        and pba.status = 'active'
        and pba.branch_id::text = p_branch_id
    ),
    false
  )
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_time_order_check' and conrelid = 'public.appointments'::regclass) then
    alter table public.appointments
      add constraint appointments_time_order_check
      check (start_time < end_time) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_amounts_nonnegative_check' and conrelid = 'public.invoices'::regclass) then
    alter table public.invoices
      add constraint invoices_amounts_nonnegative_check
      check (subtotal_cents >= 0 and discount_cents >= 0 and total_cents >= 0 and amount_paid_cents >= 0 and balance_cents >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_balance_consistency_check' and conrelid = 'public.invoices'::regclass) then
    alter table public.invoices
      add constraint invoices_balance_consistency_check
      check (balance_cents <= total_cents and amount_paid_cents <= total_cents) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payments_amount_consistency_check' and conrelid = 'public.payments'::regclass) then
    alter table public.payments
      add constraint payments_amount_consistency_check
      check (amount_cents > 0 and allocated_cents >= 0 and refundable_cents >= 0 and allocated_cents <= amount_cents and refundable_cents <= amount_cents) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expenses_amount_consistency_check' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses
      add constraint expenses_amount_consistency_check
      check (amount_paid_cents <= total_cents and balance_cents <= total_cents) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expense_payments_date_check' and conrelid = 'public.expense_payments'::regclass) then
    alter table public.expense_payments
      add constraint expense_payments_date_check
      check (payment_date >= date '2000-01-01') not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'communication_attempt_bounds_check' and conrelid = 'public.communication_delivery_logs'::regclass) then
    alter table public.communication_delivery_logs
      add constraint communication_attempt_bounds_check
      check (attempt_count >= 0 and (max_attempts is null or max_attempts > 0)) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'communication_outbox_attempt_bounds_check' and conrelid = 'public.communication_outbox'::regclass) then
    alter table public.communication_outbox
      add constraint communication_outbox_attempt_bounds_check
      check (attempts >= 0 and (max_attempts is null or max_attempts > 0)) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'provider_compensation_percent_bounds_check' and conrelid = 'public.provider_compensation_rules'::regclass) then
    alter table public.provider_compensation_rules
      add constraint provider_compensation_percent_bounds_check
      check (commission_rate_percent between 0 and 100) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'provider_payout_percent_bounds_check' and conrelid = 'public.provider_payouts'::regclass) then
    alter table public.provider_payouts
      add constraint provider_payout_percent_bounds_check
      check (commission_rate_percent between 0 and 100) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'staff_shift_time_order_check' and conrelid = 'public.staff_shift_plans'::regclass) then
    alter table public.staff_shift_plans
      add constraint staff_shift_time_order_check
      check (start_time < end_time) not valid;
  end if;
end $$;

create index if not exists patients_auth_user_id_present_idx
  on public.patients(auth_user_id)
  where auth_user_id is not null;

create index if not exists patients_preferred_branch_status_idx
  on public.patients(preferred_branch_id, status)
  where preferred_branch_id is not null;

create index if not exists audit_logs_entity_created_idx
  on public.audit_logs(entity, entity_id, created_at desc);

create index if not exists communication_delivery_logs_idempotency_status_idx
  on public.communication_delivery_logs(idempotency_key, status);

drop policy if exists "communication_preferences_read_authenticated" on public.communication_preferences;
drop policy if exists "communication_preferences_write_authenticated" on public.communication_preferences;
drop policy if exists "communication_templates_read_authenticated" on public.communication_templates;
drop policy if exists "communication_templates_write_authenticated" on public.communication_templates;
drop policy if exists "communication_settings_authenticated" on public.communication_settings;
drop policy if exists "clinical_amendments_read_authenticated" on public.clinical_record_amendments;
drop policy if exists "clinical_amendments_write_authenticated" on public.clinical_record_amendments;
drop policy if exists "prescriptions_read_authenticated" on public.prescriptions;
drop policy if exists "prescriptions_write_authenticated" on public.prescriptions;
drop policy if exists "allow_audit_logs_read" on public.audit_logs;
drop policy if exists "allow_audit_logs_write_admin" on public.audit_logs;
drop policy if exists "audit_logs_read_authorized" on public.audit_logs;
drop policy if exists "audit_logs_insert_internal" on public.audit_logs;

create policy "communication_preferences_read_self_or_manage"
on public.communication_preferences for select
using (
  public.has_profile_permission('communications.manage'::text)
  or exists (
    select 1 from public.patients p
    where p.patient_id = communication_preferences.patient_id
      and p.auth_user_id = auth.uid()
  )
);

create policy "communication_preferences_write_self_or_manage"
on public.communication_preferences for all
using (
  public.has_profile_permission('communications.manage'::text)
  or exists (
    select 1 from public.patients p
    where p.patient_id = communication_preferences.patient_id
      and p.auth_user_id = auth.uid()
  )
)
with check (
  public.has_profile_permission('communications.manage'::text)
  or exists (
    select 1 from public.patients p
    where p.patient_id = communication_preferences.patient_id
      and p.auth_user_id = auth.uid()
  )
);

create policy "communication_templates_read_internal"
on public.communication_templates for select
using (public.is_internal_profile());

create policy "communication_templates_write_authorized"
on public.communication_templates for all
using (public.has_profile_permission('communications.manage'::text))
with check (public.has_profile_permission('communications.manage'::text));

create policy "communication_settings_read_authorized"
on public.communication_settings for select
using (public.has_profile_permission('communications.manage'::text) or public.has_profile_permission('system_admin.view'::text));

create policy "communication_settings_write_authorized"
on public.communication_settings for all
using (public.has_profile_permission('communications.manage'::text) or public.has_profile_permission('system_admin.manage'::text))
with check (public.has_profile_permission('communications.manage'::text) or public.has_profile_permission('system_admin.manage'::text));

create policy "clinical_amendments_read_self_or_internal"
on public.clinical_record_amendments for select
using (
  public.is_internal_profile()
  or exists (
    select 1 from public.patients p
    where (p.id::text = clinical_record_amendments.patient_id or p.patient_id = clinical_record_amendments.patient_id)
      and p.auth_user_id = auth.uid()
  )
);

create policy "clinical_amendments_write_clinical_authorized"
on public.clinical_record_amendments for all
using (public.has_profile_permission('clinical_records.amend'::text) or public.has_profile_permission('clinical_records.edit'::text))
with check (public.has_profile_permission('clinical_records.amend'::text) or public.has_profile_permission('clinical_records.edit'::text));

create policy "prescriptions_read_self_or_internal"
on public.prescriptions for select
using (
  public.is_internal_profile()
  or exists (
    select 1 from public.patients p
    where (p.id::text = prescriptions.patient_id or p.patient_id = prescriptions.patient_id)
      and p.auth_user_id = auth.uid()
  )
);

create policy "prescriptions_write_clinical_authorized"
on public.prescriptions for all
using (public.has_profile_permission('prescriptions.create'::text) or public.has_profile_permission('prescriptions.edit'::text))
with check (public.has_profile_permission('prescriptions.create'::text) or public.has_profile_permission('prescriptions.edit'::text));

create policy "audit_logs_read_authorized"
on public.audit_logs for select
using (public.has_profile_permission('audit_logs.view'::text) or public.has_profile_permission('system_admin.view'::text));

create policy "audit_logs_insert_internal"
on public.audit_logs for insert
with check (public.is_internal_profile());

create or replace function public.run_database_integrity_checks()
returns table (
  check_key text,
  severity text,
  affected_count bigint,
  detail text
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.has_profile_permission('system_admin.view'::text) then
    raise exception 'Not authorized to run database integrity checks.';
  end if;

  return query
  select 'patients.duplicate_patient_id', 'critical', count(*)::bigint, 'Patient number should be unique.'
  from (
    select patient_id from public.patients group by patient_id having count(*) > 1
  ) rows
  union all
  select 'patients.duplicate_auth_user', 'critical', count(*)::bigint, 'One auth user should not link to multiple patient rows.'
  from (
    select auth_user_id from public.patients where auth_user_id is not null group by auth_user_id having count(*) > 1
  ) rows
  union all
  select 'appointments.invalid_time_range', 'critical', count(*)::bigint, 'Appointment start_time must be before end_time.'
  from public.appointments
  where start_time >= end_time
  union all
  select 'appointments.missing_branch', 'high', count(*)::bigint, 'Branch may be unknown for historical records, but live appointments should be intentionally mapped.'
  from public.appointments
  where branch_id is null
  union all
  select 'appointments.orphan_patient', 'critical', count(*)::bigint, 'Appointment patient_id does not match a patient UUID or patient number.'
  from public.appointments a
  where not exists (select 1 from public.patients p where p.id::text = a.patient_id::text or p.patient_id = a.patient_id::text)
  union all
  select 'treatments.orphan_patient', 'critical', count(*)::bigint, 'Treatment patient_id does not match a patient UUID or patient number.'
  from public.treatments t
  where not exists (select 1 from public.patients p where p.id::text = t.patient_id::text or p.patient_id = t.patient_id::text)
  union all
  select 'invoices.balance_mismatch', 'high', count(*)::bigint, 'Invoice balance/paid fields exceed invoice total.'
  from public.invoices i
  where i.balance_cents > i.total_cents or i.amount_paid_cents > i.total_cents
  union all
  select 'payments.orphan_patient', 'high', count(*)::bigint, 'Payment patient_id does not match a patient UUID or patient number.'
  from public.payments p
  where not exists (select 1 from public.patients patient where patient.id::text = p.patient_id or patient.patient_id = p.patient_id)
  union all
  select 'payment_gateway_events.duplicate_provider_event', 'critical', count(*)::bigint, 'Payment provider event IDs must be unique per provider.'
  from (
    select provider, event_id from public.payment_gateway_events group by provider, event_id having count(*) > 1
  ) rows
  union all
  select 'branch_inventory.negative_quantity', 'critical', count(*)::bigint, 'Branch inventory cannot be negative.'
  from public.branch_inventory
  where quantity_on_hand < 0
  union all
  select 'stock_movements.orphan_inventory_item', 'high', count(*)::bigint, 'Stock movement item does not exist.'
  from public.stock_movements sm
  where not exists (select 1 from public.inventory_items ii where ii.id = sm.inventory_item_id)
  union all
  select 'communications.orphan_patient', 'high', count(*)::bigint, 'Communication delivery log patient_id does not match a patient number.'
  from public.communication_delivery_logs c
  where c.patient_id is not null
    and not exists (select 1 from public.patients p where p.patient_id = c.patient_id)
  union all
  select 'provider_payouts.duplicate_period_provider', 'high', count(*)::bigint, 'Non-void provider payouts should be unique per provider, branch, and period.'
  from (
    select provider_id, branch_id, period_start, period_end
    from public.provider_payouts
    where status <> 'void'
    group by provider_id, branch_id, period_start, period_end
    having count(*) > 1
  ) rows;
end;
$$;

revoke execute on function public.run_database_integrity_checks() from public;
revoke execute on function public.run_database_integrity_checks() from anon;
grant execute on function public.run_database_integrity_checks() to authenticated;

comment on table public.profiles is 'Authentication profile source for internal roles and patient profile records. auth.users remains the credential source of truth.';
comment on column public.patients.auth_user_id is 'Optional portal account link. Walk-in and historical-import patients may remain null.';
comment on table public.branch_inventory is 'Current branch stock balance. Mutations should be paired with stock_movements, preferably through post_stock_movement.';
comment on table public.stock_movements is 'Inventory ledger for stock changes. Do not update historical rows casually.';
comment on table public.payment_gateway_events is 'Idempotency ledger for online payment provider webhooks.';
comment on function public.run_database_integrity_checks() is 'Read-only diagnostics for duplicate, orphaned, and invalid high-risk business records.';
