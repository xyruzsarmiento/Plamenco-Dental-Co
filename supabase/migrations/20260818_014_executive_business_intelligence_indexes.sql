-- Executive BI query support. These indexes match the shared report filters:
-- business date, branch, provider, service, status, patient, payment method, and supplier.

create index if not exists patients_analytics_branch_registration_idx
  on public.patients(preferred_branch_id, registration_date, status);

create index if not exists appointments_analytics_date_branch_status_idx
  on public.appointments(appointment_date, branch_id, status);

create index if not exists appointments_analytics_provider_service_idx
  on public.appointments(provider_id, service_id, appointment_date);

create index if not exists treatments_analytics_date_provider_service_idx
  on public.treatments(treatment_date, provider_id, service_id, status);

create index if not exists treatments_analytics_branch_date_idx
  on public.treatments(branch_id, treatment_date, status);

create index if not exists charges_analytics_provider_service_idx
  on public.charges(provider_id, service_id, created_at, status);

create index if not exists charges_analytics_branch_date_idx
  on public.charges(branch_id, created_at, status);

create index if not exists invoices_analytics_date_branch_status_idx
  on public.invoices(invoice_date, branch_id, status);

create index if not exists invoices_analytics_patient_status_idx
  on public.invoices(patient_id, status, invoice_date);

create index if not exists payments_analytics_date_branch_status_idx
  on public.payments(payment_date, branch_id, status);

create index if not exists payments_analytics_method_date_idx
  on public.payments(payment_method, payment_date, status);

create index if not exists expenses_analytics_date_branch_status_idx
  on public.expenses(expense_date, branch_id, status);

create index if not exists expenses_analytics_category_vendor_idx
  on public.expenses(category_id, vendor_id, expense_date);

create index if not exists stock_movements_analytics_date_branch_item_idx
  on public.stock_movements(created_at, branch_id, inventory_item_id, movement_type);

create index if not exists purchase_receipts_analytics_date_branch_supplier_idx
  on public.purchase_receipts(received_date, branch_id, supplier_id);
