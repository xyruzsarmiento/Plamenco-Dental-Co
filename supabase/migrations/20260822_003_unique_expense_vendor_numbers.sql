create or replace function public.ensure_unique_operating_number()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'expenses' then
    if new.expense_number is null or btrim(new.expense_number) = '' or exists (
      select 1 from public.expenses e where e.expense_number = new.expense_number and e.id <> new.id
    ) then
      new.expense_number := 'EXP-' || to_char(clock_timestamp() at time zone 'Asia/Manila', 'YYYYMMDD-HH24MISS-MS') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    end if;
  elsif tg_table_name = 'expense_vendors' then
    if new.vendor_number is null or btrim(new.vendor_number) = '' or exists (
      select 1 from public.expense_vendors v where v.vendor_number = new.vendor_number and v.id <> new.id
    ) then
      new.vendor_number := 'VND-' || to_char(clock_timestamp() at time zone 'Asia/Manila', 'YYYYMMDD-HH24MISS-MS') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_expenses_unique_number on public.expenses;
create trigger trg_expenses_unique_number
before insert or update of expense_number on public.expenses
for each row execute function public.ensure_unique_operating_number();

drop trigger if exists trg_expense_vendors_unique_number on public.expense_vendors;
create trigger trg_expense_vendors_unique_number
before insert or update of vendor_number on public.expense_vendors
for each row execute function public.ensure_unique_operating_number();
