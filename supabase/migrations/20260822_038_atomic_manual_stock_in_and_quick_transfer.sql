create or replace function public.post_manual_stock_in_atomic(
  p_branch_id text,
  p_inventory_item_id text,
  p_quantity numeric,
  p_unit_cost_cents integer,
  p_reason text,
  p_reference text default '',
  p_received_date date default current_date,
  p_batch_number text default '',
  p_expiry_date date default null,
  p_client_request_id uuid default gen_random_uuid()
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_existing public.stock_movements;
  v_movement public.stock_movements;
  v_batch public.inventory_batches;
  v_item public.inventory_items;
  v_batch_number text;
begin
  if auth.uid() is null or not public.is_internal_profile() then raise exception 'Not authorized to stock in inventory.'; end if;
  if not public.has_any_profile_permission(array['inventory.stock_in','purchases.receive','purchase_orders.receive']) then raise exception 'Missing permission to stock in inventory.'; end if;
  if p_client_request_id is null then raise exception 'Client request ID is required.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
  if coalesce(p_unit_cost_cents,0) < 0 then raise exception 'Unit cost cannot be negative.'; end if;
  if not public.profile_has_active_branch(p_branch_id) then raise exception 'Not authorized for this inventory branch.'; end if;
  select * into v_item from public.inventory_items where id=p_inventory_item_id and status='active';
  if not found then raise exception 'Inventory item not found or inactive.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text,0));
  select * into v_existing from public.stock_movements where client_request_id=p_client_request_id;
  if found then
    if v_existing.batch_id is not null then select * into v_batch from public.inventory_batches where id=v_existing.batch_id; end if;
    return jsonb_build_object('movement',to_jsonb(v_existing),'batch',case when v_batch.id is null then null else to_jsonb(v_batch) end,'duplicate_reused',true);
  end if;
  select * into v_movement from public.post_stock_movement(
    p_branch_id,p_inventory_item_id,'manual_stock_in',p_quantity,p_reason,'',
    case when nullif(btrim(p_reference),'') is null then '' else 'manual_reference' end,
    coalesce(p_reference,''),null,coalesce(p_unit_cost_cents,0),p_client_request_id
  );
  if coalesce(v_item.track_batches,false) or coalesce(v_item.track_expiry,false) or nullif(btrim(p_batch_number),'') is not null or p_expiry_date is not null then
    v_batch_number := coalesce(nullif(btrim(p_batch_number),''),'BATCH-'||substr(p_client_request_id::text,1,8));
    insert into public.inventory_batches(id,branch_id,inventory_item_id,batch_number,quantity_on_hand,received_date,expiry_date,supplier_id,unit_cost_cents,source_type,source_id,created_at,updated_at)
    values(gen_random_uuid()::text,p_branch_id,p_inventory_item_id,v_batch_number,p_quantity,p_received_date,p_expiry_date,null,coalesce(p_unit_cost_cents,0),'manual_stock_in',coalesce(nullif(btrim(p_reference),''),p_client_request_id::text),now(),now())
    on conflict(branch_id,inventory_item_id,batch_number) where nullif(btrim(batch_number),'') is not null
    do update set quantity_on_hand=public.inventory_batches.quantity_on_hand+excluded.quantity_on_hand,
                  expiry_date=coalesce(excluded.expiry_date,public.inventory_batches.expiry_date),
                  unit_cost_cents=excluded.unit_cost_cents,
                  updated_at=now()
    returning * into v_batch;
    update public.stock_movements set batch_id=v_batch.id where id=v_movement.id returning * into v_movement;
  end if;
  return jsonb_build_object('movement',to_jsonb(v_movement),'batch',case when v_batch.id is null then null else to_jsonb(v_batch) end,'duplicate_reused',false);
end;$$;

create or replace function public.complete_stock_transfer_atomic(
  p_from_branch_id text,
  p_to_branch_id text,
  p_items jsonb,
  p_notes text default '',
  p_client_request_id uuid default gen_random_uuid()
) returns public.stock_transfers
language plpgsql security definer set search_path=public as $$
declare
  v_transfer public.stock_transfers;
  v_create_id uuid;
  v_dispatch_id uuid;
  v_receive_id uuid;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('inventory.transfer') then raise exception 'Not authorized to complete stock transfers.'; end if;
  if p_client_request_id is null then raise exception 'Client request ID is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text,0));
  select * into v_transfer from public.stock_transfers where create_request_id=p_client_request_id;
  if found and v_transfer.status='received' then return v_transfer; end if;
  v_create_id:=p_client_request_id;
  v_dispatch_id:=(substr(md5(p_client_request_id::text||':dispatch'),1,8)||'-'||substr(md5(p_client_request_id::text||':dispatch'),9,4)||'-4'||substr(md5(p_client_request_id::text||':dispatch'),14,3)||'-8'||substr(md5(p_client_request_id::text||':dispatch'),18,3)||'-'||substr(md5(p_client_request_id::text||':dispatch'),21,12))::uuid;
  v_receive_id:=(substr(md5(p_client_request_id::text||':receive'),1,8)||'-'||substr(md5(p_client_request_id::text||':receive'),9,4)||'-4'||substr(md5(p_client_request_id::text||':receive'),14,3)||'-8'||substr(md5(p_client_request_id::text||':receive'),18,3)||'-'||substr(md5(p_client_request_id::text||':receive'),21,12))::uuid;
  if not found then v_transfer:=public.create_stock_transfer_atomic(p_from_branch_id,p_to_branch_id,p_items,p_notes,v_create_id); end if;
  if v_transfer.status='draft' then v_transfer:=public.dispatch_stock_transfer_atomic(v_transfer.id,v_dispatch_id); end if;
  if v_transfer.status='in_transit' then v_transfer:=public.receive_stock_transfer_atomic(v_transfer.id,v_receive_id); end if;
  return v_transfer;
end;$$;

revoke all on function public.post_manual_stock_in_atomic(text,text,numeric,integer,text,text,date,text,date,uuid) from public,anon;
grant execute on function public.post_manual_stock_in_atomic(text,text,numeric,integer,text,text,date,text,date,uuid) to authenticated,service_role;
revoke all on function public.complete_stock_transfer_atomic(text,text,jsonb,text,uuid) from public,anon;
grant execute on function public.complete_stock_transfer_atomic(text,text,jsonb,text,uuid) to authenticated,service_role;
