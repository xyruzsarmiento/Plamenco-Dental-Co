-- Restrict expense-payment recording to authorized internal users and branch scope.
-- Keep row locking/overpayment protection and derive paid_by from auth.uid().

create or replace function public.record_expense_payment(
  p_expense_id text,
  p_amount_cents integer,
  p_payment_date date,
  p_payment_method text,
  p_reference_number text,
  p_paid_by text,
  p_notes text default ''::text
)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses;
  v_new_paid integer;
  v_new_balance integer;
  v_actor text;
begin
  if auth.uid() is null or not public.is_internal_profile() then
    raise exception 'Not authorized to record expense payments.';
  end if;
  if not public.has_profile_permission('expenses.create') then
    raise exception 'Missing permission to record expense payments.';
  end if;
  if p_amount_cents <= 0 then raise exception 'Payment amount must be greater than zero'; end if;

  v_actor := auth.uid()::text;
  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if v_expense.branch_id is not null and not public.profile_has_active_branch(v_expense.branch_id::text) then
    raise exception 'Not authorized for this expense branch.';
  end if;
  if v_expense.status in ('void','cancelled') then raise exception 'Cannot pay void or cancelled expense'; end if;
  if p_amount_cents > v_expense.balance_cents then raise exception 'Expense payment exceeds outstanding balance'; end if;

  insert into public.expense_payments (id, expense_id, amount_cents, payment_date, payment_method, reference_number, paid_by, notes)
  values (gen_random_uuid()::text, p_expense_id, p_amount_cents, p_payment_date, p_payment_method, coalesce(p_reference_number,''), v_actor, coalesce(p_notes,''));

  v_new_paid := v_expense.amount_paid_cents + p_amount_cents;
  v_new_balance := greatest(v_expense.total_cents - v_new_paid, 0);

  update public.expenses
  set amount_paid_cents = v_new_paid,
      balance_cents = v_new_balance,
      payment_method = p_payment_method,
      reference_number = coalesce(nullif(trim(p_reference_number),''), reference_number),
      status = case when v_new_balance = 0 then 'paid' else 'partially_paid' end,
      updated_at = now()
  where id = p_expense_id
  returning * into v_expense;

  return v_expense;
end;
$$;

revoke execute on function public.record_expense_payment(text,integer,date,text,text,text,text) from public, anon;
grant execute on function public.record_expense_payment(text,integer,date,text,text,text,text) to authenticated, service_role;
