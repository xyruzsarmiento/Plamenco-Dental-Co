-- Narrow internal-only RLS policies from PUBLIC to authenticated.
-- Authorization predicates remain unchanged; this prevents anonymous requests
-- from evaluating internal permission helpers unnecessarily.

alter policy branch_inventory_internal_read on public.branch_inventory to authenticated;
alter policy branch_inventory_internal_write on public.branch_inventory to authenticated;
alter policy branch_inventory_read_internal on public.branch_inventory to authenticated;
alter policy branch_inventory_write_authorized on public.branch_inventory to authenticated;

alter policy inventory_internal_read on public.inventory_items to authenticated;
alter policy inventory_internal_write on public.inventory_items to authenticated;
alter policy inventory_items_read_internal on public.inventory_items to authenticated;
alter policy inventory_items_write_authorized on public.inventory_items to authenticated;

alter policy expenses_internal_read on public.expenses to authenticated;
alter policy expenses_internal_write on public.expenses to authenticated;

alter policy profiles_insert_management on public.profiles to authenticated;
alter policy profiles_read_own_or_management on public.profiles to authenticated;
alter policy profiles_update_own_or_management on public.profiles to authenticated;
