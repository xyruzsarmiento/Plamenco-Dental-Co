create or replace function public.verify_submitted_payment(p_payment_id uuid)
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
  v_allocation public.payment_allocations%rowtype;
  v_receipt public.receipts%rowtype;
  v_next_paid integer;
  v_next_balance integer;
begin
  if v_uid is null or not public.has_any_profile_permission(array['payments.verify','payments.confirm']) then
    raise exception 'Not authorized to verify payments.' using errcode='42501';
  end if;
  select coalesce(nullif(full_name,''),nullif(email,''),v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';
  if v_actor is null then raise exception 'Active clinic profile required.' using errcode='42501'; end if;

  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;
  if v_payment.status='completed' then
    select * into v_invoice from public.invoices where id=v_payment.invoice_id;
    select * into v_allocation from public.payment_allocations where payment_id=v_payment.id::text and invoice_id=v_payment.invoice_id::text limit 1;
    select * into v_receipt from public.receipts where payment_id=v_payment.id::text limit 1;
    return jsonb_build_object('duplicate',true,'payment',to_jsonb(v_payment),'invoice',to_jsonb(v_invoice),'allocation',to_jsonb(v_allocation),'receipt',to_jsonb(v_receipt));
  end if;
  if v_payment.status not in ('pending','pending_verification','processing') then raise exception 'This payment is not awaiting verification.'; end if;
  if v_payment.branch_id is not null and not public.profile_has_active_branch(v_payment.branch_id) then raise exception 'Not authorized for this payment branch.' using errcode='42501'; end if;

  select * into v_invoice from public.invoices where id=v_payment.invoice_id for update;
  if not found then raise exception 'Related invoice not found.'; end if;
  if v_invoice.status='void' or v_payment.amount_cents>v_invoice.balance_cents then raise exception 'Payment cannot be applied to the current invoice balance.'; end if;

  v_next_paid := v_invoice.amount_paid_cents + v_payment.amount_cents;
  v_next_balance := v_invoice.total_cents - v_next_paid;
  if v_next_balance < 0 then raise exception 'Payment would create a negative invoice balance.'; end if;

  update public.payments set status='completed',allocated_cents=amount_cents,refundable_cents=amount_cents,
    verified_by=v_actor,verified_at=now(),rejection_reason_internal='',rejection_reason_patient=''
  where id=v_payment.id returning * into v_payment;

  insert into public.payment_allocations(id,payment_id,invoice_id,amount_cents)
  values(gen_random_uuid()::text,v_payment.id::text,v_invoice.id::text,v_payment.amount_cents)
  on conflict(payment_id,invoice_id) do update set amount_cents=excluded.amount_cents
  returning * into v_allocation;

  update public.invoices set amount_paid_cents=v_next_paid,balance_cents=v_next_balance,
    status=case when v_next_balance=0 then 'paid' else 'partially_paid' end,updated_at=now()
  where id=v_invoice.id returning * into v_invoice;

  insert into public.receipts(id,receipt_number,payment_id,patient_id,invoice_ids,branch_id,amount_cents,remaining_balance_cents,issued_by)
  values(gen_random_uuid()::text,public.next_receipt_number(),v_payment.id::text,v_payment.patient_id::text,array[v_invoice.id::text],v_payment.branch_id,v_payment.amount_cents,v_next_balance,v_actor)
  on conflict(payment_id) do update set remaining_balance_cents=excluded.remaining_balance_cents
  returning * into v_receipt;

  insert into public.audit_logs(user_name,action,entity,entity_id,metadata)
  values(v_actor,'payment_approved','payment',v_payment.id::text,jsonb_build_object('invoiceId',v_invoice.id,'amountCents',v_payment.amount_cents));
  return jsonb_build_object('duplicate',false,'payment',to_jsonb(v_payment),'invoice',to_jsonb(v_invoice),'allocation',to_jsonb(v_allocation),'receipt',to_jsonb(v_receipt));
end;
$$;

create or replace function public.reject_submitted_payment(p_payment_id uuid,p_internal_reason text,p_patient_reason text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor text;
  v_payment public.payments%rowtype;
begin
  if v_uid is null or not public.has_profile_permission('payments.reject') then raise exception 'Not authorized to reject payments.' using errcode='42501'; end if;
  if trim(coalesce(p_internal_reason,''))='' then raise exception 'Rejection reason is required.'; end if;
  select coalesce(nullif(full_name,''),nullif(email,''),v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';
  if v_actor is null then raise exception 'Active clinic profile required.' using errcode='42501'; end if;
  select * into v_payment from public.payments where id=p_payment_id for update;
  if not found then raise exception 'Payment not found.'; end if;
  if v_payment.status='rejected' then return jsonb_build_object('duplicate',true,'payment',to_jsonb(v_payment)); end if;
  if v_payment.status not in ('pending','pending_verification','processing') then raise exception 'This payment is not awaiting review.'; end if;
  if v_payment.branch_id is not null and not public.profile_has_active_branch(v_payment.branch_id) then raise exception 'Not authorized for this payment branch.' using errcode='42501'; end if;
  update public.payments set status='rejected',verified_by=v_actor,verified_at=now(),rejection_reason_internal=p_internal_reason,
    rejection_reason_patient=coalesce(p_patient_reason,'') where id=v_payment.id returning * into v_payment;
  insert into public.audit_logs(user_name,action,entity,entity_id,metadata)
  values(v_actor,'payment_rejected','payment',v_payment.id::text,jsonb_build_object('reason',p_internal_reason));
  return jsonb_build_object('duplicate',false,'payment',to_jsonb(v_payment));
end;
$$;

revoke all on function public.verify_submitted_payment(uuid) from public,anon;
revoke all on function public.reject_submitted_payment(uuid,text,text) from public,anon;
grant execute on function public.verify_submitted_payment(uuid) to authenticated;
grant execute on function public.reject_submitted_payment(uuid,text,text) to authenticated;