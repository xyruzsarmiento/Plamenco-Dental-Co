-- PART 1: align Staff's branch operational workspace permissions with the shared
-- Inventory UI while keeping clinical and owner/system permissions unchanged.

create or replace function public.has_profile_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      p.status = 'active'
      and (
        permission_key = any(coalesce(p.permissions, array[]::text[]))
        or p.role = 'super_admin'
        or (p.role = 'staff' and permission_key = any(array[
          'appointments.view','appointments.create','appointments.approve','appointments.reject','appointments.reschedule','appointments.cancel','appointments.assign_dentist','appointments.check_in','appointments.mark_no_show',
          'patients.view','patients.create','patients.edit_basic','patients.view_history',
          'documents.view','documents.upload',
          'billing.view','billing.create','payments.view','payments.record_manual','payments.verify','payments.confirm','payments.reject',
          'expenses.view','expenses.create','expenses.record_payment',
          'inventory.view','inventory.create_item','inventory.stock_in','inventory.stock_out','inventory.adjust','inventory.transfer','inventory.receive_transfer',
          'suppliers.view','suppliers.manage',
          'purchases.view','purchases.create','purchases.receive',
          'purchase_orders.view','purchase_orders.create','purchase_orders.receive',
          'reports.view_limited','notifications.view','notifications.send','communications.manage'
        ]::text[]))
        or (p.role = 'dentist' and permission_key = any(array[
          'appointments.view','appointments.view_assigned','appointments.update_clinical_status','appointments.start','appointments.complete',
          'patients.view','patients.view_history',
          'clinical_records.view','clinical_records.create','clinical_records.edit','clinical_records.edit_draft','clinical_records.finalize','clinical_records.amend',
          'treatments.view','treatments.create','treatments.edit','treatments.complete',
          'prescriptions.view','prescriptions.create','prescriptions.edit',
          'documents.view','documents.upload','schedule.view_own','schedule.manage_own','notifications.view'
        ]::text[]))
        or (p.role = 'associate_dentist' and permission_key = any(array[
          'appointments.view','appointments.view_assigned','appointments.update_clinical_status',
          'patients.view','patients.view_history',
          'clinical_records.view','clinical_records.create','clinical_records.edit_draft','clinical_records.finalize','clinical_records.amend',
          'treatments.view','treatments.create','treatments.edit',
          'prescriptions.view','prescriptions.create',
          'documents.view','documents.upload','schedule.view_own','notifications.view'
        ]::text[]))
      )
    from public.profiles p
    where p.id = auth.uid()
    limit 1
  ), false)
$$;
