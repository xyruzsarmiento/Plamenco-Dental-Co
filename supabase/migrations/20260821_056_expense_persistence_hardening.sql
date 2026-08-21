-- Expense persistence hardening.
-- Replaces legacy staff-email RLS checks with the canonical authenticated profile role.
-- Safe to rerun: helper is replaced and every policy is dropped before creation.

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
      and p.role in ('super_admin', 'admin', 'dentist', 'associate_dentist', 'staff')
  );
$$;

revoke all on function public.is_active_internal_account() from public;
grant execute on function public.is_active_internal_account() to authenticated;

alter table public.expense_categories enable row level security;
alter table public.expense_vendors enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_payments enable row level security;
alter table public.expense_attachments enable row level security;
alter table public.expense_recurring_templates enable row level security;

drop policy if exists "expense_categories_internal_read" on public.expense_categories;
create policy "expense_categories_internal_read"
on public.expense_categories
for select
to authenticated
using (public.is_active_internal_account());

drop policy if exists "expense_vendors_internal_read" on public.expense_vendors;
create policy "expense_vendors_internal_read"
on public.expense_vendors
for select
to authenticated
using (public.is_active_internal_account());

drop policy if exists "expense_vendors_internal_write" on public.expense_vendors;
create policy "expense_vendors_internal_write"
on public.expense_vendors
for all
to authenticated
using (public.is_active_internal_account())
with check (public.is_active_internal_account());

drop policy if exists "expenses_internal_read" on public.expenses;
create policy "expenses_internal_read"
on public.expenses
for select
to authenticated
using (public.is_active_internal_account());

drop policy if exists "expenses_internal_write" on public.expenses;
create policy "expenses_internal_write"
on public.expenses
for all
to authenticated
using (public.is_active_internal_account())
with check (public.is_active_internal_account());

drop policy if exists "expense_payments_internal_read" on public.expense_payments;
create policy "expense_payments_internal_read"
on public.expense_payments
for select
to authenticated
using (public.is_active_internal_account());

drop policy if exists "expense_payments_internal_write" on public.expense_payments;
create policy "expense_payments_internal_write"
on public.expense_payments
for all
to authenticated
using (public.is_active_internal_account())
with check (public.is_active_internal_account());

drop policy if exists "expense_attachments_internal_read" on public.expense_attachments;
create policy "expense_attachments_internal_read"
on public.expense_attachments
for select
to authenticated
using (public.is_active_internal_account());

drop policy if exists "expense_attachments_internal_write" on public.expense_attachments;
create policy "expense_attachments_internal_write"
on public.expense_attachments
for all
to authenticated
using (public.is_active_internal_account())
with check (public.is_active_internal_account());

drop policy if exists "expense_recurring_internal_read" on public.expense_recurring_templates;
create policy "expense_recurring_internal_read"
on public.expense_recurring_templates
for select
to authenticated
using (public.is_active_internal_account());

drop policy if exists "expense_recurring_internal_write" on public.expense_recurring_templates;
create policy "expense_recurring_internal_write"
on public.expense_recurring_templates
for all
to authenticated
using (public.is_active_internal_account())
with check (public.is_active_internal_account());

drop policy if exists "expense_attachments_storage_internal_read" on storage.objects;
create policy "expense_attachments_storage_internal_read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'expense-attachments'
  and public.is_active_internal_account()
);

drop policy if exists "expense_attachments_storage_internal_write" on storage.objects;
create policy "expense_attachments_storage_internal_write"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'expense-attachments'
  and public.is_active_internal_account()
)
with check (
  bucket_id = 'expense-attachments'
  and public.is_active_internal_account()
);
