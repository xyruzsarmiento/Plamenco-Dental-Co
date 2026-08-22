create or replace function public.create_expense_record(
  p_scope text,
  p_branch_id text,
  p_category_id text,
  p_vendor_id text,
  p_payee_name text,
  p_description text,
  p_expense_date date,
  p_due_date date,
  p_subtotal_cents integer,
  p_tax_cents integer,
  p_reference_number text default '',
  p_notes text default '',
  p_source_type text default 'manual',
  p_source_id text default null,
  p_recurring_template_id text default null
)
returns public.expenses
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid();
  v_actor text;
  v_row public.expenses;
  v_total integer;
begin
  if v_uid is null or not public.is_internal_profile() or not public.has_profile_permission('expenses.create') then raise exception 'Not authorized to create expenses' using errcode='42501'; end if;
  if p_scope not in ('branch','clinic_wide') then raise exception 'Invalid expense scope'; end if;
  if p_scope='branch' then
    if nullif(trim(coalesce(p_branch_id,'')),'') is null or not public.profile_has_active_branch(p_branch_id) then raise exception 'Not authorized for this expense branch' using errcode='42501'; end if;
  end if;
  if btrim(coalesce(p_category_id,''))='' or btrim(coalesce(p_payee_name,''))='' or btrim(coalesce(p_description,''))='' then raise exception 'Category, payee, and description are required'; end if;
  if p_subtotal_cents<0 or p_tax_cents<0 then raise exception 'Expense amounts cannot be negative'; end if;
  v_total:=p_subtotal_cents+p_tax_cents;
  select coalesce(nullif(full_name,''),email,v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';
  if p_source_type <> 'manual' and nullif(trim(coalesce(p_source_id,'')),'') is not null then
    select * into v_row from public.expenses where source_type=p_source_type and source_id=p_source_id and status<>'void' limit 1;
    if found then return v_row; end if;
  end if;
  insert into public.expenses(id,expense_number,scope,branch_id,category_id,vendor_id,payee_name,description,expense_date,due_date,subtotal_cents,tax_cents,total_cents,amount_paid_cents,balance_cents,status,reference_number,source_type,source_id,notes,recurring_template_id,created_by)
  values(gen_random_uuid()::text,'',p_scope,case when p_scope='branch' then p_branch_id else null end,p_category_id,nullif(trim(coalesce(p_vendor_id,'')),''),btrim(p_payee_name),btrim(p_description),p_expense_date,p_due_date,p_subtotal_cents,p_tax_cents,v_total,0,v_total,'unpaid',btrim(coalesce(p_reference_number,'')),p_source_type,nullif(trim(coalesce(p_source_id,'')),''),btrim(coalesce(p_notes,'')),nullif(trim(coalesce(p_recurring_template_id,'')),''),v_actor)
  returning * into v_row;
  insert into public.audit_logs(user_name,action,entity,entity_id,metadata) values(v_actor,'expense_created','expense',v_row.id,jsonb_build_object('expenseNumber',v_row.expense_number,'totalCents',v_row.total_cents,'branchId',v_row.branch_id));
  return v_row;
end;$$;

create or replace function public.record_petty_cash_disbursement(
  p_branch_id text,
  p_amount_cents integer,
  p_payment_date date,
  p_payee_name text,
  p_description text,
  p_notes text default '',
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid:=auth.uid(); v_actor text; v_exp public.expenses; v_payment public.expense_payments;
begin
  if v_uid is null or not public.is_internal_profile() or not public.has_profile_permission('expenses.create') or not public.has_profile_permission('expenses.record_payment') then raise exception 'Not authorized for petty cash' using errcode='42501'; end if;
  if not public.profile_has_active_branch(p_branch_id) then raise exception 'Not authorized for this branch' using errcode='42501'; end if;
  if p_amount_cents<=0 then raise exception 'Petty cash amount must be greater than zero'; end if;
  if btrim(coalesce(p_payee_name,''))='' or btrim(coalesce(p_description,''))='' then raise exception 'Payee and purpose are required'; end if;
  if p_client_request_id is not null then
    select ep.* into v_payment from public.expense_payments ep where ep.client_request_id=p_client_request_id;
    if found then select * into v_exp from public.expenses where id=v_payment.expense_id; return jsonb_build_object('expense',to_jsonb(v_exp),'payment',to_jsonb(v_payment),'duplicate',true); end if;
  end if;
  select coalesce(nullif(full_name,''),email,v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';
  insert into public.expenses(id,expense_number,scope,branch_id,category_id,payee_name,description,expense_date,due_date,subtotal_cents,tax_cents,total_cents,amount_paid_cents,balance_cents,status,payment_method,reference_number,source_type,notes,created_by)
  values(gen_random_uuid()::text,'','branch',p_branch_id,'petty_cash',btrim(p_payee_name),btrim(p_description),p_payment_date,p_payment_date,p_amount_cents,0,p_amount_cents,p_amount_cents,0,'paid','cash','', 'manual',btrim(coalesce(p_notes,'')),v_actor) returning * into v_exp;
  insert into public.expense_payments(id,expense_id,amount_cents,payment_date,payment_method,reference_number,paid_by,notes,client_request_id)
  values(gen_random_uuid()::text,v_exp.id,p_amount_cents,p_payment_date,'cash','Petty cash '||v_exp.expense_number,v_actor,btrim(coalesce(p_notes,'')),p_client_request_id) returning * into v_payment;
  insert into public.audit_logs(user_name,action,entity,entity_id,metadata) values(v_actor,'petty_cash_disbursed','expense',v_exp.id,jsonb_build_object('expenseNumber',v_exp.expense_number,'amountCents',p_amount_cents,'branchId',p_branch_id));
  return jsonb_build_object('expense',to_jsonb(v_exp),'payment',to_jsonb(v_payment),'duplicate',false);
exception when unique_violation then
  if p_client_request_id is not null then
    select ep.* into v_payment from public.expense_payments ep where ep.client_request_id=p_client_request_id;
    if found then select * into v_exp from public.expenses where id=v_payment.expense_id; return jsonb_build_object('expense',to_jsonb(v_exp),'payment',to_jsonb(v_payment),'duplicate',true); end if;
  end if;
  raise;
end;$$;

revoke all on function public.create_expense_record(text,text,text,text,text,text,date,date,integer,integer,text,text,text,text,text) from public,anon;
grant execute on function public.create_expense_record(text,text,text,text,text,text,date,date,integer,integer,text,text,text,text,text) to authenticated,service_role;
revoke all on function public.record_petty_cash_disbursement(text,integer,date,text,text,text,uuid) from public,anon;
grant execute on function public.record_petty_cash_disbursement(text,integer,date,text,text,text,uuid) to authenticated,service_role;
