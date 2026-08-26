-- Branch-scoped live reporting for operational staff.
-- Super Admin continues to use the management report for All Branches.
create or replace function public.get_staff_branch_report_v131(
  p_start_date date,
  p_end_date date,
  p_branch_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Invalid report date range';
  end if;
  if nullif(btrim(coalesce(p_branch_id,'')),'') is null or p_branch_id = 'all' then
    raise exception 'A specific branch is required for this report';
  end if;
  if not public.has_profile_permission('reports.view_limited')
     and not public.has_profile_permission('reports.view') then
    raise exception 'Report access is not permitted' using errcode = '42501';
  end if;
  if not public.profile_has_active_branch(p_branch_id) then
    raise exception 'You are not authorized for this report branch' using errcode = '42501';
  end if;
  if not exists(select 1 from public.branches b where b.id::text = p_branch_id and b.status='active') then
    raise exception 'Invalid report branch';
  end if;

  with scoped_invoices as (
    select * from public.invoices i
    where i.invoice_date between p_start_date and p_end_date
      and coalesce(i.status,'') <> 'void'
      and i.branch_id = p_branch_id
  ),
  scoped_payments as (
    select * from public.payments p
    where p.payment_date between p_start_date and p_end_date
      and p.status='completed'
      and p.branch_id = p_branch_id
  ),
  scoped_refunds as (
    select * from public.refunds r
    where r.created_at::date between p_start_date and p_end_date
      and coalesce(r.status,'') not in ('void','failed','cancelled')
      and r.branch_id = p_branch_id
  ),
  scoped_expenses as (
    select * from public.expenses e
    where e.expense_date between p_start_date and p_end_date
      and coalesce(e.status,'') not in ('void','cancelled')
      and e.scope='branch'
      and e.branch_id = p_branch_id
  ),
  scoped_expense_payments as (
    select ep.* from public.expense_payments ep
    join scoped_expenses e on e.id=ep.expense_id
    where ep.payment_date between p_start_date and p_end_date
  ),
  scoped_appointments as (
    select * from public.appointments a
    where a.appointment_date between p_start_date and p_end_date
      and a.branch_id::text = p_branch_id
  ),
  scoped_treatments as (
    select * from public.treatments t
    where t.treatment_date between p_start_date and p_end_date
      and t.branch_id = p_branch_id
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
    select count(*) filter(where ii.status='active')::bigint active_positions,
      count(*) filter(where ii.status='active' and bi.quantity_on_hand>0 and bi.quantity_on_hand<=bi.reorder_level)::bigint low_stock,
      count(*) filter(where ii.status='active' and bi.quantity_on_hand<=0)::bigint out_of_stock,
      coalesce(sum(bi.quantity_on_hand*bi.average_unit_cost_cents) filter(where ii.status='active'),0)::bigint valuation
    from public.branch_inventory bi
    join public.inventory_items ii on ii.id=bi.inventory_item_id
    where bi.branch_id = p_branch_id
  ),
  expiring as (
    select count(*)::bigint n
    from public.inventory_batches ib
    join public.inventory_items ii on ii.id=ib.inventory_item_id
    where ib.branch_id=p_branch_id and ib.quantity_on_hand>0 and ib.expiry_date is not null
      and ib.expiry_date between current_date and current_date + make_interval(days=>greatest(coalesce(ii.expiry_warning_days,60),1))
  ),
  movement as (
    select coalesce(sum(sm.quantity),0)::numeric consumed
    from public.stock_movements sm
    where sm.created_at::date between p_start_date and p_end_date
      and sm.movement_type in ('consumption','manual_stock_out')
      and sm.branch_id=p_branch_id
  ),
  service_rows as (
    select s.id,s.name,count(a.id)::bigint demand,
      count(a.id) filter(where a.status='completed')::bigint completed
    from public.services s
    left join scoped_appointments a on a.service_id=s.id
    where s.status='active'
    group by s.id,s.name having count(a.id)>0
  ),
  treatment_rows as (
    select coalesce(nullif(t.service_name_snapshot,''),s.name,'Unspecified treatment') name,
      count(*)::bigint performed,
      coalesce(sum(coalesce(t.price_snapshot_cents,round(coalesce(t.cost,0)*100)::int)),0)::bigint billed
    from scoped_treatments t
    left join public.services s on s.id=t.service_id
    where t.status='completed'
    group by 1
  ),
  days as (
    select generate_series(p_start_date,p_end_date,'1 day'::interval)::date d
  ),
  trend as (
    select d.d,
      coalesce((select sum(p.amount_cents) from public.payments p where p.status='completed' and p.payment_date=d.d and p.branch_id=p_branch_id),0)::bigint collections,
      coalesce((select sum(e.total_cents) from public.expenses e where e.expense_date=d.d and coalesce(e.status,'') not in ('void','cancelled') and e.scope='branch' and e.branch_id=p_branch_id),0)::bigint expenses
    from days d
  )
  select jsonb_build_object(
    'start_date',p_start_date,'end_date',p_end_date,'branch_id',p_branch_id,
    'financial',jsonb_build_object(
      'billed_revenue_cents',f.billed,'collections_cents',f.collections,'receivables_cents',f.receivables,
      'operating_expenses_cents',f.expenses,'expense_payments_cents',f.expense_payments,'refunds_cents',f.refunds,
      'net_operating_result_cents',f.billed-f.expenses,'net_cash_movement_cents',f.collections-f.expense_payments-f.refunds
    ),
    'operations',jsonb_build_object(
      'appointments',o.appointments,'completed_visits',o.completed,'cancellations',o.cancelled,'no_shows',o.no_shows,
      'no_show_rate',case when o.appointments=0 then 0 else o.no_shows::numeric/o.appointments end,
      'patients_seen',o.patients_seen,
      'new_patients',(select count(distinct pat.id) from public.patients pat where pat.registration_date between p_start_date and p_end_date and exists(select 1 from scoped_appointments a where a.patient_id=pat.id))
    ),
    'inventory',jsonb_build_object('active_items',inv.active_positions,'low_stock',inv.low_stock,'out_of_stock',inv.out_of_stock,'expiring_soon',(select n from expiring),'valuation_cents',inv.valuation,'consumed_quantity',(select consumed from movement)),
    'provider_performance','[]'::jsonb,
    'service_demand',(select coalesce(jsonb_agg(jsonb_build_object('service_id',id,'service_name',name,'demand',demand,'completed',completed) order by demand desc),'[]'::jsonb) from service_rows),
    'top_treatments',(select coalesce(jsonb_agg(jsonb_build_object('name',name,'performed',performed,'billed_cents',billed) order by performed desc),'[]'::jsonb) from treatment_rows),
    'trend',(select coalesce(jsonb_agg(jsonb_build_object('date',d,'collections_cents',collections,'expenses_cents',expenses) order by d),'[]'::jsonb) from trend)
  ) into v_result
  from finance f cross join ops o cross join inventory inv;

  return v_result;
end;
$$;

revoke all on function public.get_staff_branch_report_v131(date,date,text) from public;
grant execute on function public.get_staff_branch_report_v131(date,date,text) to authenticated;
