create or replace function public.create_inventory_supplier(
  p_name text,p_contact_person text default '',p_phone text default '',p_email text default '',p_address text default '',p_notes text default ''
) returns public.suppliers language plpgsql security definer set search_path=public as $$
declare v_row public.suppliers; v_number text;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('suppliers.manage') then raise exception 'Not authorized to create suppliers.'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'Supplier name is required.'; end if;
  perform pg_advisory_xact_lock(91024041);
  select 'SUP-'||lpad((coalesce(max((regexp_match(supplier_number,'^SUP-([0-9]+)$'))[1]::bigint),0)+1)::text,6,'0') into v_number from public.suppliers where supplier_number ~ '^SUP-[0-9]+$';
  insert into public.suppliers(id,supplier_number,name,contact_person,phone,email,address,notes,status,created_at,updated_at)
  values(gen_random_uuid()::text,v_number,btrim(p_name),coalesce(p_contact_person,''),coalesce(p_phone,''),lower(coalesce(p_email,'')),coalesce(p_address,''),coalesce(p_notes,''),'active',now(),now()) returning * into v_row;
  return v_row;
end;$$;

create or replace function public.create_purchase_order_record(
  p_supplier_id text,p_branch_id text,p_order_date date,p_expected_delivery_date date,p_items jsonb,p_notes text default ''
) returns public.purchase_orders language plpgsql security definer set search_path=public as $$
declare v_row public.purchase_orders; v_number text; v_actor text; v_line jsonb; v_subtotal integer:=0;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_any_profile_permission(array['purchase_orders.create','purchases.create']) then raise exception 'Not authorized to create purchase orders.'; end if;
  if not public.profile_has_active_branch(p_branch_id) then raise exception 'Not authorized for this purchase-order branch.'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id and status='active') then raise exception 'Supplier not found or inactive.'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Purchase order must contain at least one item.'; end if;
  for v_line in select value from jsonb_array_elements(p_items) loop
    if nullif(v_line->>'itemId','') is null or coalesce((v_line->>'quantityOrdered')::numeric,0)<=0 or coalesce((v_line->>'unitCostCents')::integer,-1)<0 then raise exception 'Purchase-order item values are invalid.'; end if;
    if not exists(select 1 from public.inventory_items where id=v_line->>'itemId' and status='active') then raise exception 'Purchase-order inventory item not found or inactive.'; end if;
    v_subtotal:=v_subtotal+round((v_line->>'quantityOrdered')::numeric*(v_line->>'unitCostCents')::integer)::integer;
  end loop;
  perform pg_advisory_xact_lock(91024042);
  select 'PO-'||lpad((coalesce(max((regexp_match(po_number,'^PO-([0-9]+)$'))[1]::bigint),0)+1)::text,6,'0') into v_number from public.purchase_orders where po_number ~ '^PO-[0-9]+$';
  v_actor:=auth.uid()::text;
  insert into public.purchase_orders(id,po_number,supplier_id,branch_id,order_date,expected_delivery_date,status,items,subtotal_cents,total_cents,notes,created_by,created_at,updated_at)
  values(gen_random_uuid()::text,v_number,p_supplier_id,p_branch_id,p_order_date,p_expected_delivery_date,'ordered',p_items,v_subtotal,v_subtotal,coalesce(p_notes,''),v_actor,now(),now()) returning * into v_row;
  return v_row;
end;$$;

create or replace function public.create_stock_count_record(p_branch_id text,p_count_date date,p_notes text default '')
returns public.stock_counts language plpgsql security definer set search_path=public as $$
declare v_row public.stock_counts; v_number text; v_actor text; v_items jsonb;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('inventory.adjust') then raise exception 'Not authorized to create stock counts.'; end if;
  if not public.profile_has_active_branch(p_branch_id) then raise exception 'Not authorized for this stock-count branch.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',gen_random_uuid()::text,'itemId',i.id,'systemQuantity',coalesce(bi.quantity_on_hand,0),'physicalQuantity',coalesce(bi.quantity_on_hand,0),'difference',0,'reason','') order by i.name),'[]'::jsonb)
  into v_items from public.inventory_items i left join public.branch_inventory bi on bi.inventory_item_id=i.id and bi.branch_id=p_branch_id where i.status='active';
  perform pg_advisory_xact_lock(91024043);
  select 'CNT-'||lpad((coalesce(max((regexp_match(count_number,'^CNT-([0-9]+)$'))[1]::bigint),0)+1)::text,6,'0') into v_number from public.stock_counts where count_number ~ '^CNT-[0-9]+$';
  v_actor:=auth.uid()::text;
  insert into public.stock_counts(id,count_number,branch_id,status,counted_by,count_date,items,notes,created_at)
  values(gen_random_uuid()::text,v_number,p_branch_id,'draft',v_actor,p_count_date,v_items,coalesce(p_notes,''),now()) returning * into v_row;
  return v_row;
end;$$;

create or replace function public.set_stock_count_physical_quantity(p_count_id text,p_item_id text,p_physical_quantity numeric,p_reason text default '')
returns public.stock_counts language plpgsql security definer set search_path=public as $$
declare v_count public.stock_counts; v_items jsonb; v_system numeric;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('inventory.adjust') then raise exception 'Not authorized to edit stock counts.'; end if;
  if p_physical_quantity<0 then raise exception 'Physical quantity cannot be negative.'; end if;
  select * into v_count from public.stock_counts where id=p_count_id for update;
  if not found then raise exception 'Stock count not found.'; end if;
  if v_count.status<>'draft' then raise exception 'Only draft stock counts can be edited.'; end if;
  if not public.profile_has_active_branch(v_count.branch_id) then raise exception 'Not authorized for this stock-count branch.'; end if;
  select coalesce(quantity_on_hand,0) into v_system from public.branch_inventory where branch_id=v_count.branch_id and inventory_item_id=p_item_id;
  v_system:=coalesce(v_system,0);
  if not exists(select 1 from jsonb_array_elements(v_count.items) x where x->>'itemId'=p_item_id) then raise exception 'Stock-count item not found.'; end if;
  select jsonb_agg(case when x->>'itemId'=p_item_id then x || jsonb_build_object('systemQuantity',v_system,'physicalQuantity',p_physical_quantity,'difference',p_physical_quantity-v_system,'reason',coalesce(p_reason,'')) else x end)
  into v_items from jsonb_array_elements(v_count.items) x;
  update public.stock_counts set items=v_items where id=p_count_id returning * into v_count;
  return v_count;
end;$$;

create or replace function public.review_stock_count_record(p_count_id text)
returns public.stock_counts language plpgsql security definer set search_path=public as $$
declare v_count public.stock_counts; v_actor text;
begin
  if auth.uid() is null or not public.is_internal_profile() or not public.has_profile_permission('inventory.adjust') then raise exception 'Not authorized to review stock counts.'; end if;
  select * into v_count from public.stock_counts where id=p_count_id for update;
  if not found then raise exception 'Stock count not found.'; end if;
  if v_count.status<>'draft' then raise exception 'Only draft stock counts can be reviewed.'; end if;
  if not public.profile_has_active_branch(v_count.branch_id) then raise exception 'Not authorized for this stock-count branch.'; end if;
  v_actor:=auth.uid()::text;
  update public.stock_counts set status='reviewed',reviewed_by=v_actor where id=p_count_id returning * into v_count;
  return v_count;
end;$$;

revoke all on function public.create_inventory_supplier(text,text,text,text,text,text) from public,anon;
grant execute on function public.create_inventory_supplier(text,text,text,text,text,text) to authenticated,service_role;
revoke all on function public.create_purchase_order_record(text,text,date,date,jsonb,text) from public,anon;
grant execute on function public.create_purchase_order_record(text,text,date,date,jsonb,text) to authenticated,service_role;
revoke all on function public.create_stock_count_record(text,date,text) from public,anon;
grant execute on function public.create_stock_count_record(text,date,text) to authenticated,service_role;
revoke all on function public.set_stock_count_physical_quantity(text,text,numeric,text) from public,anon;
grant execute on function public.set_stock_count_physical_quantity(text,text,numeric,text) to authenticated,service_role;
revoke all on function public.review_stock_count_record(text) from public,anon;
grant execute on function public.review_stock_count_record(text) to authenticated,service_role;
