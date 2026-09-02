-- Part 3: keep expense payment history immutable while allowing safe descriptive
-- ledger cleanups. Financial amount corrections remain available only before an
-- expense has recorded payments; voiding requires a reason and preserves rows.

create or replace function public.revise_expense_record(
  p_expense_id text,p_scope text,p_branch_id text,p_category_id text,p_vendor_id text,p_payee_name text,p_description text,
  p_expense_date date,p_due_date date,p_subtotal_cents integer,p_tax_cents integer,p_reference_number text,p_notes text
) returns public.expenses
language plpgsql security definer set search_path=public as $$
declare
  v_row public.expenses;
  v_total integer;
  v_has_payments boolean;
  v_actor text;
  v_amount_changed boolean;
  v_branch_changed boolean;
  v_reference_changed boolean;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('expenses.edit') then
    raise exception 'Not authorized to edit expenses.';
  end if;

  select * into v_row from public.expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense not found.'; end if;
  if v_row.status in ('void','cancelled') then raise exception 'Void or cancelled expenses cannot be edited.'; end if;
  if v_row.branch_id is not null and not public.profile_has_active_branch(v_row.branch_id) then
    raise exception 'Not authorized for this expense branch.';
  end if;

  v_has_payments := exists(select 1 from public.expense_payments where expense_id=p_expense_id);
  v_amount_changed := coalesce(p_subtotal_cents, -1) <> v_row.subtotal_cents or coalesce(p_tax_cents, -1) <> v_row.tax_cents;
  v_branch_changed := coalesce(p_scope,'') <> v_row.scope or coalesce(p_branch_id,'') <> coalesce(v_row.branch_id,'');
  v_reference_changed := coalesce(p_reference_number,'') <> coalesce(v_row.reference_number,'');

  if v_has_payments and (v_amount_changed or v_branch_changed or v_reference_changed) then
    raise exception 'This expense has payment history. Only descriptive fields can be edited; use void with a reason for financial corrections.';
  end if;

  if not v_has_payments then
    if p_scope not in ('branch','clinic_wide') then raise exception 'Invalid expense scope.'; end if;
    if p_scope='branch' and (p_branch_id is null or not public.profile_has_active_branch(p_branch_id)) then
      raise exception 'Not authorized for this expense branch.';
    end if;
    if p_subtotal_cents<0 or p_tax_cents<0 then raise exception 'Expense amounts cannot be negative.'; end if;
    v_total := p_subtotal_cents + p_tax_cents;
  else
    v_total := v_row.total_cents;
  end if;

  v_actor := auth.uid()::text;

  update public.expenses set
    scope = case when v_has_payments then v_row.scope else p_scope end,
    branch_id = case when v_has_payments then v_row.branch_id when p_scope='branch' then p_branch_id else null end,
    category_id = p_category_id,
    vendor_id = nullif(p_vendor_id,''),
    payee_name = btrim(p_payee_name),
    description = btrim(p_description),
    expense_date = p_expense_date,
    due_date = p_due_date,
    subtotal_cents = case when v_has_payments then v_row.subtotal_cents else p_subtotal_cents end,
    tax_cents = case when v_has_payments then v_row.tax_cents else p_tax_cents end,
    total_cents = v_total,
    balance_cents = case when v_has_payments then v_row.balance_cents else v_total end,
    status = case
      when v_has_payments then v_row.status
      when v_row.status='draft' then 'draft'
      else 'unpaid'
    end,
    reference_number = case when v_has_payments then v_row.reference_number else coalesce(p_reference_number,'') end,
    notes = coalesce(p_notes,''),
    updated_at = now()
  where id=p_expense_id returning * into v_row;

  insert into public.audit_logs(user_name,action,entity,entity_id,metadata)
  values(
    v_actor,
    case when v_amount_changed then 'expense_amount_corrected' else 'expense_descriptive_fields_updated' end,
    'expense',
    v_row.id,
    jsonb_build_object(
      'expenseNumber', v_row.expense_number,
      'hasPayments', v_has_payments,
      'amountChanged', v_amount_changed,
      'branchId', v_row.branch_id
    )
  );

  return v_row;
end;$$;

create or replace function public.void_expense_record(p_expense_id text,p_reason text)
returns public.expenses
language plpgsql security definer set search_path=public as $$
declare
  v_row public.expenses;
  v_actor text;
  v_payment_count integer;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('expenses.void') then
    raise exception 'Not authorized to void expenses.';
  end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'A void reason is required.'; end if;

  select * into v_row from public.expenses where id=p_expense_id for update;
  if not found then raise exception 'Expense not found.'; end if;
  if v_row.status='void' then return v_row; end if;
  if v_row.branch_id is not null and not public.profile_has_active_branch(v_row.branch_id) then
    raise exception 'Not authorized for this expense branch.';
  end if;

  select count(*) into v_payment_count from public.expense_payments where expense_id=p_expense_id;
  v_actor := auth.uid()::text;

  update public.expenses
  set status='void',
      balance_cents=0,
      void_reason=btrim(p_reason),
      voided_by=v_actor,
      voided_at=now(),
      updated_at=now()
  where id=p_expense_id
  returning * into v_row;

  insert into public.audit_logs(user_name,action,entity,entity_id,metadata)
  values(
    v_actor,
    'expense_voided',
    'expense',
    v_row.id,
    jsonb_build_object(
      'expenseNumber', v_row.expense_number,
      'reason', btrim(p_reason),
      'paymentCount', v_payment_count,
      'branchId', v_row.branch_id
    )
  );

  return v_row;
end;$$;

revoke all on function public.revise_expense_record(text,text,text,text,text,text,text,date,date,integer,integer,text,text) from public,anon;
grant execute on function public.revise_expense_record(text,text,text,text,text,text,text,date,date,integer,integer,text,text) to authenticated,service_role;
revoke all on function public.void_expense_record(text,text) from public,anon;
grant execute on function public.void_expense_record(text,text) to authenticated,service_role;
