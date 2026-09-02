-- Expense workspace reads must succeed for authenticated internal users.
-- Browser localStorage is only a cache after a successful database load.

grant execute on function public.is_internal_profile() to authenticated;
grant execute on function public.has_profile_permission(text) to authenticated;
grant execute on function public.profile_has_active_branch(text) to authenticated;

grant select on table public.expenses to authenticated;
grant select on table public.expense_payments to authenticated;
grant select on table public.expense_vendors to authenticated;
grant select on table public.expense_categories to authenticated;
grant select on table public.expense_recurring_templates to authenticated;
grant select on table public.expense_attachments to authenticated;

create index if not exists expenses_expense_date_branch_idx
  on public.expenses (expense_date desc, branch_id);

create index if not exists expense_payments_payment_date_idx
  on public.expense_payments (payment_date desc);

comment on table public.expenses is
  'Clinic operating-cost ledger. Mutations go through audited RPCs; the frontend cache is not the source of truth.';
