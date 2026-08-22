-- Final security and retention hardening for Plamenco Dental Co.
-- Applied to production on 2026-08-22. No production rows are deleted.

-- Remove legacy permissive RLS policies.
drop policy if exists allow_all_for_anon on public.patients;
drop policy if exists allow_all_for_anon on public.appointments;
drop policy if exists allow_all_for_anon on public.dental_records;
drop policy if exists allow_all_for_anon on public.documents;
drop policy if exists allow_all_for_anon on public.invoices;
drop policy if exists allow_all_for_anon on public.payments;
drop policy if exists allow_all_for_anon on public.treatments;
drop policy if exists allow_all_for_anon on public.treatment_plans;
drop policy if exists allow_all_for_anon on public.audit_logs;
drop policy if exists allow_all_for_anon on public.notifications;
drop policy if exists allow_all_for_anon on public.staff;
drop policy if exists allow_all_for_anon on public.services;

drop policy if exists allow_appointments_read on public.appointments;
drop policy if exists allow_appointments_write_admin on public.appointments;
drop policy if exists allow_records_read on public.dental_records;
drop policy if exists allow_records_write_admin on public.dental_records;
drop policy if exists allow_documents_read on public.documents;
drop policy if exists allow_documents_write_admin on public.documents;
drop policy if exists allow_invoices_read on public.invoices;
drop policy if exists allow_invoices_write_admin on public.invoices;
drop policy if exists allow_payments_read on public.payments;
drop policy if exists allow_payments_write_admin on public.payments;
drop policy if exists allow_treatments_read on public.treatments;
drop policy if exists allow_treatments_write_admin on public.treatments;
drop policy if exists allow_plans_read on public.treatment_plans;
drop policy if exists allow_plans_write_admin on public.treatment_plans;
drop policy if exists allow_audit_logs_read on public.audit_logs;
drop policy if exists allow_audit_logs_write_admin on public.audit_logs;
drop policy if exists allow_notifications_read on public.notifications;
drop policy if exists allow_notifications_write_admin on public.notifications;
drop policy if exists staff_read_all on public.staff;
drop policy if exists staff_write_all_for_admin on public.staff;
drop policy if exists allow_services_read on public.services;
drop policy if exists allow_services_write_admin on public.services;

-- Scope older self/internal policies so anon never evaluates internal permission helpers.
alter policy patients_insert_own_record on public.patients to authenticated;
alter policy patients_insert_self_or_internal on public.patients to authenticated;
alter policy patients_read_own_record on public.patients to authenticated;
alter policy patients_select_self_or_internal on public.patients to authenticated;
alter policy patients_update_own_record on public.patients to authenticated;
alter policy patients_update_self_or_internal on public.patients to authenticated;
alter policy appointments_select_self_internal_or_provider on public.appointments to authenticated;
alter policy records_read_self_or_internal on public.dental_records to authenticated;
alter policy documents_read_self_or_internal on public.documents to authenticated;
alter policy invoices_read_self_or_internal on public.invoices to authenticated;
alter policy payments_read_self_or_internal on public.payments to authenticated;
alter policy treatments_read_self_or_internal on public.treatments to authenticated;
alter policy audit_logs_insert_internal on public.audit_logs to authenticated;
alter policy audit_logs_read_authorized on public.audit_logs to authenticated;

-- Appointments use status transitions instead of hard delete.
drop policy if exists appointments_write_internal_or_self_request on public.appointments;
drop policy if exists appointments_insert_internal_or_self_request on public.appointments;
drop policy if exists appointments_update_internal_or_self_request on public.appointments;
drop policy if exists appointments_public_booking_insert on public.appointments;
create policy appointments_insert_internal_or_self_request
on public.appointments for insert to authenticated
with check (
  public.is_internal_profile()
  or (booking_source = 'patient_portal' and status = 'pending' and exists (
    select 1 from public.patients p
    where p.id = appointments.patient_id and p.auth_user_id = auth.uid()
  ))
);
create policy appointments_update_internal_or_self_request
on public.appointments for update to authenticated
using (
  public.is_internal_profile()
  or (booking_source = 'patient_portal' and exists (
    select 1 from public.patients p
    where p.id = appointments.patient_id and p.auth_user_id = auth.uid()
  ))
)
with check (
  public.is_internal_profile()
  or (booking_source = 'patient_portal' and exists (
    select 1 from public.patients p
    where p.id = appointments.patient_id and p.auth_user_id = auth.uid()
  ))
);

-- Public booking is an intentional narrow insert-only exception. It cannot read,
-- update, or delete patient/appointment records.
drop policy if exists patients_public_booking_insert on public.patients;
create policy patients_public_booking_insert
on public.patients for insert to anon
with check (auth_user_id is null and coalesce(status, 'active') = 'active');
create policy appointments_public_booking_insert
on public.appointments for insert to anon
with check (booking_source = 'patient_portal' and status = 'pending' and created_by = 'public-booking');

-- Retained clinical/accounting entities: INSERT/UPDATE only for active internal users.
drop policy if exists dental_records_write_internal on public.dental_records;
drop policy if exists dental_records_update_internal on public.dental_records;
create policy dental_records_write_internal on public.dental_records for insert to authenticated with check (public.is_internal_profile());
create policy dental_records_update_internal on public.dental_records for update to authenticated using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists documents_write_internal on public.documents;
drop policy if exists documents_update_internal on public.documents;
create policy documents_write_internal on public.documents for insert to authenticated with check (public.is_internal_profile());
create policy documents_update_internal on public.documents for update to authenticated using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists invoices_insert_internal on public.invoices;
drop policy if exists invoices_update_internal on public.invoices;
create policy invoices_insert_internal on public.invoices for insert to authenticated with check (public.is_internal_profile());
create policy invoices_update_internal on public.invoices for update to authenticated using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists payments_insert_internal_or_self_pending on public.payments;
drop policy if exists payments_update_internal on public.payments;
create policy payments_insert_internal_or_self_pending
on public.payments for insert to authenticated
with check (
  public.is_internal_profile()
  or (status = 'pending' and exists (
    select 1 from public.patients p
    where p.id = payments.patient_id and p.auth_user_id = auth.uid()
  ))
);
create policy payments_update_internal on public.payments for update to authenticated using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists treatments_insert_internal on public.treatments;
drop policy if exists treatments_update_internal on public.treatments;
create policy treatments_insert_internal on public.treatments for insert to authenticated with check (public.is_internal_profile());
create policy treatments_update_internal on public.treatments for update to authenticated using (public.is_internal_profile()) with check (public.is_internal_profile());

drop policy if exists plans_insert_authorized on public.treatment_plans;
drop policy if exists plans_read_self_or_authorized on public.treatment_plans;
drop policy if exists plans_update_authorized on public.treatment_plans;
drop policy if exists plans_read_self_or_internal on public.treatment_plans;
drop policy if exists plans_insert_internal on public.treatment_plans;
drop policy if exists plans_update_internal on public.treatment_plans;
create policy plans_read_self_or_internal
on public.treatment_plans for select to authenticated
using (public.is_internal_profile() or exists (
  select 1 from public.patients p
  where p.id = treatment_plans.patient_id and p.auth_user_id = auth.uid()
));
create policy plans_insert_internal on public.treatment_plans for insert to authenticated with check (public.is_internal_profile());
create policy plans_update_internal on public.treatment_plans for update to authenticated using (public.is_internal_profile()) with check (public.is_internal_profile());

-- Staff directory is internal-only; management controls mutations.
drop policy if exists staff_read_internal on public.staff;
drop policy if exists staff_insert_management on public.staff;
drop policy if exists staff_update_management on public.staff;
create policy staff_read_internal on public.staff for select to authenticated using (public.is_internal_profile());
create policy staff_insert_management on public.staff for insert to authenticated with check (public.is_management_role());
create policy staff_update_management on public.staff for update to authenticated using (public.is_management_role()) with check (public.is_management_role());

-- Notifications are limited to the addressed authenticated account or internal users.
drop policy if exists notifications_read_own_or_internal on public.notifications;
drop policy if exists notifications_insert_internal on public.notifications;
drop policy if exists notifications_update_own_or_internal on public.notifications;
create policy notifications_read_own_or_internal
on public.notifications for select to authenticated
using (public.is_internal_profile() or lower(coalesce(user_email,'')) = lower(coalesce(auth.jwt() ->> 'email','')));
create policy notifications_insert_internal on public.notifications for insert to authenticated with check (public.is_internal_profile());
create policy notifications_update_own_or_internal
on public.notifications for update to authenticated
using (public.is_internal_profile() or lower(coalesce(user_email,'')) = lower(coalesce(auth.jwt() ->> 'email','')))
with check (public.is_internal_profile() or lower(coalesce(user_email,'')) = lower(coalesce(auth.jwt() ->> 'email','')));

-- Public services expose only explicitly publishable catalog rows.
drop policy if exists services_public_catalog_read on public.services;
drop policy if exists services_authenticated_read on public.services;
drop policy if exists services_insert_internal on public.services;
drop policy if exists services_update_internal on public.services;
create policy services_public_catalog_read on public.services for select to anon using (status='active' and online_bookable and not internal_only and show_on_website);
create policy services_authenticated_read on public.services for select to authenticated using (public.is_internal_profile() or (status='active' and online_bookable and not internal_only and show_on_website));
create policy services_insert_internal on public.services for insert to authenticated with check (public.is_internal_profile());
create policy services_update_internal on public.services for update to authenticated using (public.is_internal_profile()) with check (public.is_internal_profile());

-- Payment webhook RPC is backend-only. The deployed Edge Function uses service_role
-- only after HMAC verification.
revoke execute on function public.apply_verified_gateway_payment(text,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.apply_verified_gateway_payment(text,text,text,text,integer,text) to service_role;

-- Trigger/internal functions are not REST RPC endpoints.
revoke execute on function public.handle_new_auth_profile() from public, anon, authenticated;
revoke execute on function public.handle_new_patient_auth_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Inventory mutation keeps row locking/negative-stock protection but now requires
-- an authenticated active internal profile and records auth.uid() as actor.
create or replace function public.post_stock_movement(
  p_branch_id text,
  p_inventory_item_id text,
  p_movement_type text,
  p_quantity numeric,
  p_reason text,
  p_performed_by text,
  p_reference_type text default ''::text,
  p_reference_id text default ''::text,
  p_batch_id text default null::text,
  p_unit_cost_cents integer default 0
) returns public.stock_movements
language plpgsql security definer set search_path = public
as $$
declare
  v_stock public.branch_inventory;
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_decrease boolean;
  v_movement public.stock_movements;
  v_actor text;
begin
  if auth.uid() is null or not public.is_internal_profile() then raise exception 'Not authorized to post stock movements.'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_movement_type not in ('opening_balance','purchase_receipt','manual_stock_in','consumption','manual_stock_out','transfer_out','transfer_in','adjustment_increase','adjustment_decrease','expired','damaged','return_to_supplier','void','reversal') then raise exception 'Invalid stock movement type'; end if;
  v_actor := auth.uid()::text;

  insert into public.branch_inventory (id, branch_id, inventory_item_id, quantity_on_hand, reorder_level)
  values (gen_random_uuid()::text, p_branch_id, p_inventory_item_id, 0,
    coalesce((select default_reorder_level from public.inventory_items where id=p_inventory_item_id),0))
  on conflict (branch_id, inventory_item_id) do nothing;

  select * into v_stock from public.branch_inventory
  where branch_id=p_branch_id and inventory_item_id=p_inventory_item_id for update;
  if not found then raise exception 'Branch inventory row could not be resolved.'; end if;
  v_before := v_stock.quantity_on_hand;
  v_decrease := p_movement_type in ('consumption','manual_stock_out','transfer_out','adjustment_decrease','expired','damaged','return_to_supplier');
  v_after := case when v_decrease then v_before-p_quantity else v_before+p_quantity end;
  if v_after < 0 then raise exception 'Stock operation would create negative stock'; end if;

  update public.branch_inventory
  set quantity_on_hand=v_after,
      average_unit_cost_cents=case when p_unit_cost_cents>0 and not v_decrease and v_after>0
        then round(((average_unit_cost_cents*v_before)+(p_unit_cost_cents*p_quantity))/v_after)
        else average_unit_cost_cents end,
      updated_at=now()
  where id=v_stock.id;

  insert into public.stock_movements (
    id,branch_id,inventory_item_id,batch_id,movement_type,quantity,quantity_before,quantity_after,
    reference_type,reference_id,reason,performed_by,unit_cost_cents,total_cost_cents
  ) values (
    gen_random_uuid()::text,p_branch_id,p_inventory_item_id,nullif(p_batch_id,''),p_movement_type,p_quantity,
    v_before,v_after,p_reference_type,p_reference_id,p_reason,v_actor,coalesce(p_unit_cost_cents,0),coalesce(p_unit_cost_cents,0)*p_quantity
  ) returning * into v_movement;
  return v_movement;
end;
$$;
revoke execute on function public.post_stock_movement(text,text,text,numeric,text,text,text,text,text,integer) from public, anon;
grant execute on function public.post_stock_movement(text,text,text,numeric,text,text,text,text,text,integer) to authenticated;

-- Expense payment mutation is now internal-only and records the authenticated actor.
create or replace function public.record_expense_payment(
  p_expense_id text,
  p_amount_cents integer,
  p_payment_date date,
  p_payment_method text,
  p_reference_number text,
  p_paid_by text,
  p_notes text default ''::text
) returns public.expenses
language plpgsql security definer set search_path = public
as $$
declare
  v_expense public.expenses;
  v_new_paid integer;
  v_new_balance integer;
  v_actor text;
begin
  if auth.uid() is null or not public.is_internal_profile() then raise exception 'Not authorized to record expense payments.'; end if;
  if p_amount_cents <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  v_actor := auth.uid()::text;
  select * into v_expense from public.expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if v_expense.status in ('void','cancelled') then raise exception 'Cannot pay void or cancelled expense'; end if;
  if p_amount_cents > v_expense.balance_cents then raise exception 'Expense payment exceeds outstanding balance'; end if;
  insert into public.expense_payments (id,expense_id,amount_cents,payment_date,payment_method,reference_number,paid_by,notes)
  values (gen_random_uuid()::text,p_expense_id,p_amount_cents,p_payment_date,p_payment_method,coalesce(p_reference_number,''),v_actor,coalesce(p_notes,''));
  v_new_paid := v_expense.amount_paid_cents+p_amount_cents;
  v_new_balance := greatest(v_expense.total_cents-v_new_paid,0);
  update public.expenses set amount_paid_cents=v_new_paid,balance_cents=v_new_balance,payment_method=p_payment_method,
    reference_number=coalesce(p_reference_number,reference_number),status=case when v_new_balance=0 then 'paid' else 'partially_paid' end,
    updated_at=now() where id=p_expense_id returning * into v_expense;
  return v_expense;
end;
$$;
revoke execute on function public.record_expense_payment(text,integer,date,text,text,text,text) from public, anon;
grant execute on function public.record_expense_payment(text,integer,date,text,text,text,text) to authenticated;

-- Remove anon execution from sensitive SECURITY DEFINER helpers while keeping
-- authenticated access for routines whose own bodies enforce auth.uid()/permissions.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'archive_form_template','assign_patient_form','can_administer_forms','can_assign_forms',
      'can_manage_patient_intake','can_manage_patient_recall','can_manage_report_automation','can_manage_treatment_plan',
      'can_view_form_content','can_view_management_report_scope','can_view_patient_intake','can_view_patient_recall','can_view_treatment_plan',
      'complete_patient_recall','create_clinical_follow_up_recall','create_form_template_draft','create_form_version_draft',
      'create_management_report_schedule','current_profile_role','current_user_owns_patient','generate_expense_from_purchase_receipt',
      'has_any_profile_permission','has_profile_permission','is_internal_profile','is_management_role','link_recall_appointment',
      'mark_management_report_run_failed','mark_management_report_run_generated','profile_has_active_branch','publish_form_version',
      'queue_management_report_run','record_management_report_delivery','record_recall_contact','respond_to_treatment_plan',
      'set_management_report_schedule_enabled','submit_patient_form_v2','update_management_report_delivery_state'
    )
  loop execute format('revoke execute on function %s from public, anon',r.signature); end loop;
end $$;

-- Make financial summary respect caller RLS.
alter view if exists public.v_branch_financial_summary set (security_invoker=true);

-- Pin mutable search_path warnings reported by Supabase advisor.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'set_updated_at','validate_appointment_status_transition','set_appointment_number','appointment_time_range',
      'next_invoice_number','next_payment_number','next_receipt_number','next_inventory_item_code','next_purchase_order_number',
      'next_expense_number','get_enterprise_financial_summary','prevent_last_super_admin_deactivation','is_clinic_closed',
      'ensure_unique_operating_number','ensure_unique_expense_number','ensure_unique_expense_vendor_number',
      'normalize_communication_patient_reference','assign_unique_expense_number'
    )
  loop execute format('alter function %s set search_path=public',r.signature); end loop;
end $$;

-- Remove cascade deletion from clinical/financial history.
alter table public.appointments drop constraint if exists appointments_patient_id_fkey;
alter table public.appointments add constraint appointments_patient_id_fkey foreign key(patient_id) references public.patients(id) on delete restrict;
alter table public.dental_records drop constraint if exists dental_records_patient_id_fkey;
alter table public.dental_records add constraint dental_records_patient_id_fkey foreign key(patient_id) references public.patients(id) on delete restrict;
alter table public.documents drop constraint if exists documents_patient_id_fkey;
alter table public.documents add constraint documents_patient_id_fkey foreign key(patient_id) references public.patients(id) on delete restrict;
alter table public.invoices drop constraint if exists invoices_patient_id_fkey;
alter table public.invoices add constraint invoices_patient_id_fkey foreign key(patient_id) references public.patients(id) on delete restrict;
alter table public.payments drop constraint if exists payments_patient_id_fkey;
alter table public.payments add constraint payments_patient_id_fkey foreign key(patient_id) references public.patients(id) on delete restrict;
alter table public.payments drop constraint if exists payments_invoice_id_fkey;
alter table public.payments add constraint payments_invoice_id_fkey foreign key(invoice_id) references public.invoices(id) on delete restrict;
alter table public.treatment_plans drop constraint if exists treatment_plans_patient_id_fkey;
alter table public.treatment_plans add constraint treatment_plans_patient_id_fkey foreign key(patient_id) references public.patients(id) on delete restrict;
alter table public.treatments drop constraint if exists treatments_patient_id_fkey;
alter table public.treatments add constraint treatments_patient_id_fkey foreign key(patient_id) references public.patients(id) on delete restrict;
alter table public.communication_delivery_logs drop constraint if exists communication_delivery_logs_patient_id_fkey;
alter table public.communication_delivery_logs add constraint communication_delivery_logs_patient_id_fkey foreign key(patient_id) references public.patients(patient_id) on delete restrict;
alter table public.communication_preferences drop constraint if exists communication_preferences_patient_id_fkey;
alter table public.communication_preferences add constraint communication_preferences_patient_id_fkey foreign key(patient_id) references public.patients(patient_id) on delete restrict;
alter table public.patient_recalls drop constraint if exists patient_recalls_patient_id_fkey;
alter table public.patient_recalls add constraint patient_recalls_patient_id_fkey foreign key(patient_id) references public.patients(patient_id) on delete restrict;
alter table public.recall_contact_attempts drop constraint if exists recall_contact_attempts_patient_id_fkey;
alter table public.recall_contact_attempts add constraint recall_contact_attempts_patient_id_fkey foreign key(patient_id) references public.patients(patient_id) on delete restrict;

alter table public.patients add column if not exists archived_at timestamptz;

-- Intentionally no DELETE policies for patients, appointments, dental records,
-- invoices, payments, treatments, treatment plans, or documents.