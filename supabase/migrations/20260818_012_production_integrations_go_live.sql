-- Part 15: Production integration and go-live preparation.
-- Adds stricter operational indexes/policies for server-side integrations without disabling RLS.

alter table public.payment_gateway_events
  add column if not exists provider_transaction_id text default '',
  add column if not exists failure_reason text default '';

create index if not exists payment_gateway_events_payment_idx
  on public.payment_gateway_events(payment_id, received_at desc);

create unique index if not exists receipts_payment_unique
  on public.receipts(payment_id);

create index if not exists communication_delivery_logs_status_idx
  on public.communication_delivery_logs(status, created_at desc);

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
  payment_row public.payments%rowtype;
  invoice_row public.invoices%rowtype;
  next_paid integer;
  next_balance integer;
  receipt_no text;
begin
  if exists (
    select 1 from public.payment_gateway_events
    where provider = p_provider and event_id = p_event_id
  ) then
    return jsonb_build_object('processed', false, 'reason', 'duplicate_event');
  end if;

  select * into payment_row
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment record not found.';
  end if;

  if p_status = 'completed' and p_amount_cents is null then
    raise exception 'Completed payment webhooks must include the verified provider amount.';
  end if;

  if p_status = 'completed' and p_amount_cents <> payment_row.amount_cents then
    insert into public.payment_gateway_events (id, provider, event_id, payment_id, status, provider_transaction_id, failure_reason)
    values (gen_random_uuid()::text, p_provider, p_event_id, p_payment_id, 'amount_mismatch', p_transaction_id, 'Webhook amount does not match payment record.');
    return jsonb_build_object('processed', false, 'reason', 'amount_mismatch');
  end if;

  insert into public.payment_gateway_events (id, provider, event_id, payment_id, status, provider_transaction_id)
  values (gen_random_uuid()::text, p_provider, p_event_id, p_payment_id, p_status, coalesce(p_transaction_id, ''));

  if payment_row.status = 'completed' then
    return jsonb_build_object('processed', false, 'reason', 'payment_already_completed');
  end if;

  if p_status <> 'completed' then
    update public.payments
    set status = 'failed',
        gateway_provider = p_provider,
        gateway_transaction_id = coalesce(p_transaction_id, ''),
        verified_by = p_provider,
        verified_at = now()
    where id = p_payment_id;

    return jsonb_build_object('processed', true, 'status', 'failed');
  end if;

  select * into invoice_row
  from public.invoices
  where id::text = payment_row.invoice_id
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
  where id = p_payment_id;

  insert into public.payment_allocations (id, payment_id, invoice_id, amount_cents)
  values (gen_random_uuid()::text, p_payment_id, payment_row.invoice_id, payment_row.amount_cents)
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
    p_payment_id,
    payment_row.patient_id,
    array[payment_row.invoice_id],
    payment_row.branch_id,
    payment_row.amount_cents,
    next_balance,
    p_provider
  )
  on conflict (payment_id) do nothing;

  return jsonb_build_object('processed', true, 'status', 'completed');
end;
$$;

drop policy if exists "communication_outbox_authenticated" on public.communication_outbox;
drop policy if exists "communication_outbox_read_authorized" on public.communication_outbox;
drop policy if exists "communication_outbox_write_authorized" on public.communication_outbox;

create policy "communication_outbox_read_authorized"
on public.communication_outbox for select
using (
  auth.role() = 'authenticated'
  and (
    public.is_management_role()
    or public.has_profile_permission('communications.manage'::text)
    or public.has_profile_permission('system_admin.view'::text)
  )
);

create policy "communication_outbox_write_authorized"
on public.communication_outbox for all
using (
  auth.role() = 'authenticated'
  and (
    public.is_management_role()
    or public.has_profile_permission('communications.manage'::text)
    or public.has_profile_permission('system_admin.manage'::text)
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_management_role()
    or public.has_profile_permission('communications.manage'::text)
    or public.has_profile_permission('system_admin.manage'::text)
  )
);

drop policy if exists "payment_gateway_events_internal" on public.payment_gateway_events;
drop policy if exists "payment_gateway_events_read_authorized" on public.payment_gateway_events;
drop policy if exists "payment_gateway_events_write_authorized" on public.payment_gateway_events;

create policy "payment_gateway_events_read_authorized"
on public.payment_gateway_events for select
using (
  auth.role() = 'authenticated'
  and (
    public.is_management_role()
    or public.has_profile_permission('payments.verify'::text)
    or public.has_profile_permission('system_admin.view'::text)
  )
);

create policy "payment_gateway_events_write_authorized"
on public.payment_gateway_events for all
using (
  auth.role() = 'authenticated'
  and (
    public.is_management_role()
    or public.has_profile_permission('payments.verify'::text)
    or public.has_profile_permission('system_admin.manage'::text)
  )
)
with check (
  auth.role() = 'authenticated'
  and (
    public.is_management_role()
    or public.has_profile_permission('payments.verify'::text)
    or public.has_profile_permission('system_admin.manage'::text)
  )
);
