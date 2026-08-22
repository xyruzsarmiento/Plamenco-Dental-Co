create sequence if not exists public.expense_number_seq;
create sequence if not exists public.expense_vendor_number_seq;

do $$
declare
  max_exp bigint;
  max_vnd bigint;
begin
  select coalesce(max((regexp_match(expense_number, '^EXP-(\d+)$'))[1]::bigint), 0)
    into max_exp
  from public.expenses
  where expense_number ~ '^EXP-\d+$';
  perform setval('public.expense_number_seq', greatest(max_exp, 1), max_exp > 0);

  select coalesce(max((regexp_match(vendor_number, '^VND-(\d+)$'))[1]::bigint), 0)
    into max_vnd
  from public.expense_vendors
  where vendor_number ~ '^VND-\d+$';
  perform setval('public.expense_vendor_number_seq', greatest(max_vnd, 1), max_vnd > 0);
end $$;

create or replace function public.ensure_unique_expense_number()
returns trigger
language plpgsql
as $$
declare
  candidate text;
begin
  if new.expense_number is null
     or btrim(new.expense_number) = ''
     or exists (
       select 1 from public.expenses e
       where e.expense_number = new.expense_number
         and e.id is distinct from new.id
     ) then
    loop
      candidate := 'EXP-' || lpad(nextval('public.expense_number_seq')::text, 6, '0');
      exit when not exists (select 1 from public.expenses e where e.expense_number = candidate);
    end loop;
    new.expense_number := candidate;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_unique_expense_number on public.expenses;
create trigger trg_ensure_unique_expense_number
before insert or update of expense_number on public.expenses
for each row execute function public.ensure_unique_expense_number();

create or replace function public.ensure_unique_expense_vendor_number()
returns trigger
language plpgsql
as $$
declare
  candidate text;
begin
  if new.vendor_number is null
     or btrim(new.vendor_number) = ''
     or exists (
       select 1 from public.expense_vendors v
       where v.vendor_number = new.vendor_number
         and v.id is distinct from new.id
     ) then
    loop
      candidate := 'VND-' || lpad(nextval('public.expense_vendor_number_seq')::text, 6, '0');
      exit when not exists (select 1 from public.expense_vendors v where v.vendor_number = candidate);
    end loop;
    new.vendor_number := candidate;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_unique_expense_vendor_number on public.expense_vendors;
create trigger trg_ensure_unique_expense_vendor_number
before insert or update of vendor_number on public.expense_vendors
for each row execute function public.ensure_unique_expense_vendor_number();
