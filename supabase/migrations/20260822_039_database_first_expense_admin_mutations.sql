create or replace function public.create_expense_vendor(
  p_name text,
  p_contact_person text default '',
  p_phone text default '',
  p_email text default '',
  p_address text default '',
  p_notes text default ''
) returns public.expense_vendors
language plpgsql security definer set search_path=public as $$
declare v_row public.expense_vendors;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('expenses.create') then raise exception 'Not authorized to create expense vendors.'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'Vendor name is required.'; end if;
  insert into public.expense_vendors(id,vendor_number,name,contact_person,phone,email,address,notes,status,created_at,updated_at)
  values(gen_random_uuid()::text,'',btrim(p_name),coalesce(p_contact_person,''),coalesce(p_phone,''),lower(coalesce(p_email,'')),coalesce(p_address,''),coalesce(p_notes,''),'active',now(),now())
  returning * into v_row;
  return v_row;
end;$$;

create or replace function public.create_expense_recurring_template(
  p_name text,p_scope text,p_branch_id text,p_category_id text,p_vendor_id text,p_payee_name text,
  p_frequency text,p_default_amount_cents integer,p_next_due_date date,p_auto_create boolean
) returns public.expense_recurring_templates
language plpgsql security definer set search_path=public as $$
declare v_row public.expense_recurring_templates; v_actor text;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('expenses.manage_recurring') then raise exception 'Not authorized to manage recurring expenses.'; end if;
  if nullif(btrim(p_name),'') is null or nullif(btrim(p_payee_name),'') is null then raise exception 'Template name and payee are required.'; end if;
  if p_scope not in ('branch','clinic_wide') then raise exception 'Invalid expense scope.'; end if;
  if p_scope='branch' and (p_branch_id is null or not public.profile_has_active_branch(p_branch_id)) then raise exception 'Not authorized for this recurring expense branch.'; end if;
  if p_frequency not in ('monthly','quarterly','yearly','custom') then raise exception 'Invalid recurrence frequency.'; end if;
  if p_default_amount_cents is not null and p_default_amount_cents < 0 then raise exception 'Default amount cannot be negative.'; end if;
  v_actor:=auth.uid()::text;
  insert into public.expense_recurring_templates(id,name,scope,branch_id,category_id,vendor_id,payee_name,frequency,default_amount_cents,next_due_date,auto_create,status,created_by,created_at,updated_at)
  values(gen_random_uuid()::text,btrim(p_name),p_scope,case when p_scope='branch' then p_branch_id else null end,p_category_id,nullif(p_vendor_id,''),btrim(p_payee_name),p_frequency,p_default_amount_cents,p_next_due_date,coalesce(p_auto_create,false),'active',v_actor,now(),now())
  returning * into v_row;
  return v_row;
end;$$;

create or replace function public.revise_expense_record(
  p_expense_id text,p_scope text,p_branch_id text,p_category_id text,p_vendor_id text,p_payee_name text,p_description text,
  p_expense_date date,p_due_date date,p_subtotal_cents integer,p_tax_cents integer,p_reference_number text,p_notes text
) returns public.expenses
language plpgsql security definer set search_path=public as $$
declare v_row public.expenses; v_total integer;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('expenses.edit') then raise exception 'Not authorized to edit expenses.'; end if;
  select * into v_row from public.expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense not found.'; end if;
  if v_row.source_type<>'manual' then raise exception 'Generated expenses must be corrected at their source.'; end if;
  if v_row.status in ('void','cancelled') then raise exception 'Void or cancelled expenses cannot be edited.'; end if;
  if exists(select 1 from public.expense_payments where expense_id=p_expense_id) then raise exception 'Expenses with payments cannot be edited directly.'; end if;
  if p_scope not in ('branch','clinic_wide') then raise exception 'Invalid expense scope.'; end if;
  if p_scope='branch' and (p_branch_id is null or not public.profile_has_active_branch(p_branch_id)) then raise exception 'Not authorized for this expense branch.'; end if;
  if p_subtotal_cents<0 or p_tax_cents<0 then raise exception 'Expense amounts cannot be negative.'; end if;
  v_total:=p_subtotal_cents+p_tax_cents;
  update public.expenses set
    scope=p_scope, branch_id=case when p_scope='branch' then p_branch_id else null end, category_id=p_category_id,
    vendor_id=nullif(p_vendor_id,''), payee_name=btrim(p_payee_name), description=btrim(p_description), expense_date=p_expense_date,
    due_date=p_due_date, subtotal_cents=p_subtotal_cents, tax_cents=p_tax_cents, total_cents=v_total,
    balance_cents=v_total, status=case when status='draft' then 'draft' else 'unpaid' end,
    reference_number=coalesce(p_reference_number,''), notes=coalesce(p_notes,''), updated_at=now()
  where id=p_expense_id returning * into v_row;
  return v_row;
end;$$;

create or replace function public.void_expense_record(p_expense_id text,p_reason text)
returns public.expenses
language plpgsql security definer set search_path=public as $$
declare v_row public.expenses; v_actor text;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('expenses.void') then raise exception 'Not authorized to void expenses.'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A void reason is required.'; end if;
  select * into v_row from public.expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense not found.'; end if;
  if v_row.status='void' then return v_row; end if;
  if exists(select 1 from public.expense_payments where expense_id=p_expense_id) then raise exception 'Expenses with recorded payments cannot be voided without a reversal workflow.'; end if;
  if v_row.branch_id is not null and not public.profile_has_active_branch(v_row.branch_id) then raise exception 'Not authorized for this expense branch.'; end if;
  v_actor:=auth.uid()::text;
  update public.expenses set status='void',balance_cents=0,void_reason=btrim(p_reason),voided_by=v_actor,voided_at=now(),updated_at=now() where id=p_expense_id returning * into v_row;
  return v_row;
end;$$;

revoke all on function public.create_expense_vendor(text,text,text,text,text,text) from public,anon;
grant execute on function public.create_expense_vendor(text,text,text,text,text,text) to authenticated,service_role;
revoke all on function public.create_expense_recurring_template(text,text,text,text,text,text,text,integer,date,boolean) from public,anon;
grant execute on function public.create_expense_recurring_template(text,text,text,text,text,text,text,integer,date,boolean) to authenticated,service_role;
revoke all on function public.revise_expense_record(text,text,text,text,text,text,text,date,date,integer,integer,text,text) from public,anon;
grant execute on function public.revise_expense_record(text,text,text,text,text,text,text,date,date,integer,integer,text,text) to authenticated,service_role;
revoke all on function public.void_expense_record(text,text) from public,anon;
grant execute on function public.void_expense_record(text,text) to authenticated,service_role;
