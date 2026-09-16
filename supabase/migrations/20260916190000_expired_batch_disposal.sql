create or replace function public.dispose_expired_inventory_batch(
  p_batch_id text,
  p_quantity numeric,
  p_reason text default '',
  p_client_request_id uuid default gen_random_uuid()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.inventory_batches;
  v_stock public.branch_inventory;
  v_existing public.stock_movements;
  v_movement public.stock_movements;
  v_actor text;
  v_before numeric;
  v_after numeric;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('inventory.adjust') then
    raise exception 'Not authorized to remove expired inventory.';
  end if;
  if p_client_request_id is null then raise exception 'Client request ID is required.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text, 0));

  select * into v_existing
  from public.stock_movements
  where reference_type = 'expired_batch_disposal'
    and reference_id = p_client_request_id::text
  order by created_at desc
  limit 1;

  if found then
    select * into v_batch from public.inventory_batches where id = v_existing.batch_id;
    select * into v_stock from public.branch_inventory
      where branch_id = v_existing.branch_id and inventory_item_id = v_existing.inventory_item_id;
    return jsonb_build_object('movement', to_jsonb(v_existing), 'batch', to_jsonb(v_batch), 'stock', to_jsonb(v_stock), 'duplicate_reused', true);
  end if;

  select * into v_batch from public.inventory_batches where id = p_batch_id for update;
  if not found then raise exception 'Inventory batch not found.'; end if;
  if not public.profile_has_active_branch(v_batch.branch_id) then raise exception 'Not authorized for this inventory branch.'; end if;
  if v_batch.expiry_date is null then raise exception 'This batch has no expiry date.'; end if;
  if v_batch.expiry_date > current_date then raise exception 'This batch is not expired yet.'; end if;
  if p_quantity > v_batch.quantity_on_hand then raise exception 'Quantity exceeds the remaining batch quantity.'; end if;

  select * into v_stock
  from public.branch_inventory
  where branch_id = v_batch.branch_id and inventory_item_id = v_batch.inventory_item_id
  for update;
  if not found then raise exception 'Branch inventory position not found.'; end if;
  if p_quantity > v_stock.quantity_on_hand then raise exception 'Quantity exceeds the authoritative branch stock.'; end if;

  v_before := v_stock.quantity_on_hand;
  v_after := v_before - p_quantity;
  v_actor := auth.uid()::text;

  update public.inventory_batches
  set quantity_on_hand = quantity_on_hand - p_quantity,
      updated_at = now()
  where id = v_batch.id
  returning * into v_batch;

  update public.branch_inventory
  set quantity_on_hand = v_after,
      updated_at = now()
  where id = v_stock.id
  returning * into v_stock;

  insert into public.stock_movements(
    id, branch_id, inventory_item_id, batch_id, movement_type, quantity,
    quantity_before, quantity_after, reference_type, reference_id, reason,
    performed_by, unit_cost_cents, total_cost_cents, created_at
  ) values (
    gen_random_uuid()::text, v_batch.branch_id, v_batch.inventory_item_id, v_batch.id,
    'expired', p_quantity, v_before, v_after, 'expired_batch_disposal',
    p_client_request_id::text,
    coalesce(nullif(btrim(p_reason), ''), 'Expired batch removed from usable inventory'),
    v_actor, v_batch.unit_cost_cents, round(v_batch.unit_cost_cents * p_quantity)::integer, now()
  ) returning * into v_movement;

  insert into public.audit_logs(id, user_name, action, entity, entity_id, metadata, created_at)
  values (
    gen_random_uuid(), v_actor, 'stock_movement_posted', 'inventory_batch', v_batch.id,
    jsonb_build_object(
      'movementType', 'expired',
      'quantity', p_quantity,
      'branchId', v_batch.branch_id,
      'inventoryItemId', v_batch.inventory_item_id,
      'clientRequestId', p_client_request_id
    ),
    now()
  );

  return jsonb_build_object('movement', to_jsonb(v_movement), 'batch', to_jsonb(v_batch), 'stock', to_jsonb(v_stock), 'duplicate_reused', false);
end;
$$;

revoke all on function public.dispose_expired_inventory_batch(text,numeric,text,uuid) from public, anon;
grant execute on function public.dispose_expired_inventory_batch(text,numeric,text,uuid) to authenticated, service_role;
