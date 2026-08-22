alter policy charges_read_self_or_internal on public.charges to authenticated;
alter policy charges_write_internal on public.charges to authenticated;
alter policy payment_allocations_read_self_or_internal on public.payment_allocations to authenticated;
alter policy payment_allocations_write_internal on public.payment_allocations to authenticated;
alter policy receipts_read_self_or_internal on public.receipts to authenticated;
alter policy receipts_write_internal on public.receipts to authenticated;
alter policy refunds_read_self_or_internal on public.refunds to authenticated;
alter policy refunds_write_internal on public.refunds to authenticated;