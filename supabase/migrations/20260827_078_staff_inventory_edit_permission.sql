-- Align Staff inventory permissions with the shared branch workspace. Staff who
-- already have operational inventory access may correct item metadata; quantity
-- changes still use audited stock movement RPCs and branch-scoped RLS.

update public.profiles
set permissions = (
  select array(
    select distinct permission
    from unnest(coalesce(public.profiles.permissions, array[]::text[]) || array['inventory.edit_item']) as permission
    order by permission
  )
),
updated_at = now()
where role = 'staff'
  and coalesce(public.profiles.permissions, array[]::text[]) && array[
    'inventory.view',
    'inventory.create_item',
    'inventory.stock_in',
    'inventory.stock_out',
    'inventory.adjust',
    'inventory.transfer'
  ];
