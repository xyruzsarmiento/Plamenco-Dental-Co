alter table public.purchase_receipts add column if not exists client_request_id uuid;
create unique index if not exists purchase_receipts_client_request_id_uidx on public.purchase_receipts(client_request_id) where client_request_id is not null;

alter table public.stock_transfers add column if not exists create_request_id uuid;
alter table public.stock_transfers add column if not exists dispatch_request_id uuid;
alter table public.stock_transfers add column if not exists receive_request_id uuid;
create unique index if not exists stock_transfers_create_request_id_uidx on public.stock_transfers(create_request_id) where create_request_id is not null;
create unique index if not exists stock_transfers_dispatch_request_id_uidx on public.stock_transfers(dispatch_request_id) where dispatch_request_id is not null;
create unique index if not exists stock_transfers_receive_request_id_uidx on public.stock_transfers(receive_request_id) where receive_request_id is not null;

alter table public.stock_counts add column if not exists post_request_id uuid;
create unique index if not exists stock_counts_post_request_id_uidx on public.stock_counts(post_request_id) where post_request_id is not null;

create unique index if not exists inventory_batches_branch_item_batch_uidx
  on public.inventory_batches(branch_id, inventory_item_id, batch_number)
  where nullif(btrim(batch_number),'') is not null;

create or replace function public.receive_purchase_order(
  p_po_id text,
  p_received_date date,
  p_items jsonb,
  p_notes text default '',
  p_supplier_invoice_number text default '',
  p_supplier_invoice_date date default null,
  p_supplier_invoice_due_date date default null,
  p_supplier_invoice_amount_cents integer default 0,
  p_client_request_id uuid default gen_random_uuid()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.purchase_orders;
  v_existing public.purchase_receipts;
  v_receipt public.purchase_receipts;
  v_line jsonb;
  v_po_line jsonb;
  v_updated_items jsonb := '[]'::jsonb;
  v_item_id text;
  v_po_item_id text;
  v_qty numeric;
  v_remaining numeric;
  v_unit_cost integer;
  v_total integer := 0;
  v_stock public.branch_inventory;
  v_before numeric;
  v_after numeric;
  v_batch_id text;
  v_batch_number text;
  v_expiry date;
  v_track_batch boolean;
  v_track_expiry boolean;
  v_actor text;
  v_receipt_number text;
  v_all_received boolean;
begin
  if auth.uid() is null or not public.is_internal_profile() then
    raise exception 'Not authorized to receive purchase orders.';
  end if;
  if not public.has_any_profile_permission(array['purchases.receive','purchase_orders.receive','inventory.stock_in']) then
    raise exception 'Missing permission to receive purchase orders.';
  end if;
  if p_client_request_id is null then raise exception 'Client request ID is required.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one received item is required.';
  end if;
  if p_supplier_invoice_amount_cents < 0 then raise exception 'Supplier invoice amount cannot be negative.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text, 0));
  select * into v_existing from public.purchase_receipts where client_request_id = p_client_request_id;
  if found then
    select * into v_order from public.purchase_orders where id = v_existing.purchase_order_id;
    return jsonb_build_object('receipt', to_jsonb(v_existing), 'order', to_jsonb(v_order), 'duplicate_reused', true);
  end if;

  select * into v_order from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if v_order.status in ('cancelled','received') then raise exception 'Purchase order cannot be received in its current status.'; end if;
  if not public.profile_has_active_branch(v_order.branch_id) then raise exception 'Not authorized for this purchase-order branch.'; end if;

  v_actor := auth.uid()::text;

  for v_line in select value from jsonb_array_elements(p_items)
  loop
    v_po_item_id := nullif(btrim(v_line->>'poItemId'),'');
    v_qty := nullif(v_line->>'quantityReceived','')::numeric;
    if v_po_item_id is null or v_qty is null or v_qty <= 0 then raise exception 'Received item and quantity must be valid.'; end if;

    select value into v_po_line from jsonb_array_elements(v_order.items) where value->>'id' = v_po_item_id limit 1;
    if v_po_line is null then raise exception 'Purchase-order item not found.'; end if;
    v_item_id := v_po_line->>'itemId';
    v_remaining := coalesce((v_po_line->>'quantityOrdered')::numeric,0) - coalesce((v_po_line->>'quantityReceived')::numeric,0);
    if v_qty > v_remaining then raise exception 'Received quantity exceeds remaining purchase-order quantity.'; end if;
    v_unit_cost := coalesce(nullif(v_line->>'unitCostCents','')::integer, (v_po_line->>'unitCostCents')::integer, 0);
    if v_unit_cost < 0 then raise exception 'Unit cost cannot be negative.'; end if;

    select track_batches, track_expiry into v_track_batch, v_track_expiry from public.inventory_items where id = v_item_id and status = 'active';
    if not found then raise exception 'Inventory item not found or inactive.'; end if;

    insert into public.branch_inventory(id, branch_id, inventory_item_id, quantity_on_hand, reorder_level, location, average_unit_cost_cents, updated_at)
    values (gen_random_uuid()::text, v_order.branch_id, v_item_id, 0, 0, '', 0, now())
    on conflict (branch_id, inventory_item_id) do nothing;
    select * into v_stock from public.branch_inventory where branch_id = v_order.branch_id and inventory_item_id = v_item_id for update;
    v_before := v_stock.quantity_on_hand;
    v_after := v_before + v_qty;

    update public.branch_inventory
    set quantity_on_hand = v_after,
        average_unit_cost_cents = case when v_after > 0 then round(((v_stock.average_unit_cost_cents * v_before) + (v_unit_cost * v_qty)) / v_after)::integer else v_stock.average_unit_cost_cents end,
        updated_at = now()
    where id = v_stock.id;

    v_batch_id := null;
    if coalesce(v_track_batch,false) or coalesce(v_track_expiry,false) or nullif(btrim(v_line->>'batchNumber'),'') is not null or nullif(v_line->>'expiryDate','') is not null then
      v_batch_number := coalesce(nullif(btrim(v_line->>'batchNumber'),''), 'BATCH-' || substr(p_client_request_id::text,1,8) || '-' || substr(md5(v_po_item_id),1,6));
      v_expiry := nullif(v_line->>'expiryDate','')::date;
      insert into public.inventory_batches(id, branch_id, inventory_item_id, batch_number, quantity_on_hand, received_date, expiry_date, supplier_id, unit_cost_cents, source_type, source_id, created_at, updated_at)
      values (gen_random_uuid()::text, v_order.branch_id, v_item_id, v_batch_number, v_qty, p_received_date, v_expiry, v_order.supplier_id, v_unit_cost, 'purchase_receipt', p_client_request_id::text, now(), now())
      on conflict (branch_id, inventory_item_id, batch_number) where nullif(btrim(batch_number),'') is not null
      do update set quantity_on_hand = public.inventory_batches.quantity_on_hand + excluded.quantity_on_hand,
                    expiry_date = coalesce(excluded.expiry_date, public.inventory_batches.expiry_date),
                    unit_cost_cents = excluded.unit_cost_cents,
                    updated_at = now()
      returning id into v_batch_id;
    end if;

    insert into public.stock_movements(id, branch_id, inventory_item_id, batch_id, movement_type, quantity, quantity_before, quantity_after, reference_type, reference_id, reason, performed_by, unit_cost_cents, total_cost_cents, created_at)
    values (gen_random_uuid()::text, v_order.branch_id, v_item_id, v_batch_id, 'purchase_receipt', v_qty, v_before, v_after, 'purchase_receipt', p_client_request_id::text, 'Purchase order ' || v_order.po_number || ' received', v_actor, v_unit_cost, round(v_unit_cost * v_qty)::integer, now());

    v_total := v_total + round(v_unit_cost * v_qty)::integer;
  end loop;

  select coalesce(jsonb_agg(
    case when exists (select 1 from jsonb_array_elements(p_items) r where r->>'poItemId' = po.value->>'id') then
      jsonb_set(po.value, '{quantityReceived}', to_jsonb(coalesce((po.value->>'quantityReceived')::numeric,0) + coalesce((select (r->>'quantityReceived')::numeric from jsonb_array_elements(p_items) r where r->>'poItemId'=po.value->>'id' limit 1),0)))
    else po.value end
  ), '[]'::jsonb)
  into v_updated_items
  from jsonb_array_elements(v_order.items) po(value);

  select bool_and(coalesce((x->>'quantityReceived')::numeric,0) >= coalesce((x->>'quantityOrdered')::numeric,0))
  into v_all_received from jsonb_array_elements(v_updated_items) x;

  update public.purchase_orders
  set items = v_updated_items,
      status = case when v_all_received then 'received' else 'partially_received' end,
      updated_at = now()
  where id = v_order.id returning * into v_order;

  perform pg_advisory_xact_lock(91024031);
  select 'POR-' || lpad((coalesce(max((regexp_match(receipt_number, '^POR-([0-9]+)$'))[1]::bigint),0)+1)::text,6,'0')
  into v_receipt_number from public.purchase_receipts where receipt_number ~ '^POR-[0-9]+$';

  insert into public.purchase_receipts(id, receipt_number, purchase_order_id, supplier_id, branch_id, received_date, received_by, notes, total_cost_cents, created_at, supplier_invoice_number, supplier_invoice_date, supplier_invoice_due_date, supplier_invoice_amount_cents, client_request_id)
  values (gen_random_uuid()::text, v_receipt_number, v_order.id, v_order.supplier_id, v_order.branch_id, p_received_date, v_actor, coalesce(p_notes,''), v_total, now(), coalesce(p_supplier_invoice_number,''), p_supplier_invoice_date, p_supplier_invoice_due_date, p_supplier_invoice_amount_cents, p_client_request_id)
  returning * into v_receipt;

  insert into public.audit_logs(id,user_name,action,entity,entity_id,metadata,created_at)
  values (gen_random_uuid(),v_actor,'purchase_received','purchase_receipt',v_receipt.id,jsonb_build_object('purchaseOrderId',v_order.id,'branchId',v_order.branch_id,'totalCostCents',v_total,'clientRequestId',p_client_request_id),now());

  return jsonb_build_object('receipt',to_jsonb(v_receipt),'order',to_jsonb(v_order),'duplicate_reused',false);
end;
$$;

create or replace function public.create_stock_transfer_atomic(
  p_from_branch_id text,
  p_to_branch_id text,
  p_items jsonb,
  p_notes text default '',
  p_client_request_id uuid default gen_random_uuid()
) returns public.stock_transfers
language plpgsql security definer set search_path=public
as $$
declare v_row public.stock_transfers; v_actor text; v_number text; v_line jsonb;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('inventory.transfer') then raise exception 'Not authorized to create stock transfers.'; end if;
  if p_from_branch_id is null or p_to_branch_id is null or p_from_branch_id=p_to_branch_id then raise exception 'Transfer branches must be different.'; end if;
  if not public.profile_has_active_branch(p_from_branch_id) or not public.profile_has_active_branch(p_to_branch_id) then raise exception 'Not authorized for one or both transfer branches.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Transfer must include items.'; end if;
  for v_line in select value from jsonb_array_elements(p_items) loop
    if nullif(v_line->>'itemId','') is null or coalesce((v_line->>'quantity')::numeric,0)<=0 then raise exception 'Transfer items must have a valid item and positive quantity.'; end if;
    if not exists(select 1 from public.inventory_items where id=v_line->>'itemId' and status='active') then raise exception 'Transfer inventory item not found or inactive.'; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text,0));
  select * into v_row from public.stock_transfers where create_request_id=p_client_request_id;
  if found then return v_row; end if;
  perform pg_advisory_xact_lock(91024032);
  select 'TRF-'||lpad((coalesce(max((regexp_match(transfer_number,'^TRF-([0-9]+)$'))[1]::bigint),0)+1)::text,6,'0') into v_number from public.stock_transfers where transfer_number ~ '^TRF-[0-9]+$';
  v_actor:=auth.uid()::text;
  insert into public.stock_transfers(id,transfer_number,from_branch_id,to_branch_id,status,items,requested_by,notes,created_at,create_request_id)
  values(gen_random_uuid()::text,v_number,p_from_branch_id,p_to_branch_id,'draft',p_items,v_actor,coalesce(p_notes,''),now(),p_client_request_id) returning * into v_row;
  insert into public.audit_logs(id,user_name,action,entity,entity_id,metadata,created_at) values(gen_random_uuid(),v_actor,'stock_transfer_initiated','stock_transfer',v_row.id,jsonb_build_object('transferNumber',v_number,'fromBranchId',p_from_branch_id,'toBranchId',p_to_branch_id),now());
  return v_row;
end;$$;

create or replace function public.dispatch_stock_transfer_atomic(p_transfer_id text,p_client_request_id uuid default gen_random_uuid())
returns public.stock_transfers language plpgsql security definer set search_path=public as $$
declare v_transfer public.stock_transfers; v_line jsonb; v_stock public.branch_inventory; v_actor text; v_before numeric; v_after numeric;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('inventory.transfer') then raise exception 'Not authorized to dispatch stock transfers.'; end if;
  if p_client_request_id is null then raise exception 'Client request ID is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text,0));
  select * into v_transfer from public.stock_transfers where id=p_transfer_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  if v_transfer.dispatch_request_id=p_client_request_id and v_transfer.status in ('in_transit','received') then return v_transfer; end if;
  if v_transfer.status<>'draft' then raise exception 'Only draft transfers can be dispatched.'; end if;
  if not public.profile_has_active_branch(v_transfer.from_branch_id) then raise exception 'Not authorized for the source branch.'; end if;
  perform 1 from public.branch_inventory bi where bi.branch_id=v_transfer.from_branch_id and bi.inventory_item_id in (select value->>'itemId' from jsonb_array_elements(v_transfer.items)) order by bi.inventory_item_id for update;
  for v_line in select value from jsonb_array_elements(v_transfer.items) loop
    select * into v_stock from public.branch_inventory where branch_id=v_transfer.from_branch_id and inventory_item_id=v_line->>'itemId';
    if not found or v_stock.quantity_on_hand < (v_line->>'quantity')::numeric then raise exception 'Transfer quantity exceeds available source stock.'; end if;
  end loop;
  v_actor:=auth.uid()::text;
  for v_line in select value from jsonb_array_elements(v_transfer.items) loop
    select * into v_stock from public.branch_inventory where branch_id=v_transfer.from_branch_id and inventory_item_id=v_line->>'itemId' for update;
    v_before:=v_stock.quantity_on_hand; v_after:=v_before-(v_line->>'quantity')::numeric;
    update public.branch_inventory set quantity_on_hand=v_after,updated_at=now() where id=v_stock.id;
    insert into public.stock_movements(id,branch_id,inventory_item_id,movement_type,quantity,quantity_before,quantity_after,reference_type,reference_id,reason,performed_by,unit_cost_cents,total_cost_cents,created_at)
    values(gen_random_uuid()::text,v_transfer.from_branch_id,v_line->>'itemId','transfer_out',(v_line->>'quantity')::numeric,v_before,v_after,'stock_transfer',v_transfer.id,'Transfer '||v_transfer.transfer_number||' dispatched',v_actor,v_stock.average_unit_cost_cents,round(v_stock.average_unit_cost_cents*(v_line->>'quantity')::numeric)::integer,now());
  end loop;
  update public.stock_transfers set status='in_transit',sent_by=v_actor,sent_at=now(),dispatch_request_id=p_client_request_id where id=v_transfer.id returning * into v_transfer;
  insert into public.audit_logs(id,user_name,action,entity,entity_id,metadata,created_at) values(gen_random_uuid(),v_actor,'stock_transfer_initiated','stock_transfer',v_transfer.id,jsonb_build_object('transferNumber',v_transfer.transfer_number,'status','in_transit'),now());
  return v_transfer;
end;$$;

create or replace function public.receive_stock_transfer_atomic(p_transfer_id text,p_client_request_id uuid default gen_random_uuid())
returns public.stock_transfers language plpgsql security definer set search_path=public as $$
declare v_transfer public.stock_transfers; v_line jsonb; v_stock public.branch_inventory; v_actor text; v_before numeric; v_after numeric;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('inventory.transfer') then raise exception 'Not authorized to receive stock transfers.'; end if;
  if p_client_request_id is null then raise exception 'Client request ID is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text,0));
  select * into v_transfer from public.stock_transfers where id=p_transfer_id for update;
  if not found then raise exception 'Transfer not found.'; end if;
  if v_transfer.receive_request_id=p_client_request_id and v_transfer.status='received' then return v_transfer; end if;
  if v_transfer.status<>'in_transit' then raise exception 'Only in-transit transfers can be received.'; end if;
  if not public.profile_has_active_branch(v_transfer.to_branch_id) then raise exception 'Not authorized for the destination branch.'; end if;
  for v_line in select value from jsonb_array_elements(v_transfer.items) loop
    insert into public.branch_inventory(id,branch_id,inventory_item_id,quantity_on_hand,reorder_level,location,average_unit_cost_cents,updated_at)
    values(gen_random_uuid()::text,v_transfer.to_branch_id,v_line->>'itemId',0,0,'',0,now()) on conflict(branch_id,inventory_item_id) do nothing;
  end loop;
  perform 1 from public.branch_inventory bi where bi.branch_id=v_transfer.to_branch_id and bi.inventory_item_id in (select value->>'itemId' from jsonb_array_elements(v_transfer.items)) order by bi.inventory_item_id for update;
  v_actor:=auth.uid()::text;
  for v_line in select value from jsonb_array_elements(v_transfer.items) loop
    select * into v_stock from public.branch_inventory where branch_id=v_transfer.to_branch_id and inventory_item_id=v_line->>'itemId' for update;
    v_before:=v_stock.quantity_on_hand; v_after:=v_before+(v_line->>'quantity')::numeric;
    update public.branch_inventory set quantity_on_hand=v_after,updated_at=now() where id=v_stock.id;
    insert into public.stock_movements(id,branch_id,inventory_item_id,movement_type,quantity,quantity_before,quantity_after,reference_type,reference_id,reason,performed_by,unit_cost_cents,total_cost_cents,created_at)
    values(gen_random_uuid()::text,v_transfer.to_branch_id,v_line->>'itemId','transfer_in',(v_line->>'quantity')::numeric,v_before,v_after,'stock_transfer',v_transfer.id,'Transfer '||v_transfer.transfer_number||' received',v_actor,v_stock.average_unit_cost_cents,round(v_stock.average_unit_cost_cents*(v_line->>'quantity')::numeric)::integer,now());
  end loop;
  update public.stock_transfers set status='received',received_by=v_actor,received_at=now(),receive_request_id=p_client_request_id where id=v_transfer.id returning * into v_transfer;
  insert into public.audit_logs(id,user_name,action,entity,entity_id,metadata,created_at) values(gen_random_uuid(),v_actor,'stock_transfer_received','stock_transfer',v_transfer.id,jsonb_build_object('transferNumber',v_transfer.transfer_number,'status','received'),now());
  return v_transfer;
end;$$;

create or replace function public.post_stock_count_atomic(p_count_id text,p_client_request_id uuid default gen_random_uuid())
returns public.stock_counts language plpgsql security definer set search_path=public as $$
declare v_count public.stock_counts; v_item jsonb; v_stock public.branch_inventory; v_actor text; v_physical numeric; v_before numeric; v_diff numeric; v_after numeric;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('inventory.adjust') then raise exception 'Not authorized to post stock counts.'; end if;
  if p_client_request_id is null then raise exception 'Client request ID is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text,0));
  select * into v_count from public.stock_counts where id=p_count_id for update;
  if not found then raise exception 'Stock count not found.'; end if;
  if v_count.post_request_id=p_client_request_id and v_count.status='posted' then return v_count; end if;
  if v_count.status<>'reviewed' then raise exception 'Only reviewed stock counts can be posted.'; end if;
  if not public.profile_has_active_branch(v_count.branch_id) then raise exception 'Not authorized for this stock-count branch.'; end if;
  for v_item in select value from jsonb_array_elements(v_count.items) loop
    v_physical:=coalesce((v_item->>'physicalQuantity')::numeric,-1);
    if v_physical<0 then raise exception 'Physical quantity cannot be negative.'; end if;
    insert into public.branch_inventory(id,branch_id,inventory_item_id,quantity_on_hand,reorder_level,location,average_unit_cost_cents,updated_at)
    values(gen_random_uuid()::text,v_count.branch_id,v_item->>'itemId',0,0,'',0,now()) on conflict(branch_id,inventory_item_id) do nothing;
  end loop;
  perform 1 from public.branch_inventory bi where bi.branch_id=v_count.branch_id and bi.inventory_item_id in (select value->>'itemId' from jsonb_array_elements(v_count.items)) order by bi.inventory_item_id for update;
  v_actor:=auth.uid()::text;
  for v_item in select value from jsonb_array_elements(v_count.items) loop
    select * into v_stock from public.branch_inventory where branch_id=v_count.branch_id and inventory_item_id=v_item->>'itemId' for update;
    v_before:=v_stock.quantity_on_hand; v_physical:=(v_item->>'physicalQuantity')::numeric; v_diff:=v_physical-v_before; v_after:=v_physical;
    if v_diff<>0 then
      update public.branch_inventory set quantity_on_hand=v_after,updated_at=now() where id=v_stock.id;
      insert into public.stock_movements(id,branch_id,inventory_item_id,movement_type,quantity,quantity_before,quantity_after,reference_type,reference_id,reason,performed_by,unit_cost_cents,total_cost_cents,created_at)
      values(gen_random_uuid()::text,v_count.branch_id,v_item->>'itemId',case when v_diff>0 then 'adjustment_increase' else 'adjustment_decrease' end,abs(v_diff),v_before,v_after,'stock_count',v_count.id,'Stock count '||v_count.count_number,v_actor,v_stock.average_unit_cost_cents,round(v_stock.average_unit_cost_cents*abs(v_diff))::integer,now());
    end if;
  end loop;
  update public.stock_counts set status='posted',posted_at=now(),reviewed_by=coalesce(nullif(reviewed_by,''),v_actor),post_request_id=p_client_request_id where id=v_count.id returning * into v_count;
  insert into public.audit_logs(id,user_name,action,entity,entity_id,metadata,created_at) values(gen_random_uuid(),v_actor,'stock_movement_posted','stock_count',v_count.id,jsonb_build_object('countNumber',v_count.count_number,'status','posted'),now());
  return v_count;
end;$$;

revoke all on function public.receive_purchase_order(text,date,jsonb,text,text,date,date,integer,uuid) from public, anon;
grant execute on function public.receive_purchase_order(text,date,jsonb,text,text,date,date,integer,uuid) to authenticated, service_role;
revoke all on function public.create_stock_transfer_atomic(text,text,jsonb,text,uuid) from public, anon;
grant execute on function public.create_stock_transfer_atomic(text,text,jsonb,text,uuid) to authenticated, service_role;
revoke all on function public.dispatch_stock_transfer_atomic(text,uuid) from public, anon;
grant execute on function public.dispatch_stock_transfer_atomic(text,uuid) to authenticated, service_role;
revoke all on function public.receive_stock_transfer_atomic(text,uuid) from public, anon;
grant execute on function public.receive_stock_transfer_atomic(text,uuid) to authenticated, service_role;
revoke all on function public.post_stock_count_atomic(text,uuid) from public, anon;
grant execute on function public.post_stock_count_atomic(text,uuid) to authenticated, service_role;
