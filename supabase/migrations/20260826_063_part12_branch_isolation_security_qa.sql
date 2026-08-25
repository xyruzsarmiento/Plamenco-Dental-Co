-- PART 12: final branch-isolation/security hardening.
-- Browser-selected branch ids are never authorization. All operational access is derived from auth.uid().

create or replace function public.part12_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active' and p.role = 'super_admin'
  ), false)
$$;

create or replace function public.part12_can_access_branch(p_branch_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(p_branch_id), '') is not null
    and exists (select 1 from public.branches b where b.id::text = p_branch_id and b.status = 'active')
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'active'
        and (
          p.role = 'super_admin'
          or (p.role = 'staff' and exists (
            select 1 from public.staff_branch_assignments sba
            where sba.profile_id = p.id and sba.branch_id::text = p_branch_id and sba.status = 'active'
          ))
          or (p.role in ('dentist','associate_dentist') and exists (
            select 1
            from public.providers pr
            join public.provider_branch_assignments pba on pba.provider_id = pr.id
            where pr.profile_id = p.id
              and pr.status in ('active','on_leave')
              and pba.branch_id::text = p_branch_id
              and pba.status = 'active'
          ))
        )
    ), false
  )
$$;

create or replace function public.part12_can_access_expense_scope(p_scope text, p_branch_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(p_scope, 'branch') = 'clinic_wide' or nullif(btrim(coalesce(p_branch_id,'')), '') is null
      then public.part12_is_super_admin()
    else public.part12_can_access_branch(p_branch_id)
  end
$$;

revoke all on function public.part12_is_super_admin() from public, anon;
revoke all on function public.part12_can_access_branch(text) from public, anon;
revoke all on function public.part12_can_access_expense_scope(text,text) from public, anon;
grant execute on function public.part12_is_super_admin() to authenticated, service_role;
grant execute on function public.part12_can_access_branch(text) to authenticated, service_role;
grant execute on function public.part12_can_access_expense_scope(text,text) to authenticated, service_role;

-- Appointments: patient self-service remains allowed, internal access is branch-bound.
drop policy if exists appointments_select_self_internal_or_provider on public.appointments;
drop policy if exists appointments_insert_internal_or_self_request on public.appointments;
drop policy if exists appointments_update_internal_or_self_request on public.appointments;
create policy appointments_select_branch_or_self on public.appointments for select to authenticated using (
  (exists (select 1 from public.patients p where p.id = appointments.patient_id and p.auth_user_id = auth.uid()))
  or (public.is_internal_profile() and appointments.branch_id is not null and public.part12_can_access_branch(appointments.branch_id::text))
);
create policy appointments_insert_branch_or_self_request on public.appointments for insert to authenticated with check (
  (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id::text))
  or (
    booking_source = 'patient_portal' and status = 'pending'
    and exists (select 1 from public.patients p where p.id = appointments.patient_id and p.auth_user_id = auth.uid())
    and branch_id is not null and exists (select 1 from public.branches b where b.id = appointments.branch_id and b.status = 'active')
  )
);
create policy appointments_update_branch_or_self_request on public.appointments for update to authenticated using (
  (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id::text))
  or (booking_source = 'patient_portal' and exists (select 1 from public.patients p where p.id = appointments.patient_id and p.auth_user_id = auth.uid()))
) with check (
  (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id::text))
  or (
    booking_source = 'patient_portal'
    and exists (select 1 from public.patients p where p.id = appointments.patient_id and p.auth_user_id = auth.uid())
    and branch_id is not null and exists (select 1 from public.branches b where b.id = appointments.branch_id and b.status = 'active')
  )
);

-- Clinical records and treatment plans.
drop policy if exists records_read_self_or_internal on public.dental_records;
drop policy if exists dental_records_write_internal on public.dental_records;
drop policy if exists dental_records_update_internal on public.dental_records;
create policy dental_records_branch_read on public.dental_records for select to authenticated using (
  public.has_profile_permission('clinical_records.view') and branch_id is not null and public.part12_can_access_branch(branch_id)
);
create policy dental_records_branch_insert on public.dental_records for insert to authenticated with check (
  public.has_profile_permission('clinical_records.create') and branch_id is not null and public.part12_can_access_branch(branch_id)
);
create policy dental_records_branch_update on public.dental_records for update to authenticated using (
  public.has_any_profile_permission(array['clinical_records.edit','clinical_records.edit_draft','clinical_records.finalize','clinical_records.amend'])
  and branch_id is not null and public.part12_can_access_branch(branch_id)
) with check (
  public.has_any_profile_permission(array['clinical_records.edit','clinical_records.edit_draft','clinical_records.finalize','clinical_records.amend'])
  and branch_id is not null and public.part12_can_access_branch(branch_id)
);

drop policy if exists plans_read_self_or_internal on public.treatment_plans;
drop policy if exists plans_insert_authorized on public.treatment_plans;
drop policy if exists plans_update_authorized on public.treatment_plans;
create policy plans_read_branch_or_self on public.treatment_plans for select to authenticated using (
  exists (select 1 from public.patients p where p.id=treatment_plans.patient_id and p.auth_user_id=auth.uid())
  or (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id))
);
create policy plans_insert_branch_authorized on public.treatment_plans for insert to authenticated with check (
  public.has_profile_permission('treatments.create') and branch_id is not null and public.part12_can_access_branch(branch_id)
);
create policy plans_update_branch_authorized on public.treatment_plans for update to authenticated using (
  public.has_profile_permission('treatments.edit') and branch_id is not null and public.part12_can_access_branch(branch_id)
) with check (
  public.has_profile_permission('treatments.edit') and branch_id is not null and public.part12_can_access_branch(branch_id)
);

drop policy if exists treatments_read_self_or_internal on public.treatments;
drop policy if exists treatments_insert_authorized on public.treatments;
drop policy if exists treatments_update_authorized on public.treatments;
create policy treatments_read_branch_or_self on public.treatments for select to authenticated using (
  exists (select 1 from public.patients p where (p.id::text=treatments.patient_id::text or p.patient_id=treatments.patient_id::text) and p.auth_user_id=auth.uid())
  or (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id))
);
create policy treatments_insert_branch_authorized on public.treatments for insert to authenticated with check (
  public.has_profile_permission('treatments.create') and branch_id is not null and public.part12_can_access_branch(branch_id)
);
create policy treatments_update_branch_authorized on public.treatments for update to authenticated using (
  public.has_any_profile_permission(array['treatments.edit','treatments.complete']) and branch_id is not null and public.part12_can_access_branch(branch_id)
) with check (
  public.has_any_profile_permission(array['treatments.edit','treatments.complete']) and branch_id is not null and public.part12_can_access_branch(branch_id)
);

drop policy if exists prescriptions_read_self_or_internal on public.prescriptions;
drop policy if exists prescriptions_write_clinical_authorized on public.prescriptions;
drop policy if exists prescriptions_update_clinical_authorized on public.prescriptions;
create policy prescriptions_read_branch_or_self on public.prescriptions for select to authenticated using (
  exists (select 1 from public.patients p where (p.id::text=prescriptions.patient_id or p.patient_id=prescriptions.patient_id) and p.auth_user_id=auth.uid())
  or (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id))
);
create policy prescriptions_insert_branch_authorized on public.prescriptions for insert to authenticated with check (
  public.can_author_prescription() and branch_id is not null and public.part12_can_access_branch(branch_id)
);
create policy prescriptions_update_branch_authorized on public.prescriptions for update to authenticated using (
  public.can_author_prescription() and branch_id is not null and public.part12_can_access_branch(branch_id)
) with check (
  public.can_author_prescription() and branch_id is not null and public.part12_can_access_branch(branch_id)
);

-- Billing: patient reads stay patient-wide; internal reads/writes require invoice/payment branch ownership.
drop policy if exists invoices_read_self_or_internal on public.invoices;
drop policy if exists invoices_insert_internal on public.invoices;
drop policy if exists invoices_update_internal on public.invoices;
create policy invoices_read_branch_or_self on public.invoices for select to authenticated using (
  exists (select 1 from public.patients p where (p.id::text=invoices.patient_id::text or p.patient_id=invoices.patient_id::text) and p.auth_user_id=auth.uid())
  or (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id))
);
create policy invoices_insert_branch_internal on public.invoices for insert to authenticated with check (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
);
create policy invoices_update_branch_internal on public.invoices for update to authenticated using (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
) with check (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
);

drop policy if exists payments_read_self_or_internal on public.payments;
drop policy if exists payments_insert_internal_or_self_pending on public.payments;
drop policy if exists payments_update_internal on public.payments;
create policy payments_read_branch_or_self on public.payments for select to authenticated using (
  exists (select 1 from public.patients p where (p.id::text=payments.patient_id::text or p.patient_id=payments.patient_id::text) and p.auth_user_id=auth.uid())
  or (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id))
);
create policy payments_insert_branch_or_self_pending on public.payments for insert to authenticated with check (
  (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id))
  or (
    status='pending' and exists (select 1 from public.patients p where p.id=payments.patient_id and p.auth_user_id=auth.uid())
    and exists (select 1 from public.invoices i where i.id=payments.invoice_id and i.patient_id=payments.patient_id and i.branch_id=payments.branch_id)
  )
);
create policy payments_update_branch_internal on public.payments for update to authenticated using (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
) with check (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
  and exists (select 1 from public.invoices i where i.id=payments.invoice_id and i.branch_id=payments.branch_id)
);

drop policy if exists charges_read_self_or_internal on public.charges;
drop policy if exists charges_write_internal on public.charges;
create policy charges_read_branch_or_self on public.charges for select to authenticated using (
  exists (select 1 from public.patients p where (p.id::text=charges.patient_id or p.patient_id=charges.patient_id) and p.auth_user_id=auth.uid())
  or (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id))
);
create policy charges_write_branch_internal on public.charges for all to authenticated using (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
) with check (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
);

drop policy if exists receipts_read_self_or_internal on public.receipts;
drop policy if exists receipts_write_internal on public.receipts;
create policy receipts_read_branch_or_self on public.receipts for select to authenticated using (
  exists (select 1 from public.patients p where (p.id::text=receipts.patient_id or p.patient_id=receipts.patient_id) and p.auth_user_id=auth.uid())
  or (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id))
);
create policy receipts_write_branch_internal on public.receipts for all to authenticated using (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
) with check (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
  and exists (select 1 from public.payments p where p.id::text=receipts.payment_id and p.branch_id=receipts.branch_id)
);

drop policy if exists refunds_read_self_or_internal on public.refunds;
drop policy if exists refunds_write_internal on public.refunds;
create policy refunds_read_branch_or_self on public.refunds for select to authenticated using (
  exists (select 1 from public.patients p where (p.id::text=refunds.patient_id or p.patient_id=refunds.patient_id) and p.auth_user_id=auth.uid())
  or (public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id))
);
create policy refunds_write_branch_internal on public.refunds for all to authenticated using (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
) with check (
  public.is_internal_profile() and branch_id is not null and public.part12_can_access_branch(branch_id)
  and exists (select 1 from public.payments p where p.id::text=refunds.payment_id and p.branch_id=refunds.branch_id)
);

drop policy if exists payment_allocations_read_self_or_internal on public.payment_allocations;
drop policy if exists payment_allocations_write_internal on public.payment_allocations;
create policy payment_allocations_read_branch_or_self on public.payment_allocations for select to authenticated using (
  exists (
    select 1 from public.invoices i join public.patients p on p.id=i.patient_id
    where i.id::text=payment_allocations.invoice_id
      and (p.auth_user_id=auth.uid() or (public.is_internal_profile() and i.branch_id is not null and public.part12_can_access_branch(i.branch_id)))
  )
);
create policy payment_allocations_write_branch_internal on public.payment_allocations for all to authenticated using (
  exists (select 1 from public.invoices i where i.id::text=payment_allocations.invoice_id and public.part12_can_access_branch(i.branch_id))
) with check (
  public.is_internal_profile()
  and exists (select 1 from public.invoices i where i.id::text=payment_allocations.invoice_id and public.part12_can_access_branch(i.branch_id))
  and exists (select 1 from public.payments p where p.id::text=payment_allocations.payment_id and public.part12_can_access_branch(p.branch_id))
);

-- Inventory operational tables. Product/category/supplier catalogs remain clinic-wide.
-- Remove duplicate broad policies before replacing them with branch-aware policies.
drop policy if exists branch_inventory_internal_read on public.branch_inventory;
drop policy if exists branch_inventory_read_internal on public.branch_inventory;
drop policy if exists branch_inventory_internal_write on public.branch_inventory;
drop policy if exists branch_inventory_write_authorized on public.branch_inventory;
create policy branch_inventory_branch_read on public.branch_inventory for select to authenticated using (public.part12_can_access_branch(branch_id));
create policy branch_inventory_branch_write on public.branch_inventory for all to authenticated using (
  public.part12_can_access_branch(branch_id) and public.has_any_profile_permission(array['inventory.stock_in','inventory.stock_out','inventory.adjust','inventory.transfer','inventory.receive_transfer','purchases.receive','purchase_orders.receive'])
) with check (
  public.part12_can_access_branch(branch_id) and public.has_any_profile_permission(array['inventory.stock_in','inventory.stock_out','inventory.adjust','inventory.transfer','inventory.receive_transfer','purchases.receive','purchase_orders.receive'])
);

foreach_table_placeholder
