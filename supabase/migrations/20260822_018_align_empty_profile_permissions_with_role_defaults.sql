-- Align empty database permission arrays with the existing frontend role defaults.
-- Only active dentist/associate_dentist/staff profiles with no explicit permissions
-- are populated; existing customized permission arrays are preserved.

update public.profiles
set permissions = case role
  when 'dentist' then array[
    'appointments.view','appointments.view_assigned','appointments.update_clinical_status','appointments.start','appointments.complete',
    'patients.view','patients.view_history','clinical_records.view','clinical_records.create','clinical_records.edit','clinical_records.edit_draft','clinical_records.finalize','clinical_records.amend',
    'treatments.view','treatments.create','treatments.edit','treatments.complete','prescriptions.view','prescriptions.create','prescriptions.edit','documents.view','documents.upload',
    'schedule.view_own','schedule.manage_own','notifications.view'
  ]::text[]
  when 'associate_dentist' then array[
    'appointments.view','appointments.view_assigned','appointments.update_clinical_status','patients.view','patients.view_history',
    'clinical_records.view','clinical_records.create','clinical_records.edit_draft','clinical_records.finalize','clinical_records.amend',
    'treatments.view','treatments.create','treatments.edit','prescriptions.view','prescriptions.create','documents.view','schedule.view_own','notifications.view'
  ]::text[]
  when 'staff' then array[
    'appointments.view','appointments.create','appointments.approve','appointments.reject','appointments.reschedule','appointments.check_in','appointments.mark_no_show',
    'patients.view','patients.create','patients.edit_basic','payments.view','payments.record_manual','expenses.view','expenses.create','expenses.record_payment',
    'inventory.view','inventory.stock_in','inventory.stock_out','inventory.receive_transfer','suppliers.view','purchases.view','purchases.receive','purchase_orders.view','purchase_orders.receive',
    'reports.view_limited','notifications.view','notifications.send'
  ]::text[]
  else permissions
end
where status='active'
  and coalesce(cardinality(permissions),0)=0
  and role in ('dentist','associate_dentist','staff');
