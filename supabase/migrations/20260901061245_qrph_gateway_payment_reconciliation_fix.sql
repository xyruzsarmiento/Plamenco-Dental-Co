-- Fix QR Ph gateway reconciliation where PayMongo succeeds but the clinic
-- ledger cannot post because text gateway ids are compared to UUID columns.

create or replace function public.apply_verified_gateway_payment(
  p_provider text,
  p_event_id text,
  p_payment_id text,
  p_status text,
  p_amount_cents integer,
  p_transaction_id text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_uuid uuid;
  payment_row public.payments%rowtype;
  invoice_row public.invoices%rowtype;
  next_paid integer;
  next_balance integer;
  receipt_no text;
begin
  begin
    v_payment_uuid := p_payment_id::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid payment reference.' using errcode = '22023';
  end;

  select * into payment_row
  from public.payments
  where id = v_payment_uuid
  for update;

  if not found then
    raise exception 'Payment record not found.';
  end if;

  if exists (
    select 1 from public.payment_gateway_events
    where provider = p_provider and event_id = p_event_id
  ) then
    return jsonb_build_object(
      'processed', false,
      'reason', 'duplicate_event',
      'status', payment_row.status,
      'completed', payment_row.status = 'completed',
      'paymentNumber', payment_row.payment_number
    );
  end if;

  if p_status = 'completed' and p_amount_cents is null then
    raise exception 'Completed payment webhooks must include the verified provider amount.';
  end if;

  if p_status = 'completed' and p_amount_cents <> payment_row.amount_cents then
    insert into public.payment_gateway_events (id, provider, event_id, payment_id, status, provider_transaction_id, failure_reason)
    values (gen_random_uuid()::text, p_provider, p_event_id, p_payment_id, 'amount_mismatch', coalesce(p_transaction_id, ''), 'Webhook amount does not match payment record.');
    return jsonb_build_object('processed', false, 'reason', 'amount_mismatch', 'status', payment_row.status, 'completed', false, 'paymentNumber', payment_row.payment_number);
  end if;

  insert into public.payment_gateway_events (id, provider, event_id, payment_id, status, provider_transaction_id)
  values (gen_random_uuid()::text, p_provider, p_event_id, p_payment_id, p_status, coalesce(p_transaction_id, ''));

  if payment_row.status = 'completed' then
    return jsonb_build_object('processed', false, 'reason', 'payment_already_completed', 'status', 'completed', 'completed', true, 'paymentNumber', payment_row.payment_number);
  end if;

  if p_status <> 'completed' then
    update public.payments
    set status = 'failed',
        gateway_provider = p_provider,
        gateway_transaction_id = coalesce(p_transaction_id, ''),
        verified_by = p_provider,
        verified_at = now()
    where id = v_payment_uuid
    returning * into payment_row;

    return jsonb_build_object('processed', true, 'status', 'failed', 'completed', false, 'paymentNumber', payment_row.payment_number);
  end if;

  select * into invoice_row
  from public.invoices
  where id = payment_row.invoice_id
  for update;

  if not found or invoice_row.status = 'void' or payment_row.amount_cents > invoice_row.balance_cents then
    raise exception 'Payment cannot be applied to the current invoice balance.';
  end if;

  update public.payments
  set status = 'completed',
      allocated_cents = payment_row.amount_cents,
      refundable_cents = payment_row.amount_cents,
      gateway_provider = p_provider,
      gateway_transaction_id = coalesce(p_transaction_id, ''),
      verified_by = p_provider,
      verified_at = now()
  where id = v_payment_uuid
  returning * into payment_row;

  insert into public.payment_allocations (id, payment_id, invoice_id, amount_cents)
  values (gen_random_uuid()::text, payment_row.id::text, payment_row.invoice_id::text, payment_row.amount_cents)
  on conflict do nothing;

  next_paid := invoice_row.amount_paid_cents + payment_row.amount_cents;
  next_balance := greatest(0, invoice_row.total_cents - next_paid);

  update public.invoices
  set amount_paid_cents = next_paid,
      balance_cents = next_balance,
      status = case when next_balance = 0 then 'paid' else 'partially_paid' end,
      updated_at = now()
  where id = invoice_row.id;

  receipt_no := public.next_receipt_number();
  insert into public.receipts (
    id,
    receipt_number,
    payment_id,
    patient_id,
    invoice_ids,
    branch_id,
    amount_cents,
    remaining_balance_cents,
    issued_by
  )
  values (
    gen_random_uuid()::text,
    receipt_no,
    payment_row.id::text,
    payment_row.patient_id::text,
    array[payment_row.invoice_id::text],
    payment_row.branch_id,
    payment_row.amount_cents,
    next_balance,
    p_provider
  )
  on conflict (payment_id) do nothing;

  return jsonb_build_object(
    'processed', true,
    'status', 'completed',
    'completed', true,
    'paymentNumber', payment_row.payment_number,
    'remainingBalanceCents', next_balance
  );
end;
$$;

revoke all on function public.apply_verified_gateway_payment(text,text,text,text,integer,text) from public, anon;
grant execute on function public.apply_verified_gateway_payment(text,text,text,text,integer,text) to authenticated;
