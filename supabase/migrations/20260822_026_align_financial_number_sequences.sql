create sequence if not exists public.invoice_number_seq;
create sequence if not exists public.payment_number_seq;
create sequence if not exists public.receipt_number_seq;
create sequence if not exists public.refund_number_seq;

do $$
declare
  v_max bigint;
begin
  select coalesce(max((regexp_match(invoice_number,'(\d+)$'))[1]::bigint),0) into v_max from public.invoices;
  perform setval('public.invoice_number_seq', greatest(v_max,1), v_max>0);

  select coalesce(max((regexp_match(payment_number,'(\d+)$'))[1]::bigint),0) into v_max from public.payments where payment_number is not null;
  perform setval('public.payment_number_seq', greatest(v_max,1), v_max>0);

  select coalesce(max((regexp_match(receipt_number,'(\d+)$'))[1]::bigint),0) into v_max from public.receipts;
  perform setval('public.receipt_number_seq', greatest(v_max,1), v_max>0);

  select coalesce(max((regexp_match(refund_number,'(\d+)$'))[1]::bigint),0) into v_max from public.refunds;
  perform setval('public.refund_number_seq', greatest(v_max,1), v_max>0);
end;
$$;