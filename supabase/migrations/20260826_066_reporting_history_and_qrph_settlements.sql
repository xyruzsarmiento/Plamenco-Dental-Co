-- Stabilization pass: authoritative historical report aggregates + QRPH settlement tracking.
-- This does not custody funds. Settlement rows record completed QRPH receipts moved to the clinic's bank/account.

create table if not exists public.qrph_settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_number text not null unique,
  branch_id text not null,
  settlement_date date not null,
  amount_cents bigint not null check (amount_cents > 0),
  destination_reference text not null,
  settlement_reference text not null,
  notes text not null default '',
  status text not null default 'recorded' check (status in ('recorded','void')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  voided_by uuid references public.profiles(id),
  voided_at timestamptz
);

create sequence if not exists public.qrph_settlement_number_seq;

alter table public.qrph_settlements enable row level security;

drop policy if exists qrph_settlements_super_admin_select on public.qrph_settlements;
create policy qrph_settlements_super_admin_select on public.qrph_settlements
for select to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.role = 'super_admin'));

revoke all on public.qrph_settlements from public, anon;
grant select on public.qrph_settlements to authenticated;

create or replace function public.record_qrph_settlement(
  p_branch_id text,
  p_settlement_date date,
  p_amount_cents bigint,
  p_destination_reference text,
  p_settlement_reference text,
  p_notes text default ''
) returns public.qrph_settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received bigint := 0;
  v_settled bigint := 0;
  v_row public.qrph_settlements;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active' and p.role = 'super_admin') then
    raise exception 'Only Super Admin can record QRPH settlements';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'Settlement amount must be greater than zero'; end if;
  if nullif(trim(p_branch_id), '') is null then raise exception 'Branch is required'; end if;
  if not exists (select 1 from public.branches b where b.id::text = p_branch_id and b.status = 'active') then raise exception 'Branch is invalid or inactive'; end if;
  if nullif(trim(p_destination_reference), '') is null or nullif(trim(p_settlement_reference), '') is null then raise exception 'Destination and settlement references are required'; end if;

  select coalesce(sum(pay.amount_cents),0)::bigint into v_received
  from public.payments pay
  where pay.payment_method = 'qrph' and pay.status = 'completed' and pay.branch_id = p_branch_id;

  select coalesce(sum(s.amount_cents),0)::bigint into v_settled
  from public.qrph_settlements s
  where s.branch_id = p_branch_id and s.status = 'recorded';

  if p_amount_cents > greatest(v_received - v_settled, 0) then
    raise exception 'Settlement amount exceeds completed unsettled QRPH collections';
  end if;

  insert into public.qrph_settlements (
    settlement_number, branch_id, settlement_date, amount_cents,
    destination_reference, settlement_reference, notes, created_by
  ) values (
    'QRPH-' || to_char(coalesce(p_settlement_date,current_date),'YYYYMM') || '-' || lpad(nextval('public.qrph_settlement_number_seq')::text, 6, '0'),
    p_branch_id, coalesce(p_settlement_date,current_date), p_amount_cents,
    trim(p_destination_reference), trim(p_settlement_reference), coalesce(p_notes,''), auth.uid()
  ) returning * into v_row;
  return v_row;
end
$$;

revoke all on function public.record_qrph_settlement(text,date,bigint,text,text,text) from public, anon;
grant execute on function public.record_qrph_settlement(text,date,bigint,text,text,text) to authenticated;

create or replace function public.get_qrph_settlement_summary(p_branch_id text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with allowed as (
    select exists(select 1 from public.profiles p where p.id=auth.uid() and p.status='active' and p.role='super_admin') ok
  ), received as (
    select coalesce(sum(amount_cents),0)::bigint amount
    from public.payments, allowed
    where allowed.ok and payment_method='qrph' and status='completed'
      and (p_branch_id is null or p_branch_id='all' or branch_id=p_branch_id)
  ), settled as (
    select coalesce(sum(amount_cents),0)::bigint amount
    from public.qrph_settlements, allowed
    where allowed.ok and status='recorded'
      and (p_branch_id is null or p_branch_id='all' or branch_id=p_branch_id)
  )
  select case when (select ok from allowed) then jsonb_build_object(
    'received_cents',(select amount from received),
    'settled_cents',(select amount from settled),
    'pending_cents',greatest((select amount from received)-(select amount from settled),0)
  ) else jsonb_build_object('error','not authorized') end
$$;

revoke all on function public.get_qrph_settlement_summary(text) from public, anon;
grant execute on function public.get_qrph_settlement_summary(text) to authenticated;

create or replace function public.get_management_report_v129(
  p_start_date date,
  p_end_date date,
  p_branch_id text default 'all'
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_all boolean := coalesce(p_branch_id,'all')='all';
begin
  if not exists (select 1 from public.profiles p where p.id=auth.uid() and p.status='active' and p.role='super_admin') then
    raise exception 'Super Admin report access required';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then raise exception 'Invalid report date range'; end if;
  if not v_all and not exists(select 1 from public.branches b where b.id::text=p_branch_id and b.status='active') then raise exception 'Invalid report branch'; end if;

  with
  scoped_invoices as (
    select * from public.invoices i where i.invoice_date between p_start_date and p_end_date
      and coalesce(i.status,'') <> 'void' and (v_all or i.branch_id=p_branch_id)
  ),
  scoped_payments as (
    select * from public.payments p where p.payment_date between p_start_date and p_end_date
      and p.status='completed' and (v_all or p.branch_id=p_branch_id)
  ),
  scoped_refunds as (
    select * from public.refunds r where r.created_at::date between p_start_date and p_end_date
      and coalesce(r.status,'') not in ('void','failed','cancelled') and (v_all or r.branch_id=p_branch_id)
  ),
  scoped_expenses as (
    select * from public.expenses e where e.expense_date between p_start_date and p_end_date
      and coalesce(e.status,'') not in ('void','cancelled')
      and (case when v_all then (e.scope='clinic_wide' or e.scope='branch') else (e.scope='branch' and e.branch_id=p_branch_id) end)
  ),
  scoped_expense_payments as (
    select ep.* from public.expense_payments ep join scoped_expenses e on e.id=ep.expense_id
      where ep.payment_date between p_start_date and p_end_date
  ),
  scoped_appointments as (
    select * from public.appointments a where a.appointment_date between p_start_date and p_end_date
      and (v_all or a.branch_id::text=p_branch_id)
  ),
  scoped_treatments as (
    select * from public.treatments t where t.treatment_date between p_start_date and p_end_date
      and (v_all or t.branch_id=p_branch_id)
  ),
  finance as (
    select
      coalesce((select sum(total_cents) from scoped_invoices),0)::bigint billed,
      coalesce((select sum(amount_cents) from scoped_payments),0)::bigint collections,
      coalesce((select sum(balance_cents) from scoped_invoices where balance_cents>0),0)::bigint receivables,
      coalesce((select sum(total_cents) from scoped_expenses),0)::bigint expenses,
      coalesce((select sum(amount_cents) from scoped_expense_payments),0)::bigint expense_payments,
      coalesce((select sum(amount_cents) from scoped_refunds),0)::bigint refunds
  ),
  ops as (
    select count(*)::bigint appointments,
      count(*) filter(where status='completed')::bigint completed,
      count(*) filter(where status='cancelled')::bigint cancelled,
      count(*) filter(where status='no_show')::bigint no_shows,
      count(distinct patient_id) filter(where status='completed')::bigint patients_seen
    from scoped_appointments
  ),
  inventory as (
    select
      count(*) filter(where ii.status='active')::bigint active_positions,
      count(*) filter(where ii.status='active' and bi.quantity_on_hand>0 and bi.quantity_on_hand<=bi.reorder_level)::bigint low_stock,
      count(*) filter(where ii.status='active' and bi.quantity_on_hand<=0)::bigint out_of_stock,
      coalesce(sum(bi.quantity_on_hand*bi.average_unit_cost_cents) filter(where ii.status='active'),0)::bigint valuation
    from public.branch_inventory bi join public.inventory_items ii on ii.id=bi.inventory_item_id
    where (v_all or bi.branch_id=p_branch_id)
  ),
  expiring as (
    select count(*)::bigint n from public.inventory_batches ib join public.inventory_items ii on ii.id=ib.inventory_item_id
    where ib.quantity_on_hand>0 and ib.expiry_date is not null
      and ib.expiry_date between current_date and current_date + make_interval(days=>greatest(coalesce(ii.expiry_warning_days,60),1))
      and (v_all or ib.branch_id=p_branch_id)
  ),
  movement as (
    select coalesce(sum(sm.quantity),0)::numeric consumed from public.stock_movements sm
    where sm.created_at::date between p_start_date and p_end_date
      and sm.movement_type in ('consumption','manual_stock_out') and (v_all or sm.branch_id=p_branch_id)
  ),
  provider_rows as (
    select pr.id, pr.display_name,
      count(distinct a.id)::bigint appointments,
      count(distinct a.id) filter(where a.status='completed')::bigint completed_visits,
      count(distinct a.patient_id) filter(where a.status='completed')::bigint patients_seen,
      count(distinct t.id) filter(where t.status='completed')::bigint treatments,
      count(distinct a.id) filter(where a.status='no_show')::bigint no_shows,
      coalesce(sum(coalesce(t.price_snapshot_cents,round(coalesce(t.cost,0)*100)::int)) filter(where t.status='completed'),0)::bigint billed_treatments
    from public.providers pr
    left join scoped_appointments a on a.provider_id=pr.id
    left join scoped_treatments t on t.provider_id=pr.id::text
    where pr.status='active'
      and exists(select 1 from public.provider_branch_assignments pba where pba.provider_id=pr.id and pba.status='active' and (v_all or pba.branch_id::text=p_branch_id))
    group by pr.id,pr.display_name
  ),
  service_rows as (
    select s.id,s.name,count(a.id)::bigint demand,count(a.id) filter(where a.status='completed')::bigint completed
    from public.services s left join scoped_appointments a on a.service_id=s.id
    where s.status='active' group by s.id,s.name having count(a.id)>0
  ),
  treatment_rows as (
    select coalesce(nullif(t.service_name_snapshot,''),s.name,'Unspecified treatment') name,
      count(*)::bigint performed,
      coalesce(sum(coalesce(t.price_snapshot_cents,round(coalesce(t.cost,0)*100)::int)),0)::bigint billed
    from scoped_treatments t left join public.services s on s.id=t.service_id
    where t.status='completed' group by 1
  ),
  days as (select generate_series(p_start_date,p_end_date,'1 day'::interval)::date d),
  trend as (
    select d.d,
      coalesce((select sum(p.amount_cents) from public.payments p where p.status='completed' and p.payment_date=d.d and (v_all or p.branch_id=p_branch_id)),0)::bigint collections,
      coalesce((select sum(e.total_cents) from public.expenses e where e.expense_date=d.d and coalesce(e.status,'') not in ('void','cancelled') and (case when v_all then e.scope in ('branch','clinic_wide') else e.scope='branch' and e.branch_id=p_branch_id end)),0)::bigint expenses
    from days d
  )
  select jsonb_build_object(
    'start_date',p_start_date,'end_date',p_end_date,'branch_id',case when v_all then 'all' else p_branch_id end,
    'financial',jsonb_build_object(
      'billed_revenue_cents',f.billed,'collections_cents',f.collections,'receivables_cents',f.receivables,
      'operating_expenses_cents',f.expenses,'expense_payments_cents',f.expense_payments,'refunds_cents',f.refunds,
      'net_operating_result_cents',f.billed-f.expenses,'net_cash_movement_cents',f.collections-f.expense_payments-f.refunds
    ),
    'operations',jsonb_build_object(
      'appointments',o.appointments,'completed_visits',o.completed,'cancellations',o.cancelled,'no_shows',o.no_shows,
      'no_show_rate',case when o.appointments=0 then 0 else o.no_shows::numeric/o.appointments end,'patients_seen',o.patients_seen,
      'new_patients',(select count(distinct pat.id) from public.patients pat where pat.registration_date between p_start_date and p_end_date and (v_all or exists(select 1 from scoped_appointments a where a.patient_id=pat.id)))
    ),
    'inventory',jsonb_build_object('active_items',inv.active_positions,'low_stock',inv.low_stock,'out_of_stock',inv.out_of_stock,'expiring_soon',(select n from expiring),'valuation_cents',inv.valuation,'consumed_quantity',(select consumed from movement)),
    'provider_performance',(select coalesce(jsonb_agg(jsonb_build_object('provider_id',id,'provider_name',display_name,'appointments',appointments,'completed_visits',completed_visits,'patients_seen',patients_seen,'treatments',treatments,'no_shows',no_shows,'no_show_rate',case when appointments=0 then 0 else no_shows::numeric/appointments end,'billed_treatments_cents',billed_treatments) order by completed_visits desc), '[]'::jsonb) from provider_rows),
    'service_demand',(select coalesce(jsonb_agg(jsonb_build_object('service_id',id,'service_name',name,'demand',demand,'completed',completed) order by demand desc),'[]'::jsonb) from service_rows),
    'top_treatments',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'performed',performed,'billed_cents',billed) order by performed desc),'[]'::jsonb) from treatment_rows),
    'trend',(select coalesce(jsonb_agg(jsonb_build_object('date',d,'collections_cents',collections,'expenses_cents',expenses) order by d),'[]'::jsonb) from trend)
  ) into v_result from finance f cross join ops o cross join inventory inv;

  return v_result;
end
$$;

revoke all on function public.get_management_report_v129(date,date,text) from public, anon;
grant execute on function public.get_management_report_v129(date,date,text) to authenticated;
