-- Keep the inventory catalogue, branch stock, movements and valuation in one
-- consistent operational state.
--
-- A stocked item must remain active. Historical versions of the app allowed
-- an item to be archived/inactivated while branch_inventory still held stock.
-- The inventory summary continued to count those stock rows, while the item
-- list filtered the catalogue to active items, creating contradictory totals.

-- Repair existing invalid catalogue states first. An item with stock on hand
-- is operational and therefore must be visible in the active catalogue.
update public.inventory_items i
set status = 'active',
    updated_at = now()
where coalesce(i.status, 'active') <> 'active'
  and exists (
    select 1
    from public.branch_inventory bi
    where bi.inventory_item_id = i.id
      and abs(coalesce(bi.quantity_on_hand, 0)) > 0.000001
  );

create or replace function public.prevent_stocked_inventory_item_deactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, 'active') <> 'active'
     and exists (
       select 1
       from public.branch_inventory bi
       where bi.inventory_item_id = new.id
         and abs(coalesce(bi.quantity_on_hand, 0)) > 0.000001
     ) then
    raise exception 'Inventory item still has stock on hand and cannot be archived or deactivated. Reduce all branch quantities to zero first.';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_items_prevent_stocked_deactivation
on public.inventory_items;

create trigger inventory_items_prevent_stocked_deactivation
before update of status on public.inventory_items
for each row
execute function public.prevent_stocked_inventory_item_deactivation();

-- A small diagnostic view makes future catalogue/stock drift visible during
-- QA without changing the application data model.
create or replace view public.inventory_catalog_integrity as
select
  i.id as inventory_item_id,
  i.item_code,
  i.name,
  i.status,
  count(bi.id)::integer as branch_positions,
  coalesce(sum(bi.quantity_on_hand), 0)::numeric as quantity_on_hand,
  coalesce(sum(bi.quantity_on_hand * bi.average_unit_cost_cents), 0)::numeric as inventory_value_cents
from public.inventory_items i
left join public.branch_inventory bi
  on bi.inventory_item_id = i.id
group by i.id, i.item_code, i.name, i.status;

revoke all on public.inventory_catalog_integrity from public, anon;
grant select on public.inventory_catalog_integrity to authenticated, service_role;
