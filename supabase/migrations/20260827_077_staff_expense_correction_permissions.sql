-- Allow Staff expense users to correct and void branch expense records through
-- the existing audited RPCs. The RPCs still enforce internal-profile permission
-- checks; this migration only aligns Staff's stored permissions with the UI.

update public.profiles
set permissions = (
  select array(
    select distinct permission
    from unnest(coalesce(public.profiles.permissions, array[]::text[]) || array['expenses.edit', 'expenses.void']) as permission
    order by permission
  )
),
updated_at = now()
where role = 'staff'
  and coalesce(public.profiles.permissions, array[]::text[]) && array['expenses.view', 'expenses.create', 'expenses.record_payment'];
