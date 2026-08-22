alter table public.payments add column if not exists client_request_id uuid;
alter table public.invoices add column if not exists client_request_id uuid;
alter table public.refunds add column if not exists client_request_id uuid;

create unique index if not exists payments_client_request_id_key on public.payments(client_request_id) where client_request_id is not null;
create unique index if not exists invoices_client_request_id_key on public.invoices(client_request_id) where client_request_id is not null;
create unique index if not exists refunds_client_request_id_key on public.refunds(client_request_id) where client_request_id is not null;
create unique index if not exists payments_payment_number_key on public.payments(payment_number) where payment_number is not null;
create unique index if not exists payment_allocations_payment_invoice_key on public.payment_allocations(payment_id, invoice_id);
create unique index if not exists receipts_payment_id_key on public.receipts(payment_id);

create sequence if not exists public.refund_number_seq;

create or replace function public.next_refund_number()
returns text
language plpgsql
set search_path = public
as $$
declare
  next_value bigint;
begin
  select nextval('public.refund_number_seq') into next_value;
  return 'REF-' || lpad(next_value::text, 6, '0');
end;
$$;

create or replace function public.record_manual_payment(
  p_invoice_id uuid,
  p_amount_cents integer,
  p_payment_method text,
  p_payment_date date,
  p_reference_number text default '',
  p_notes text default '',
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_allocation public.payment_allocations%rowtype;
  v_receipt public.receipts%rowtype;
  v_method public.payment_methods%rowtype;
  v_next_paid integer;
  v_next_balance integer;
  v_existing_payment public.payments%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if not public.has_profile_permission('payments.record_manual') then raise exception 'Not authorized to record payments.' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'A client request id is required.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Payment amount must be greater than zero.'; end if;
  if p_payment_date is null then raise exception 'Payment date is required.'; end if;

  select coalesce(nullif(full_name,''), nullif(email,''), v_uid::text) into v_actor
  from public.profiles where id = v_uid and status = 'active';
  if v_actor is null then raise exception 'Active clinic profile required.' using errcode = '42501'; end if;

  select * into v_method from public.payment_methods where id = p_payment_method and active = true;
  if not found then raise exception 'Selected payment method is not available.'; end if;
  if v_method.is_online then raise exception 'Online gateway payments cannot be recorded through the manual payment endpoint.'; end if;
  if v_method.requires_reference and nullif(trim(coalesce(p_reference_number,'')), '') is null then
    raise exception 'A reference number is required for this payment method.';
  end if;

  select * into v_existing_payment from public.payments where client_request_id = p_client_request_id;
  if found then
    select * into v_allocation from public.payment_allocations where payment_id = v_existing_payment.id::text and invoice_id = v_existing_payment.invoice_id::text limit 1;
    select * into v_receipt from public.receipts where payment_id = v_existing_payment.id::text limit 1;
    select * into v_invoice from public.invoices where id = v_existing_payment.invoice_id;
    return jsonb_build_object('duplicate', true, 'payment', to_jsonb(v_existing_payment), 'allocation', to_jsonb(v_allocation), 'receipt', to_jsonb(v_receipt), 'invoice', to_jsonb(v_invoice));
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if v_invoice.status = 'void' then raise exception 'Payments cannot be applied to a void invoice.'; end if;
  if v_invoice.balance_cents <= 0 then raise exception 'This invoice has no outstanding balance.'; end if;
  if p_amount_cents > v_invoice.balance_cents then raise exception 'Payment amount exceeds the outstanding invoice balance.'; end if;
  if v_invoice.branch_id is not null and not public.profile_has_active_branch(v_invoice.branch_id) then
    raise exception 'Not authorized for this invoice branch.' using errcode = '42501';
  end if;

  insert into public.payments(
    patient_id, invoice_id, amount_cents, payment_method, payment_date, reference_number,
    recorded_by, payment_number, branch_id, allocated_cents, refundable_cents,
    source, status, notes, client_request_id
  ) values (
    v_invoice.patient_id, v_invoice.id, p_amount_cents, p_payment_method, p_payment_date,
    nullif(trim(coalesce(p_reference_number,'')), ''), v_actor, public.next_payment_number(),
    v_invoice.branch_id, p_amount_cents, p_amount_cents, 'manual', 'completed', coalesce(p_notes,''), p_client_request_id
  ) returning * into v_payment;

  v_next_paid := v_invoice.amount_paid_cents + p_amount_cents;
  v_next_balance := v_invoice.total_cents - v_next_paid;
  if v_next_balance < 0 then raise exception 'Payment would create a negative invoice balance.'; end if;

  update public.invoices
  set amount_paid_cents = v_next_paid,
      balance_cents = v_next_balance,
      status = case when v_next_balance = 0 then 'paid' else 'partially_paid' end,
      updated_at = now()
  where id = v_invoice.id
  returning * into v_invoice;

  insert into public.payment_allocations(id, payment_id, invoice_id, amount_cents)
  values (gen_random_uuid()::text, v_payment.id::text, v_invoice.id::text, p_amount_cents)
  returning * into v_allocation;

  insert into public.receipts(
    id, receipt_number, payment_id, patient_id, invoice_ids, branch_id,
    amount_cents, remaining_balance_cents, issued_by
  ) values (
    gen_random_uuid()::text, public.next_receipt_number(), v_payment.id::text,
    v_payment.patient_id::text, array[v_invoice.id::text], v_invoice.branch_id,
    p_amount_cents, v_next_balance, v_actor
  ) returning * into v_receipt;

  insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
  values (v_actor, 'payment_recorded', 'payment', v_payment.id::text,
    jsonb_build_object('invoiceId', v_invoice.id, 'paymentNumber', v_payment.payment_number, 'amountCents', p_amount_cents, 'branchId', v_invoice.branch_id));

  return jsonb_build_object('duplicate', false, 'payment', to_jsonb(v_payment), 'allocation', to_jsonb(v_allocation), 'receipt', to_jsonb(v_receipt), 'invoice', to_jsonb(v_invoice));
exception
  when unique_violation then
    if p_client_request_id is not null then
      select * into v_existing_payment from public.payments where client_request_id = p_client_request_id;
      if found then
        select * into v_allocation from public.payment_allocations where payment_id = v_existing_payment.id::text and invoice_id = v_existing_payment.invoice_id::text limit 1;
        select * into v_receipt from public.receipts where payment_id = v_existing_payment.id::text limit 1;
        select * into v_invoice from public.invoices where id = v_existing_payment.invoice_id;
        return jsonb_build_object('duplicate', true, 'payment', to_jsonb(v_existing_payment), 'allocation', to_jsonb(v_allocation), 'receipt', to_jsonb(v_receipt), 'invoice', to_jsonb(v_invoice));
      end if;
    end if;
    raise;
end;
$$;

create or replace function public.create_invoice_from_items(
  p_patient_id uuid,
  p_branch_id text,
  p_invoice_date date,
  p_due_date date,
  p_items jsonb,
  p_notes text default '',
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
  v_patient public.patients%rowtype;
  v_invoice public.invoices%rowtype;
  v_existing public.invoices%rowtype;
  v_item jsonb;
  v_normalized_items jsonb := '[]'::jsonb;
  v_description text;
  v_item_id text;
  v_charge_id text;
  v_quantity integer;
  v_unit integer;
  v_discount integer;
  v_subtotal integer := 0;
  v_discount_total integer := 0;
  v_total integer := 0;
  v_charge public.charges%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if not public.has_profile_permission('billing.create') then raise exception 'Not authorized to create invoices.' using errcode='42501'; end if;
  if p_client_request_id is null then raise exception 'A client request id is required.'; end if;
  if p_invoice_date is null then raise exception 'Invoice date is required.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Invoice must include at least one item.'; end if;

  select coalesce(nullif(full_name,''), nullif(email,''), v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';
  if v_actor is null then raise exception 'Active clinic profile required.' using errcode='42501'; end if;
  if p_branch_id is not null and not public.profile_has_active_branch(p_branch_id) then raise exception 'Not authorized for this invoice branch.' using errcode='42501'; end if;

  select * into v_existing from public.invoices where client_request_id=p_client_request_id;
  if found then return jsonb_build_object('duplicate',true,'invoice',to_jsonb(v_existing)); end if;

  select * into v_patient from public.patients where id=p_patient_id;
  if not found then raise exception 'Patient not found.'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_description := trim(coalesce(v_item->>'description',''));
    v_quantity := coalesce((v_item->>'quantity')::integer,0);
    v_unit := coalesce((v_item->>'unitPriceCents')::integer,0);
    v_discount := coalesce((v_item->>'discountCents')::integer,0);
    v_item_id := coalesce(nullif(v_item->>'id',''), gen_random_uuid()::text);
    v_charge_id := nullif(v_item->>'chargeId','');

    if v_description='' then raise exception 'Each invoice item requires a description.'; end if;
    if v_quantity <= 0 then raise exception 'Invoice item quantity must be positive.'; end if;
    if v_unit < 0 or v_discount < 0 then raise exception 'Invoice item amounts cannot be negative.'; end if;
    if v_discount > v_quantity * v_unit then raise exception 'Invoice item discount exceeds its subtotal.'; end if;

    if v_charge_id is not null then
      select * into v_charge from public.charges where id=v_charge_id for update;
      if not found then raise exception 'Referenced charge not found.'; end if;
      if v_charge.status <> 'unbilled' then raise exception 'A referenced charge has already been invoiced or voided.'; end if;
      if v_charge.patient_id not in (v_patient.id::text, v_patient.patient_id) then raise exception 'Referenced charge belongs to another patient.'; end if;
      if p_branch_id is not null and v_charge.branch_id is not null and v_charge.branch_id <> p_branch_id then raise exception 'Referenced charge belongs to another branch.'; end if;
      v_quantity := v_charge.quantity;
      v_unit := v_charge.unit_price_cents;
      v_discount := v_charge.discount_cents;
      v_description := v_charge.description;
    end if;

    v_subtotal := v_subtotal + (v_quantity * v_unit);
    v_discount_total := v_discount_total + v_discount;
    v_normalized_items := v_normalized_items || jsonb_build_array(jsonb_build_object(
      'id',v_item_id,'chargeId',v_charge_id,'treatmentId',v_item->>'treatmentId','serviceId',v_item->>'serviceId',
      'providerId',v_item->>'providerId','providerNameSnapshot',coalesce(v_item->>'providerNameSnapshot',''),
      'branchId',coalesce(v_item->>'branchId',p_branch_id),'description',v_description,'quantity',v_quantity,
      'unitPriceCents',v_unit,'discountCents',v_discount,'discountReason',coalesce(v_item->>'discountReason',''),
      'amountCents',(v_quantity*v_unit)-v_discount
    ));
  end loop;

  v_total := v_subtotal - v_discount_total;
  if v_total < 0 then raise exception 'Invoice total cannot be negative.'; end if;

  insert into public.invoices(
    invoice_number,patient_id,branch_id,invoice_date,due_date,items,subtotal_cents,discount_cents,
    total_cents,amount_paid_cents,balance_cents,status,notes,created_by,client_request_id
  ) values (
    public.next_invoice_number(),v_patient.id,p_branch_id,p_invoice_date,p_due_date,v_normalized_items,
    v_subtotal,v_discount_total,v_total,0,v_total,case when v_total=0 then 'paid' else 'unpaid' end,
    coalesce(p_notes,''),v_actor,p_client_request_id
  ) returning * into v_invoice;

  update public.charges
  set status='invoiced', invoice_id=v_invoice.id::text, updated_at=now()
  where id in (select nullif(value->>'chargeId','') from jsonb_array_elements(v_normalized_items))
    and nullif(id,'') is not null;

  insert into public.audit_logs(user_name,action,entity,entity_id,metadata)
  values(v_actor,'invoice_created','invoice',v_invoice.id::text,jsonb_build_object('invoiceNumber',v_invoice.invoice_number,'patientId',v_patient.patient_id,'totalCents',v_total,'branchId',p_branch_id));

  return jsonb_build_object('duplicate',false,'invoice',to_jsonb(v_invoice));
exception
  when unique_violation then
    if p_client_request_id is not null then
      select * into v_existing from public.invoices where client_request_id=p_client_request_id;
      if found then return jsonb_build_object('duplicate',true,'invoice',to_jsonb(v_existing)); end if;
    end if;
    raise;
end;
$$;

create or replace function public.apply_invoice_discount(
  p_invoice_id uuid,
  p_item_id text,
  p_discount_type text,
  p_value_cents integer default null,
  p_percentage numeric default null,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
  v_invoice public.invoices%rowtype;
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_found boolean := false;
  v_qty integer;
  v_unit integer;
  v_sub integer;
  v_disc integer;
  v_subtotal integer := 0;
  v_discount_total integer := 0;
  v_total integer;
begin
  if v_uid is null or not public.has_profile_permission('billing.apply_discount') then raise exception 'Not authorized to apply discounts.' using errcode='42501'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Discount reason is required.'; end if;
  if p_discount_type not in ('fixed','percentage') then raise exception 'Invalid discount type.'; end if;
  if p_discount_type='fixed' and coalesce(p_value_cents,-1) < 0 then raise exception 'Fixed discount cannot be negative.'; end if;
  if p_discount_type='percentage' and (p_percentage is null or p_percentage < 0 or p_percentage > 100) then raise exception 'Discount percentage must be between 0 and 100.'; end if;

  select coalesce(nullif(full_name,''),nullif(email,''),v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if v_invoice.status in ('void','paid') then raise exception 'Discounts cannot be applied to a void or fully paid invoice.'; end if;
  if v_invoice.branch_id is not null and not public.profile_has_active_branch(v_invoice.branch_id) then raise exception 'Not authorized for this invoice branch.' using errcode='42501'; end if;

  for v_item in select value from jsonb_array_elements(v_invoice.items)
  loop
    v_qty := coalesce((v_item->>'quantity')::integer,1);
    v_unit := coalesce((v_item->>'unitPriceCents')::integer,0);
    v_sub := v_qty*v_unit;
    if v_item->>'id'=p_item_id then
      v_found := true;
      v_disc := case when p_discount_type='percentage' then round(v_sub*p_percentage/100.0)::integer else least(p_value_cents,v_sub) end;
      v_item := jsonb_set(jsonb_set(v_item,'{discountCents}',to_jsonb(v_disc),true),'{discountReason}',to_jsonb(p_reason),true);
      v_item := jsonb_set(v_item,'{amountCents}',to_jsonb(v_sub-v_disc),true);
    else
      v_disc := coalesce((v_item->>'discountCents')::integer,0);
    end if;
    v_subtotal := v_subtotal+v_sub;
    v_discount_total := v_discount_total+v_disc;
    v_items := v_items || jsonb_build_array(v_item);
  end loop;
  if not v_found then raise exception 'Invoice item not found.'; end if;
  v_total := v_subtotal-v_discount_total;
  if v_total < v_invoice.amount_paid_cents then raise exception 'Discount would reduce the invoice below the amount already paid.'; end if;

  update public.invoices set items=v_items,subtotal_cents=v_subtotal,discount_cents=v_discount_total,total_cents=v_total,
    balance_cents=v_total-amount_paid_cents,status=case when v_total-amount_paid_cents=0 then 'paid' when amount_paid_cents>0 then 'partially_paid' else 'unpaid' end,updated_at=now()
  where id=v_invoice.id returning * into v_invoice;

  insert into public.audit_logs(user_name,action,entity,entity_id,metadata)
  values(v_actor,'discount_applied','invoice',v_invoice.id::text,jsonb_build_object('itemId',p_item_id,'reason',p_reason,'discountType',p_discount_type));
  return to_jsonb(v_invoice);
end;
$$;

create or replace function public.void_invoice(p_invoice_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
  v_invoice public.invoices%rowtype;
begin
  if v_uid is null or not public.has_profile_permission('billing.void_invoice') then raise exception 'Not authorized to void invoices.' using errcode='42501'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Void reason is required.'; end if;
  select coalesce(nullif(full_name,''),nullif(email,''),v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';
  select * into v_invoice from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found.'; end if;
  if v_invoice.status='void' then return to_jsonb(v_invoice); end if;
  if v_invoice.amount_paid_cents>0 then raise exception 'Paid invoices must be refunded or reversed before voiding.'; end if;
  if v_invoice.branch_id is not null and not public.profile_has_active_branch(v_invoice.branch_id) then raise exception 'Not authorized for this invoice branch.' using errcode='42501'; end if;
  update public.invoices set status='void',balance_cents=0,void_reason=p_reason,voided_by=v_actor,voided_at=now(),updated_at=now() where id=v_invoice.id returning * into v_invoice;
  update public.charges set status='unbilled',invoice_id=null,updated_at=now() where invoice_id=v_invoice.id::text and status='invoiced';
  insert into public.audit_logs(user_name,action,entity,entity_id,metadata) values(v_actor,'invoice_voided','invoice',v_invoice.id::text,jsonb_build_object('reason',p_reason));
  return to_jsonb(v_invoice);
end;
$$;

create or replace function public.record_payment_refund(
  p_payment_id uuid,
  p_amount_cents integer,
  p_reason text,
  p_gateway_refund_id text default '',
  p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_refund public.refunds%rowtype;
  v_existing public.refunds%rowtype;
  v_new_refundable integer;
  v_new_paid integer;
  v_new_balance integer;
begin
  if v_uid is null or not public.has_profile_permission('payments.refund') then raise exception 'Not authorized to refund payments.' using errcode='42501'; end if;
  if p_client_request_id is null then raise exception 'A client request id is required.'; end if;
  if p_amount_cents is null or p_amount_cents<=0 then raise exception 'Refund amount must be greater than zero.'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Refund reason is required.'; end if;
  select coalesce(nullif(full_name,''),nullif(email,''),v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';

  select * into v_existing from public.refunds where client_request_id=p_client_request_id;
  if found then
    select * into v_payment from public.payments where id=v_existing.payment_id::uuid;
    select * into v_invoice from public.invoices where id=v_payment.invoice_id;
    return jsonb_build_object('duplicate',true,'refund',to_jsonb(v_existing),'payment',to_jsonb(v_payment),'invoice',to_jsonb(v_invoice));
  end if;

  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;
  if v_payment.status not in ('completed','partially_refunded') then raise exception 'Only completed payments can be refunded.'; end if;
  if p_amount_cents>v_payment.refundable_cents then raise exception 'Refund amount exceeds the refundable amount.'; end if;
  if v_payment.branch_id is not null and not public.profile_has_active_branch(v_payment.branch_id) then raise exception 'Not authorized for this payment branch.' using errcode='42501'; end if;

  select * into v_invoice from public.invoices where id=v_payment.invoice_id for update;
  if not found then raise exception 'Related invoice not found.'; end if;

  v_new_refundable := v_payment.refundable_cents-p_amount_cents;
  v_new_paid := greatest(0,v_invoice.amount_paid_cents-p_amount_cents);
  v_new_balance := v_invoice.total_cents-v_new_paid;

  insert into public.refunds(id,refund_number,payment_id,patient_id,branch_id,amount_cents,reason,status,processed_by,processed_at,gateway_refund_id,client_request_id)
  values(gen_random_uuid()::text,public.next_refund_number(),v_payment.id::text,v_payment.patient_id::text,v_payment.branch_id,p_amount_cents,p_reason,'completed',v_actor,now(),coalesce(p_gateway_refund_id,''),p_client_request_id)
  returning * into v_refund;

  update public.payments set refundable_cents=v_new_refundable,status=case when v_new_refundable=0 then 'refunded' else 'partially_refunded' end where id=v_payment.id returning * into v_payment;
  update public.invoices set amount_paid_cents=v_new_paid,balance_cents=v_new_balance,
    status=case when v_new_paid=0 then 'refunded' else 'partially_refunded' end,updated_at=now()
  where id=v_invoice.id returning * into v_invoice;

  insert into public.audit_logs(user_name,action,entity,entity_id,metadata)
  values(v_actor,'refund_completed','refund',v_refund.id,jsonb_build_object('paymentId',v_payment.id,'invoiceId',v_invoice.id,'amountCents',p_amount_cents,'reason',p_reason));
  return jsonb_build_object('duplicate',false,'refund',to_jsonb(v_refund),'payment',to_jsonb(v_payment),'invoice',to_jsonb(v_invoice));
exception
  when unique_violation then
    if p_client_request_id is not null then
      select * into v_existing from public.refunds where client_request_id=p_client_request_id;
      if found then
        select * into v_payment from public.payments where id=v_existing.payment_id::uuid;
        select * into v_invoice from public.invoices where id=v_payment.invoice_id;
        return jsonb_build_object('duplicate',true,'refund',to_jsonb(v_existing),'payment',to_jsonb(v_payment),'invoice',to_jsonb(v_invoice));
      end if;
    end if;
    raise;
end;
$$;

revoke all on function public.record_manual_payment(uuid,integer,text,date,text,text,uuid) from public, anon;
revoke all on function public.create_invoice_from_items(uuid,text,date,date,jsonb,text,uuid) from public, anon;
revoke all on function public.apply_invoice_discount(uuid,text,text,integer,numeric,text) from public, anon;
revoke all on function public.void_invoice(uuid,text) from public, anon;
revoke all on function public.record_payment_refund(uuid,integer,text,text,uuid) from public, anon;
grant execute on function public.record_manual_payment(uuid,integer,text,date,text,text,uuid) to authenticated;
grant execute on function public.create_invoice_from_items(uuid,text,date,date,jsonb,text,uuid) to authenticated;
grant execute on function public.apply_invoice_discount(uuid,text,text,integer,numeric,text) to authenticated;
grant execute on function public.void_invoice(uuid,text) to authenticated;
grant execute on function public.record_payment_refund(uuid,integer,text,text,uuid) to authenticated;
