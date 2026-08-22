-- Enforce movement-specific inventory permission and branch scope.
-- Keep the existing atomic row lock / negative-stock protection and derive
-- performed_by from auth.uid() rather than trusting the client parameter.

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
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock public.branch_inventory;
  v_before numeric(14,3);
  v_after numeric(14,3);
  v_decrease boolean;
  v_movement public.stock_movements;
  v_actor text;
  v_authorized boolean := false;
begin
  if auth.uid() is null or not public.is_internal_profile() then
    raise exception 'Not authorized to post stock movements.';
  end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_movement_type not in ('opening_balance','purchase_receipt','manual_stock_in','consumption','manual_stock_out','transfer_out','transfer_in','adjustment_increase','adjustment_decrease','expired','damaged','return_to_supplier','void','reversal') then
    raise exception 'Invalid stock movement type';
  end if;

  if p_movement_type in ('opening_balance','purchase_receipt','manual_stock_in','transfer_in') then
    v_authorized := public.has_any_profile_permission(array['inventory.stock_in','inventory.receive_transfer','purchases.receive','purchase_orders.receive']::text[]);
  elsif p_movement_type in ('consumption','manual_stock_out','expired','damaged','return_to_supplier') then
    v_authorized := public.has_profile_permission('inventory.stock_out');
  elsif p_movement_type = 'transfer_out' then
    v_authorized := public.has_profile_permission('inventory.transfer');
  elsif p_movement_type in ('adjustment_increase','adjustment_decrease','void','reversal') then
    v_authorized := public.has_profile_permission('inventory.adjust');
  end if;

  if not v_authorized then
    raise exception 'Missing permission for this stock movement type.';
  end if;

  if nullif(trim(coalesce(p_branch_id,'')), '') is null or not public.profile_has_active_branch(p_branch_id) then
    raise exception 'Not authorized for this inventory branch.';
  end if;

  v_actor := auth.uid()::text;

  insert into public.branch_inventory (id, branch_id, inventory_item_id, quantity_on_hand, reorder_level)
  values (gen_random_uuid()::text, p_branch_id, p_inventory_item_id, 0,
    coalesce((select default_reorder_level from public.inventory_items where id = p_inventory_item_id), 0))
  on conflict (branch_id, inventory_item_id) do nothing;

  select * into v_stock from public.branch_inventory
  where branch_id = p_branch_id and inventory_item_id = p_inventory_item_id for update;
  if not found then raise exception 'Branch inventory row could not be resolved.'; end if;

  v_before := v_stock.quantity_on_hand;
  v_decrease := p_movement_type in ('consumption','manual_stock_out','transfer_out','adjustment_decrease','expired','damaged','return_to_supplier');
  v_after := case when v_decrease then v_before - p_quantity else v_before + p_quantity end;
  if v_after < 0 then raise exception 'Stock operation would create negative stock'; end if;

  update public.branch_inventory
  set quantity_on_hand = v_after,
      average_unit_cost_cents = case
        when p_unit_cost_cents > 0 and not v_decrease and v_after > 0
        then round(((average_unit_cost_cents * v_before) + (p_unit_cost_cents * p_quantity)) / v_after)
        else average_unit_cost_cents end,
      updated_at = now()
  where id = v_stock.id;

  insert into public.stock_movements (
    id, branch_id, inventory_item_id, batch_id, movement_type, quantity,
    quantity_before, quantity_after, reference_type, reference_id, reason,
    performed_by, unit_cost_cents, total_cost_cents
  ) values (
    gen_random_uuid()::text, p_branch_id, p_inventory_item_id, nullif(p_batch_id,''),
    p_movement_type, p_quantity, v_before, v_after, p_reference_type, p_reference_id,
    p_reason, v_actor, coalesce(p_unit_cost_cents,0), coalesce(p_unit_cost_cents,0) * p_quantity
  ) returning * into v_movement;

  return v_movement;
end;
$$;

revoke execute on function public.post_stock_movement(text,text,text,numeric,text,text,text,text,text,integer) from public, anon;
grant execute on function public.post_stock_movement(text,text,text,numeric,text,text,text,text,text,integer) to authenticated, service_role;
