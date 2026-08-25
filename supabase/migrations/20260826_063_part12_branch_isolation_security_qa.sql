-- PART 12: final branch isolation/security QA hardening.
-- The browser may choose a branch for UX, but auth.uid() + active assignments are authoritative.

create or replace function public.part12_is_super_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active' and p.role='super_admin'),false)
$$;

create or replace function public.part12_can_access_branch(p_branch_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(
    nullif(btrim(coalesce(p_branch_id,'')),'') is not null
    and exists(select 1 from public.branches b where b.id::text=p_branch_id and b.status='active')
    and exists(
      select 1 from public.profiles p
      where p.id=auth.uid() and p.status='active' and (
        p.role='super_admin'
        or (p.role='staff' and exists(select 1 from public.staff_branch_assignments s where s.profile_id=p.id and s.branch_id::text=p_branch_id and s.status='active'))
        or (p.role in ('dentist','associate_dentist') and exists(
          select 1 from public.providers pr join public.provider_branch_assignments a on a.provider_id=pr.id
          where pr.profile_id=p.id and pr.status in ('active','on_leave') and a.branch_id::text=p_branch_id and a.status='active'
        ))
      )
    ),false)
$$;

create or replace function public.part12_can_read_branch_or_legacy(p_branch_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select case when nullif(btrim(coalesce(p_branch_id,'')),'') is null then public.part12_is_super_admin() else public.part12_can_access_branch(p_branch_id) end
$$;

create or replace function public.part12_can_access_expense(p_scope text,p_branch_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select case when coalesce(p_scope,'branch')='clinic_wide' or nullif(btrim(coalesce(p_branch_id,'')),'') is null
    then public.part12_is_super_admin() else public.part12_can_access_branch(p_branch_id) end
$$;

revoke all on function public.part12_is_super_admin() from public,anon;
revoke all on function public.part12_can_access_branch(text) from public,anon;
revoke all on function public.part12_can_read_branch_or_legacy(text) from public,anon;
revoke all on function public.part12_can_access_expense(text,text) from public,anon;
grant execute on function public.part12_is_super_admin() to authenticated,service_role;
grant execute on function public.part12_can_access_branch(text) to authenticated,service_role;
grant execute on function public.part12_can_read_branch_or_legacy(text) to authenticated,service_role;
grant execute on function public.part12_can_access_expense(text,text) to authenticated,service_role;

-- Self-service profile editing must never become privilege escalation.
create or replace function public.part12_guard_profile_privilege_changes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid()=old.id and not public.part12_is_super_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status or new.permissions is distinct from old.permissions then
      raise exception 'Profile role, status, and permissions are management-controlled' using errcode='42501';
    end if;
  end if;
  return new;
end;$$;
drop trigger if exists part12_profile_privilege_guard on public.profiles;
create trigger part12_profile_privilege_guard before update on public.profiles for each row execute procedure public.part12_guard_profile_privilege_changes();

-- Assignment directories: users can resolve their own access; only Super Admin sees all assignment rows.
drop policy if exists staff_branch_assignments_read_authenticated on public.staff_branch_assignments;
create policy staff_branch_assignments_read_own_or_management on public.staff_branch_assignments for select to authenticated using (profile_id=auth.uid() or public.part12_is_super_admin());
drop policy if exists provider_branch_assignments_read_authenticated on public.provider_branch_assignments;
create policy provider_branch_assignments_read_own_or_management on public.provider_branch_assignments for select to authenticated using (
  public.part12_is_super_admin() or exists(select 1 from public.providers pr where pr.id=provider_branch_assignments.provider_id and pr.profile_id=auth.uid())
);

-- Add restrictive guards on top of existing permission/self-service policies.
-- Appointments
create policy part12_appointments_branch_guard on public.appointments as restrictive for all to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id::text))
  or exists(select 1 from public.patients p where p.id=appointments.patient_id and p.auth_user_id=auth.uid())
)
with check (
  (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id::text))
  or (booking_source='patient_portal' and status='pending' and branch_id is not null
      and exists(select 1 from public.patients p where p.id=appointments.patient_id and p.auth_user_id=auth.uid())
      and exists(select 1 from public.branches b where b.id=appointments.branch_id and b.status='active'))
);

-- Clinical records
create policy part12_dental_records_branch_guard on public.dental_records as restrictive for all to authenticated
using (public.part12_can_read_branch_or_legacy(branch_id))
with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_treatments_branch_guard on public.treatments as restrictive for all to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists(select 1 from public.patients p where (p.id::text=treatments.patient_id::text or p.patient_id=treatments.patient_id::text) and p.auth_user_id=auth.uid())
)
with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_treatment_plans_branch_guard on public.treatment_plans as restrictive for all to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists(select 1 from public.patients p where p.id=treatment_plans.patient_id and p.auth_user_id=auth.uid())
)
with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_prescriptions_branch_guard on public.prescriptions as restrictive for all to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists(select 1 from public.patients p where (p.id::text=prescriptions.patient_id or p.patient_id=prescriptions.patient_id) and p.auth_user_id=auth.uid())
)
with check (branch_id is not null and public.part12_can_access_branch(branch_id));

-- Billing
create policy part12_invoices_branch_guard on public.invoices as restrictive for all to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists(select 1 from public.patients p where p.id=invoices.patient_id and p.auth_user_id=auth.uid())
)
with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_payments_branch_guard on public.payments as restrictive for all to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists(select 1 from public.patients p where p.id=payments.patient_id and p.auth_user_id=auth.uid())
)
with check (
  (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id))
  or (status='pending' and exists(select 1 from public.patients p where p.id=payments.patient_id and p.auth_user_id=auth.uid())
      and exists(select 1 from public.invoices i where i.id=payments.invoice_id and i.patient_id=payments.patient_id and i.branch_id=payments.branch_id))
);
create policy part12_charges_branch_guard on public.charges as restrictive for all to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists(select 1 from public.patients p where (p.id::text=charges.patient_id or p.patient_id=charges.patient_id) and p.auth_user_id=auth.uid())
)
with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_receipts_branch_guard on public.receipts as restrictive for all to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists(select 1 from public.patients p where (p.id::text=receipts.patient_id or p.patient_id=receipts.patient_id) and p.auth_user_id=auth.uid())
)
with check (branch_id is not null and public.part12_can_access_branch(branch_id)
  and exists(select 1 from public.payments p where p.id::text=receipts.payment_id and p.branch_id=receipts.branch_id));
create policy part12_refunds_branch_guard on public.refunds as restrictive for all to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists(select 1 from public.patients p where (p.id::text=refunds.patient_id or p.patient_id=refunds.patient_id) and p.auth_user_id=auth.uid())
)
with check (branch_id is not null and public.part12_can_access_branch(branch_id)
  and exists(select 1 from public.payments p where p.id::text=refunds.payment_id and p.branch_id=refunds.branch_id));
create policy part12_payment_allocations_branch_guard on public.payment_allocations as restrictive for all to authenticated
using (
  exists(select 1 from public.invoices i join public.patients p on p.id=i.patient_id where i.id::text=payment_allocations.invoice_id
    and (p.auth_user_id=auth.uid() or (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(i.branch_id))))
)
with check (
  public.is_internal_profile()
  and exists(select 1 from public.invoices i where i.id::text=payment_allocations.invoice_id and i.branch_id is not null and public.part12_can_access_branch(i.branch_id))
  and exists(select 1 from public.payments p where p.id::text=payment_allocations.payment_id and p.branch_id is not null and public.part12_can_access_branch(p.branch_id))
);

-- Inventory operational data. Global catalog/supplier tables intentionally remain clinic-wide.
create policy part12_branch_inventory_guard on public.branch_inventory as restrictive for all to authenticated
using (public.part12_can_read_branch_or_legacy(branch_id)) with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_inventory_batches_guard on public.inventory_batches as restrictive for all to authenticated
using (public.part12_can_read_branch_or_legacy(branch_id)) with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_stock_movements_guard on public.stock_movements as restrictive for all to authenticated
using (public.part12_can_read_branch_or_legacy(branch_id)) with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_purchase_orders_guard on public.purchase_orders as restrictive for all to authenticated
using (public.part12_can_read_branch_or_legacy(branch_id)) with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_purchase_receipts_guard on public.purchase_receipts as restrictive for all to authenticated
using (public.part12_can_read_branch_or_legacy(branch_id)) with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_stock_counts_guard on public.stock_counts as restrictive for all to authenticated
using (public.part12_can_read_branch_or_legacy(branch_id)) with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_stock_transfers_guard on public.stock_transfers as restrictive for all to authenticated
using (
  public.part12_is_super_admin() or public.part12_can_access_branch(from_branch_id) or public.part12_can_access_branch(to_branch_id)
)
with check (
  public.part12_is_super_admin() or (from_branch_id is not null and to_branch_id is not null and public.part12_can_access_branch(from_branch_id) and public.part12_can_access_branch(to_branch_id))
);

-- Expenses: clinic-wide costs are management-only; branch costs follow assignments.
create policy part12_expenses_guard on public.expenses as restrictive for all to authenticated
using (public.part12_can_access_expense(scope,branch_id))
with check (scope in ('branch','clinic_wide') and public.part12_can_access_expense(scope,branch_id) and (scope='clinic_wide' or branch_id is not null));
create policy part12_expense_recurring_guard on public.expense_recurring_templates as restrictive for all to authenticated
using (public.part12_can_access_expense(scope,branch_id))
with check (scope in ('branch','clinic_wide') and public.part12_can_access_expense(scope,branch_id) and (scope='clinic_wide' or branch_id is not null));
create policy part12_expense_payments_guard on public.expense_payments as restrictive for all to authenticated
using (exists(select 1 from public.expenses e where e.id=expense_payments.expense_id and public.part12_can_access_expense(e.scope,e.branch_id)))
with check (exists(select 1 from public.expenses e where e.id=expense_payments.expense_id and public.part12_can_access_expense(e.scope,e.branch_id)));
create policy part12_expense_attachments_guard on public.expense_attachments as restrictive for all to authenticated
using (exists(select 1 from public.expenses e where e.id=expense_attachments.expense_id and public.part12_can_access_expense(e.scope,e.branch_id)))
with check (exists(select 1 from public.expenses e where e.id=expense_attachments.expense_id and public.part12_can_access_expense(e.scope,e.branch_id)));

-- Documents/forms were hardened in Part 11; this adds no broader override.
-- Reports: export rows are branch-bound; saved views are private to creator except Super Admin.
create policy part12_report_exports_guard on public.report_export_logs as restrictive for all to authenticated
using (public.part12_can_read_branch_or_legacy(branch_id))
with check (branch_id is not null and public.part12_can_access_branch(branch_id));
create policy part12_saved_report_views_guard on public.saved_report_views as restrictive for all to authenticated
using (created_by=auth.uid() or public.part12_is_super_admin())
with check (created_by=auth.uid() or public.part12_is_super_admin());

-- Prevent direct anonymous execution of internal branch helpers that were previously exposed.
revoke execute on function public.profile_has_active_branch(text) from public,anon;
grant execute on function public.profile_has_active_branch(text) to authenticated,service_role;
revoke execute on function public.staff_can_manage_inventory_branch(text) from public,anon;
grant execute on function public.staff_can_manage_inventory_branch(text) to authenticated,service_role;
