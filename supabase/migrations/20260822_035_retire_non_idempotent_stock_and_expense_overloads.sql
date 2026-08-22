revoke all on function public.post_stock_movement(text,text,text,numeric,text,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.post_stock_movement(text,text,text,numeric,text,text,text,text,text,integer) to service_role;

revoke all on function public.record_expense_payment(text,integer,date,text,text,text,text) from public, anon, authenticated;
grant execute on function public.record_expense_payment(text,integer,date,text,text,text,text) to service_role;
