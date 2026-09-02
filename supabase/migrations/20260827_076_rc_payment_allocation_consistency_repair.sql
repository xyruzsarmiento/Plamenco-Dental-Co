-- Release-candidate data integrity repair.
-- Repair persisted completed payment headers whose allocation rows already prove
-- the allocated amount. This does not create payments, receipts, or allocations.

create or replace function public.rc_repair_payment_allocation_consistency_once()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  repaired_count integer := 0;
begin
  with allocation_totals as (
    select
      payment_id,
      sum(amount_cents)::integer as allocated_cents
    from public.payment_allocations
    group by payment_id
  ),
  repaired as (
    update public.payments p
    set allocated_cents = a.allocated_cents,
        updated_at = now()
    from allocation_totals a
    where p.id::text = a.payment_id
      and p.status in ('completed', 'partially_refunded', 'refunded')
      and p.allocated_cents is distinct from a.allocated_cents
    returning p.id, p.payment_number, p.allocated_cents
  ),
  logged as (
    insert into public.audit_logs(user_name, action, entity, entity_id, metadata)
    select
      'system',
      'rc_payment_allocation_consistency_repair',
      'payment',
      id::text,
      jsonb_build_object(
        'paymentNumber', payment_number,
        'allocatedCents', allocated_cents,
        'source', 'payment_allocations'
      )
    from repaired
    returning 1
  )
  select count(*) into repaired_count from logged;

  return repaired_count;
end;
$$;

select public.rc_repair_payment_allocation_consistency_once();

drop function public.rc_repair_payment_allocation_consistency_once();
