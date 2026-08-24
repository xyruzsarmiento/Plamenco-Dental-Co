-- Part 4: remove the standalone Admin role from internal role handling.
-- Existing Admin profiles are safely transitioned to Staff with Staff permissions.
-- Super Admin receives an explicit non-clinical permission set instead of a blanket
-- permission bypass; clinical authoring/prescribing stays with Dentist roles.

do $$
declare
  v_staff_permissions text[] := array[
    'appointments.view',
    'appointments.create',
    'appointments.approve',
    'appointments.reject',
    'appointments.reschedule',
    'appointments.cancel',
    'appointments.assign_dentist',
    'appointments.check_in',
    'appointments.mark_no_show',
    'patients.view',
    'patients.create',
    'patients.edit_basic',
    'patients.view_history',
    'documents.view',
    'documents.upload',
    'billing.view',
    'billing.create',
    'payments.view',
    'payments.record_manual',
    'payments.verify',
    'payments.confirm',
    'payments.reject',
    'expenses.view',
    'expenses.create',
    'expenses.record_payment',
    'inventory.view',
    'inventory.stock_in',
    'inventory.stock_out',
    'inventory.receive_transfer',
    'suppliers.view',
    'purchases.view',
    'purchases.receive',
    'purchase_orders.view',
    'purchase_orders.receive',
    'reports.view_limited',
    'notifications.view',
    'notifications.send',
    'communications.manage'
  ];
  v_super_admin_permissions text[] := array[
    'appointments.view',
    'appointments.create',
    'appointments.approve',
    'appointments.reject',
    'appointments.reschedule',
    'appointments.cancel',
    'appointments.assign_dentist',
    'appointments.check_in',
    'appointments.mark_no_show',
    'appointments.view_assigned',
    'patients.view',
    'patients.create',
    'patients.edit_basic',
    'patients.view_history',
    'patients.import',
    'patients.export',
    'documents.view',
    'documents.upload',
    'billing.view',
    'billing.create',
    'billing.edit',
    'billing.apply_discount',
    'billing.void_invoice',
    'payments.view',
    'payments.record_manual',
    'payments.verify',
    'payments.confirm',
    'payments.reject',
    'payments.refund',
    'services.view',
    'services.manage',
    'inventory.view',
    'inventory.create_item',
    'inventory.edit_item',
    'inventory.stock_in',
    'inventory.stock_out',
    'inventory.adjust',
    'inventory.transfer',
    'inventory.receive_transfer',
    'inventory.view_cost',
    'suppliers.view',
    'suppliers.manage',
    'purchases.view',
    'purchases.create',
    'purchases.receive',
    'purchase_orders.view',
    'purchase_orders.create',
    'purchase_orders.approve',
    'purchase_orders.receive',
    'expenses.view',
    'expenses.create',
    'expenses.edit',
    'expenses.approve',
    'expenses.record_payment',
    'expenses.void',
    'expenses.view_costs',
    'expenses.manage_categories',
    'expenses.manage_recurring',
    'expenses.view_payroll',
    'reports.view',
    'reports.view_limited',
    'reports.view_financial',
    'reports.view_branch_performance',
    'reports.view_inventory',
    'reports.view_provider_performance',
    'reports.export_pdf',
    'reports.export_excel',
    'dentists.manage',
    'staff.manage',
    'roles.manage',
    'permissions.manage',
    'branches.view',
    'branches.manage',
    'schedule.manage_all',
    'notifications.view',
    'notifications.send',
    'communications.manage',
    'settings.manage',
    'audit_logs.view',
    'system_admin.view',
    'system_admin.manage'
  ];
begin
  update public.profiles
  set role = 'staff',
      permissions = v_staff_permissions,
      updated_at = now()
  where role = 'admin';

  update public.profiles
  set permissions = v_super_admin_permissions,
      updated_at = now()
  where role = 'super_admin';

  update public.internal_account_invitations
  set role = 'staff',
      updated_at = now()
  where role = 'admin';
end;
$$;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'dentist', 'associate_dentist', 'staff', 'patient'));

alter table public.internal_account_invitations
  drop constraint if exists internal_account_invitations_role_check;

alter table public.internal_account_invitations
  add constraint internal_account_invitations_role_check
  check (role in ('super_admin', 'dentist', 'associate_dentist', 'staff'));

create or replace function public.is_management_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role = 'super_admin'
        and status = 'active'
    ),
    false
  )
$$;

create or replace function public.has_profile_permission(permission_key text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and status = 'active'
        and permission_key = any(permissions)
    ),
    false
  )
$$;

create or replace function public.has_any_profile_permission(permission_keys text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.status = 'active'
        and p.permissions && permission_keys
    ),
    false
  )
$$;

create or replace function public.is_internal_profile()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and status = 'active'
        and role in ('super_admin', 'dentist', 'associate_dentist', 'staff')
    ),
    false
  )
$$;

create or replace function public.is_active_internal_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('super_admin', 'dentist', 'associate_dentist', 'staff')
  );
$$;

create or replace function public.handle_new_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  requested_role text := lower(coalesce(new.raw_user_meta_data ->> 'role', 'patient'));
  safe_role text;
begin
  safe_role := case
    when requested_role = 'admin' then 'staff'
    when requested_role in ('super_admin', 'dentist', 'associate_dentist', 'staff', 'patient')
      then requested_role
    else 'patient'
  end;

  insert into public.profiles (
    id,
    full_name,
    email,
    role,
    status
  )
  values (
    new.id,
    trim(
      coalesce(new.raw_user_meta_data ->> 'first_name', '') || ' ' ||
      coalesce(new.raw_user_meta_data ->> 'last_name', '')
    ),
    lower(coalesce(new.email, '')),
    safe_role,
    'active'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = case
      when excluded.full_name <> '' then excluded.full_name
      else public.profiles.full_name
    end,
    role = case
      when public.profiles.role = 'admin' then 'staff'
      else public.profiles.role
    end,
    updated_at = now();

  return new;
end;
$$;

grant execute on function public.is_management_role() to authenticated;
grant execute on function public.has_profile_permission(text) to authenticated;
grant execute on function public.has_any_profile_permission(text[]) to authenticated;
grant execute on function public.is_internal_profile() to authenticated;
grant execute on function public.is_active_internal_account() to authenticated;

comment on function public.is_management_role() is 'Returns true only for active Super Admin profiles.';
comment on function public.has_profile_permission(text) is 'Checks explicit profile permissions; Super Admin access is explicit and non-clinical by default.';
