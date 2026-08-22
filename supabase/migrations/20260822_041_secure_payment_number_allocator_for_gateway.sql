create sequence if not exists public.payment_number_seq;

create or replace function public.next_payment_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_value bigint;
begin
  select nextval('public.payment_number_seq') into next_value;
  return 'PAY-' || lpad(next_value::text, 6, '0');
end;
$$;

revoke all on function public.next_payment_number() from public, anon, authenticated;
grant execute on function public.next_payment_number() to service_role;
