-- Release candidate hardening: live branch billing visibility and patient booking availability.
-- This migration keeps patient booking free of patient-identifying appointment data while
-- allowing the portal to see active dentist/branch relationships and non-sensitive busy windows.

-- Patients need active provider/branch relationships to determine which dentists are bookable.
drop policy if exists provider_branch_assignments_read_patient_booking on public.provider_branch_assignments;
create policy provider_branch_assignments_read_patient_booking
on public.provider_branch_assignments
for select
to authenticated
using (
  status = 'active'
  and exists (
    select 1
    from public.patients p
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
  )
);

-- Return only the minimum occupancy data required to remove already-booked slots.
create or replace function public.get_patient_booking_busy_windows_v130(
  p_start_date date,
  p_end_date date
)
returns table (
  appointment_id text,
  branch_id text,
  provider_id text,
  operatory_id text,
  appointment_date date,
  start_time text,
  end_time text,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.auth_user_id = auth.uid()
      and p.status = 'active'
  ) then
    raise exception 'Active patient account required' using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Invalid booking date range' using errcode = '22023';
  end if;

  if p_end_date - p_start_date > 366 then
    raise exception 'Booking availability range cannot exceed 366 days' using errcode = '22023';
  end if;

  return query
  select
    a.id::text,
    a.branch_id::text,
    a.provider_id::text,
    a.operatory_id::text,
    a.appointment_date,
    left(a.start_time::text, 5),
    left(a.end_time::text, 5),
    a.status::text
  from public.appointments a
  where a.appointment_date between p_start_date and p_end_date
    and a.branch_id is not null
    and a.provider_id is not null
    and a.status not in ('cancelled', 'rejected', 'no_show');
end;
$$;

revoke all on function public.get_patient_booking_busy_windows_v130(date, date) from public;
grant execute on function public.get_patient_booking_busy_windows_v130(date, date) to authenticated;

-- Existing broad internal SELECT policies are permissive. Add restrictive SELECT guards so
-- internal financial reads must also satisfy branch authorization. Patient self-access remains valid.
drop policy if exists v130_invoices_branch_read_restrictive on public.invoices;
create policy v130_invoices_branch_read_restrictive
on public.invoices as restrictive
for select to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists (
    select 1 from public.patients p
    where p.id = invoices.patient_id
      and p.auth_user_id = auth.uid()
  )
);

drop policy if exists v130_payments_branch_read_restrictive on public.payments;
create policy v130_payments_branch_read_restrictive
on public.payments as restrictive
for select to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists (
    select 1 from public.patients p
    where p.id = payments.patient_id
      and p.auth_user_id = auth.uid()
  )
);

drop policy if exists v130_receipts_branch_read_restrictive on public.receipts;
create policy v130_receipts_branch_read_restrictive
on public.receipts as restrictive
for select to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists (
    select 1 from public.patients p
    where p.auth_user_id = auth.uid()
      and (p.id::text = receipts.patient_id or p.patient_id = receipts.patient_id)
  )
);

drop policy if exists v130_refunds_branch_read_restrictive on public.refunds;
create policy v130_refunds_branch_read_restrictive
on public.refunds as restrictive
for select to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists (
    select 1 from public.patients p
    where p.auth_user_id = auth.uid()
      and (p.id::text = refunds.patient_id or p.patient_id = refunds.patient_id)
  )
);

drop policy if exists v130_charges_branch_read_restrictive on public.charges;
create policy v130_charges_branch_read_restrictive
on public.charges as restrictive
for select to authenticated
using (
  (public.is_internal_profile() and public.part12_can_read_branch_or_legacy(branch_id))
  or exists (
    select 1 from public.patients p
    where p.auth_user_id = auth.uid()
      and (p.id::text = charges.patient_id or p.patient_id = charges.patient_id)
  )
);
