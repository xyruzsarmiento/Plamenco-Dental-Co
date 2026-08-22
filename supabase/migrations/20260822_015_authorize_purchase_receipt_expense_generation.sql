-- Harden SECURITY DEFINER purchase receipt -> expense generation.
-- Require a real internal profile, an appropriate permission, branch access,
-- and derive the actor from auth.uid() instead of trusting p_created_by.

create or replace function public.generate_expense_from_purchase_receipt(p_receipt_id text, p_created_by text)
returns public.expenses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_receipt public.purchase_receipts;
  v_supplier public.suppliers;
  v_expense public.expenses;
  v_actor text;
begin
  if auth.uid() is null or not public.is_internal_profile() then
    raise exception 'Not authorized to generate purchase receipt expenses.';
  end if;

  if not public.has_any_profile_permission(array[
    'purchases.receive',
    'purchase_orders.receive',
    'expenses.create',
    'inventory.stock_in'
  ]::text[]) then
    raise exception 'Missing permission to generate purchase receipt expenses.';
  end if;

  select * into v_receipt from public.purchase_receipts where id = p_receipt_id;
  if not found then
    raise exception 'Purchase receipt not found';
  end if;

  if v_receipt.branch_id is not null and not public.profile_has_active_branch(v_receipt.branch_id::text) then
    raise exception 'Not authorized for this branch.';
  end if;

  v_actor := auth.uid()::text;
  select * into v_supplier from public.suppliers where id = v_receipt.supplier_id;

  select * into v_expense
  from public.expenses
  where source_type = 'purchase_receipt' and source_id = p_receipt_id and status <> 'void'
  limit 1;

  if found then
    return v_expense;
  end if;

  insert into public.expenses (
    id, expense_number, scope, branch_id, category_id, payee_name, description,
    expense_date, due_date, subtotal_cents, tax_cents, total_cents,
    amount_paid_cents, balance_cents, status, source_type, source_id, notes, created_by
  )
  values (
    gen_random_uuid()::text,
    public.next_expense_number(),
    'branch',
    v_receipt.branch_id,
    'inventory_purchases',
    coalesce(v_supplier.name, 'Inventory supplier'),
    'Inventory purchase receipt ' || v_receipt.receipt_number,
    v_receipt.received_date,
    v_receipt.received_date,
    v_receipt.total_cost_cents,
    0,
    v_receipt.total_cost_cents,
    0,
    v_receipt.total_cost_cents,
    case when v_receipt.total_cost_cents = 0 then 'paid' else 'unpaid' end,
    'purchase_receipt',
    v_receipt.id,
    'Generated from inventory receiving. Do not manually duplicate.',
    v_actor
  )
  returning * into v_expense;

  return v_expense;
end;
$$;

revoke execute on function public.generate_expense_from_purchase_receipt(text,text) from public, anon;
grant execute on function public.generate_expense_from_purchase_receipt(text,text) to authenticated, service_role;
