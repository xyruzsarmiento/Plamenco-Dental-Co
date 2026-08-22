drop trigger if exists trg_ensure_unique_expense_number on public.expenses;
drop trigger if exists trg_expenses_unique_number on public.expenses;

create or replace function public.assign_unique_expense_number()
returns trigger
language plpgsql
as $$
declare
  next_value bigint;
begin
  perform pg_advisory_xact_lock(91024001);

  if new.expense_number is null
     or btrim(new.expense_number) = ''
     or exists (
       select 1
       from public.expenses e
       where e.expense_number = new.expense_number
         and e.id is distinct from new.id
     ) then
    select coalesce(max(substring(expense_number from 5)::bigint), 0) + 1
    into next_value
    from public.expenses
    where expense_number similar to 'EXP-[0-9]+';

    new.expense_number := 'EXP-' || lpad(next_value::text, 6, '0');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_unique_expense_number on public.expenses;
create trigger trg_assign_unique_expense_number
before insert or update of expense_number on public.expenses
for each row execute function public.assign_unique_expense_number();
