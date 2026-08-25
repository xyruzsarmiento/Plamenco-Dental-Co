-- Part 2: branch relationship hardening, indirect children, storage, and legacy diagnostics.
-- No random branch assignment is performed. Legacy rows are backfilled only from trustworthy parents.

-- Documents need explicit branch origin because many are not permanently tied to an appointment/invoice.
alter table public.documents add column if not exists branch_id text;

create index if not exists documents_branch_created_idx
  on public.documents(branch_id, created_at desc)
  where branch_id is not null;

with inferred as (
  select
    d.id,
    dr.branch_id::text as clinical_branch_id,
    t.branch_id::text as treatment_branch_id
  from public.documents d
  left join public.dental_records dr
    on nullif(btrim(d.clinical_visit_id), '') is not null
   and dr.id::text = d.clinical_visit_id
  left join public.treatments t
    on nullif(btrim(d.treatment_id), '') is not null
   and t.id::text = d.treatment_id
  where d.branch_id is null
)
update public.documents d
set branch_id = case
  when i.clinical_branch_id is not null and i.treatment_branch_id is not null
       and i.clinical_branch_id = i.treatment_branch_id then i.clinical_branch_id
  when i.clinical_branch_id is not null and i.treatment_branch_id is null then i.clinical_branch_id
  when i.clinical_branch_id is null and i.treatment_branch_id is not null then i.treatment_branch_id
  else null
end
from inferred i
where d.id = i.id
  and d.branch_id is null
  and (
    (i.clinical_branch_id is not null and i.treatment_branch_id is null)
    or (i.clinical_branch_id is null and i.treatment_branch_id is not null)
    or (i.clinical_branch_id is not null and i.clinical_branch_id = i.treatment_branch_id)
  );

create or replace function public.derive_document_branch()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_clinical_branch text;
  v_treatment_branch text;
  v_derived_branch text;
begin
  if nullif(btrim(coalesce(new.clinical_visit_id, '')), '') is not null then
    select dr.branch_id::text into v_clinical_branch
    from public.dental_records dr
    where dr.id::text = new.clinical_visit_id
    limit 1;
    if v_clinical_branch is null then raise exception 'Document clinical visit has no resolvable branch.'; end if;
  end if;

  if nullif(btrim(coalesce(new.treatment_id, '')), '') is not null then
    select t.branch_id::text into v_treatment_branch
    from public.treatments t
    where t.id::text = new.treatment_id
    limit 1;
    if v_treatment_branch is null then raise exception 'Document treatment has no resolvable branch.'; end if;
  end if;

  if v_clinical_branch is not null and v_treatment_branch is not null and v_clinical_branch <> v_treatment_branch then
    raise exception 'Document clinical visit and treatment belong to different branches.';
  end if;

  v_derived_branch := coalesce(v_clinical_branch, v_treatment_branch);
  if nullif(btrim(coalesce(new.branch_id, '')), '') is null then
    -- Safe fallback only when the authenticated internal account has exactly one authorized branch.
    new.branch_id := coalesce(v_derived_branch, public.single_authorized_branch_id());
  elsif v_derived_branch is not null and new.branch_id <> v_derived_branch then
    raise exception 'Document branch does not match its linked clinical record.';
  end if;
  return new;
end;
$$;

drop trigger if exists branch_00_derive_document_branch on public.documents;
create trigger branch_00_derive_document_branch
before insert or update on public.documents
for each row execute function public.derive_document_branch();

alter table public.documents enable row level security;
drop policy if exists branch_scope_guard on public.documents;
create policy branch_scope_guard
on public.documents as restrictive
for all to authenticated
using (
  not public.is_internal_profile()
  or public.is_super_admin()
  or (branch_id is not null and public.can_access_branch(branch_id))
)
with check (
  not public.is_internal_profile()
  or public.is_super_admin()
  or (branch_id is not null and public.can_access_branch(branch_id))
);

drop trigger if exists branch_10_mutation_guard on public.documents;
create trigger branch_10_mutation_guard
before insert or update or delete on public.documents
for each row execute function public.enforce_internal_branch_mutation();

-- Indirect children use authoritative parent branch ownership rather than redundant branch fields.
create or replace function public.can_access_appointment_record(p_appointment_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(public.is_super_admin() or exists (
    select 1 from public.appointments a
    where a.id::text = p_appointment_id
      and a.branch_id is not null
      and public.can_access_branch(a.branch_id::text)
  ), false)
$$;

create or replace function public.can_access_dental_record(p_record_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(public.is_super_admin() or exists (
    select 1 from public.dental_records dr
    where dr.id::text = p_record_id
      and dr.branch_id is not null
      and public.can_access_branch(dr.branch_id::text)
  ), false)
$$;

create or replace function public.can_access_invoice_record(p_invoice_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(public.is_super_admin() or exists (
    select 1 from public.invoices i
    where i.id::text = p_invoice_id
      and i.branch_id is not null
      and public.can_access_branch(i.branch_id::text)
  ), false)
$$;

create or replace function public.can_access_payment_record(p_payment_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(public.is_super_admin() or exists (
    select 1 from public.payments p
    where p.id::text = p_payment_id
      and p.branch_id is not null
      and public.can_access_branch(p.branch_id::text)
  ), false)
$$;

create or replace function public.can_access_expense_record(p_expense_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(public.is_super_admin() or exists (
    select 1 from public.expenses e
    where e.id::text = p_expense_id
      and e.branch_id is not null
      and public.can_access_branch(e.branch_id::text)
  ), false)
$$;

create or replace function public.can_access_purchase_order_record(p_po_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(public.is_super_admin() or exists (
    select 1 from public.purchase_orders po
    where po.id::text = p_po_id
      and po.branch_id is not null
      and public.can_access_branch(po.branch_id::text)
  ), false)
$$;

create or replace function public.can_access_stock_count_record(p_count_id text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(public.is_super_admin() or exists (
    select 1 from public.stock_counts sc
    where sc.id::text = p_count_id
      and sc.branch_id is not null
      and public.can_access_branch(sc.branch_id::text)
  ), false)
$$;

revoke all on function public.can_access_appointment_record(text) from public, anon;
revoke all on function public.can_access_dental_record(text) from public, anon;
revoke all on function public.can_access_invoice_record(text) from public, anon;
revoke all on function public.can_access_payment_record(text) from public, anon;
revoke all on function public.can_access_expense_record(text) from public, anon;
revoke all on function public.can_access_purchase_order_record(text) from public, anon;
revoke all on function public.can_access_stock_count_record(text) from public, anon;
grant execute on function public.can_access_appointment_record(text) to authenticated, service_role;
grant execute on function public.can_access_dental_record(text) to authenticated, service_role;
grant execute on function public.can_access_invoice_record(text) to authenticated, service_role;
grant execute on function public.can_access_payment_record(text) to authenticated, service_role;
grant execute on function public.can_access_expense_record(text) to authenticated, service_role;
grant execute on function public.can_access_purchase_order_record(text) to authenticated, service_role;
grant execute on function public.can_access_stock_count_record(text) to authenticated, service_role;

-- Appointment/clinical/financial/inventory children inherit branch scope through their parent.
do $$
begin
  if to_regclass('public.appointment_status_history') is not null then
    alter table public.appointment_status_history enable row level security;
    drop policy if exists branch_scope_guard on public.appointment_status_history;
    create policy branch_scope_guard on public.appointment_status_history as restrictive for all to authenticated
      using (not public.is_internal_profile() or public.can_access_appointment_record(appointment_id::text))
      with check (not public.is_internal_profile() or public.can_access_appointment_record(appointment_id::text));
  end if;

  if to_regclass('public.appointment_communications') is not null and exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='appointment_communications' and column_name='appointment_id'
  ) then
    alter table public.appointment_communications enable row level security;
    drop policy if exists branch_scope_guard on public.appointment_communications;
    execute 'create policy branch_scope_guard on public.appointment_communications as restrictive for all to authenticated
      using (not public.is_internal_profile() or public.can_access_appointment_record(appointment_id::text))
      with check (not public.is_internal_profile() or public.can_access_appointment_record(appointment_id::text))';
  end if;

  if to_regclass('public.clinical_record_amendments') is not null then
    alter table public.clinical_record_amendments enable row level security;
    drop policy if exists branch_scope_guard on public.clinical_record_amendments;
    create policy branch_scope_guard on public.clinical_record_amendments as restrictive for all to authenticated
      using (not public.is_internal_profile() or public.can_access_dental_record(dental_record_id::text))
      with check (not public.is_internal_profile() or public.can_access_dental_record(dental_record_id::text));
  end if;

  if to_regclass('public.expense_payments') is not null then
    alter table public.expense_payments enable row level security;
    drop policy if exists branch_scope_guard on public.expense_payments;
    create policy branch_scope_guard on public.expense_payments as restrictive for all to authenticated
      using (not public.is_internal_profile() or public.can_access_expense_record(expense_id::text))
      with check (not public.is_internal_profile() or public.can_access_expense_record(expense_id::text));
  end if;

  if to_regclass('public.expense_attachments') is not null then
    alter table public.expense_attachments enable row level security;
    drop policy if exists branch_scope_guard on public.expense_attachments;
    create policy branch_scope_guard on public.expense_attachments as restrictive for all to authenticated
      using (not public.is_internal_profile() or public.can_access_expense_record(expense_id::text))
      with check (not public.is_internal_profile() or public.can_access_expense_record(expense_id::text));
  end if;

  if to_regclass('public.payment_allocations') is not null then
    alter table public.payment_allocations enable row level security;
    drop policy if exists branch_scope_guard on public.payment_allocations;
    create policy branch_scope_guard on public.payment_allocations as restrictive for all to authenticated
      using (
        not public.is_internal_profile()
        or public.can_access_payment_record(payment_id::text)
        or public.can_access_invoice_record(invoice_id::text)
      )
      with check (
        not public.is_internal_profile()
        or (public.can_access_payment_record(payment_id::text) and public.can_access_invoice_record(invoice_id::text))
      );
  end if;

  if to_regclass('public.purchase_order_items') is not null and exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='purchase_order_items' and column_name='purchase_order_id'
  ) then
    alter table public.purchase_order_items enable row level security;
    drop policy if exists branch_scope_guard on public.purchase_order_items;
    execute 'create policy branch_scope_guard on public.purchase_order_items as restrictive for all to authenticated
      using (not public.is_internal_profile() or public.can_access_purchase_order_record(purchase_order_id::text))
      with check (not public.is_internal_profile() or public.can_access_purchase_order_record(purchase_order_id::text))';
  end if;

  if to_regclass('public.stock_count_lines') is not null and exists (
    select 1 from information_schema.columns where table_schema='public' and table_name='stock_count_lines' and column_name='stock_count_id'
  ) then
    alter table public.stock_count_lines enable row level security;
    drop policy if exists branch_scope_guard on public.stock_count_lines;
    execute 'create policy branch_scope_guard on public.stock_count_lines as restrictive for all to authenticated
      using (not public.is_internal_profile() or public.can_access_stock_count_record(stock_count_id::text))
      with check (not public.is_internal_profile() or public.can_access_stock_count_record(stock_count_id::text))';
  end if;
end
$$;

-- Appointment requests are fail-closed if the legacy table has no trustworthy branch relationship.
-- No branch is invented from patient preference or browser state.
do $$
begin
  if to_regclass('public.appointment_requests') is not null then
    alter table public.appointment_requests enable row level security;
    drop policy if exists branch_scope_guard on public.appointment_requests;
    if exists (
      select 1 from information_schema.columns where table_schema='public' and table_name='appointment_requests' and column_name='branch_id'
    ) then
      execute 'create policy branch_scope_guard on public.appointment_requests as restrictive for all to authenticated
        using (not public.is_internal_profile() or public.is_super_admin() or (branch_id is not null and public.can_access_branch(branch_id::text)))
        with check (not public.is_internal_profile() or public.is_super_admin() or (branch_id is not null and public.can_access_branch(branch_id::text)))';
    elsif exists (
      select 1 from information_schema.columns where table_schema='public' and table_name='appointment_requests' and column_name='appointment_id'
    ) then
      execute 'create policy branch_scope_guard on public.appointment_requests as restrictive for all to authenticated
        using (not public.is_internal_profile() or public.can_access_appointment_record(appointment_id::text))
        with check (not public.is_internal_profile() or public.can_access_appointment_record(appointment_id::text))';
    else
      execute 'create policy branch_scope_guard on public.appointment_requests as restrictive for all to authenticated
        using (not public.is_internal_profile() or public.is_super_admin())
        with check (not public.is_internal_profile() or public.is_super_admin())';
    end if;
  end if;
end
$$;

-- Newer expense workflow tables vary by migration generation. Scope them by branch_id when present,
-- otherwise by expense_id, otherwise fail closed for internal non-Super-Admin users until a reliable
-- parent relationship is introduced.
do $$
declare
  v_table text;
  v_tables text[] := array['expense_recurrences','expense_recurrence_lines','expense_payment_events','small_cash_purchases','supplier_bills'];
begin
  foreach v_table in array v_tables loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('drop policy if exists branch_scope_guard on public.%I', v_table);
      if exists (
        select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v_table and c.column_name='branch_id'
      ) then
        execute format(
          'create policy branch_scope_guard on public.%I as restrictive for all to authenticated
           using (not public.is_internal_profile() or public.is_super_admin() or (branch_id is not null and public.can_access_branch(branch_id::text)))
           with check (not public.is_internal_profile() or public.is_super_admin() or (branch_id is not null and public.can_access_branch(branch_id::text)))',
          v_table
        );
        execute format('drop trigger if exists branch_10_mutation_guard on public.%I', v_table);
        execute format('create trigger branch_10_mutation_guard before insert or update or delete on public.%I for each row execute function public.enforce_internal_branch_mutation()', v_table);
      elsif exists (
        select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v_table and c.column_name='expense_id'
      ) then
        execute format(
          'create policy branch_scope_guard on public.%I as restrictive for all to authenticated
           using (not public.is_internal_profile() or public.can_access_expense_record(expense_id::text))
           with check (not public.is_internal_profile() or public.can_access_expense_record(expense_id::text))',
          v_table
        );
      else
        execute format(
          'create policy branch_scope_guard on public.%I as restrictive for all to authenticated
           using (not public.is_internal_profile() or public.is_super_admin())
           with check (not public.is_internal_profile() or public.is_super_admin())',
          v_table
        );
      end if;
    end if;
  end loop;
end
$$;

-- Private patient document blobs follow the metadata branch. Patient-visible files remain accessible
-- only to the owning authenticated patient through the existing patient relationship.
drop policy if exists patient_documents_select_authorized on storage.objects;
create policy patient_documents_select_authorized
on storage.objects
for select
to authenticated
using (
  bucket_id = 'patient-documents'
  and (
    exists (
      select 1 from public.documents d
      where d.storage_path = storage.objects.name
        and d.archived_at is null
        and public.is_internal_profile()
        and (public.is_super_admin() or (d.branch_id is not null and public.can_access_branch(d.branch_id)))
    )
    or exists (
      select 1
      from public.documents d
      join public.patients p on p.id = d.patient_id
      where d.storage_path = storage.objects.name
        and d.archived_at is null
        and d.patient_visible = true
        and p.auth_user_id = auth.uid()
    )
  )
);

drop policy if exists patient_documents_delete_internal on storage.objects;
create policy patient_documents_delete_internal
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'patient-documents'
  and public.has_profile_permission('documents.upload')
  and exists (
    select 1 from public.documents d
    where d.storage_path = storage.objects.name
      and (public.is_super_admin() or (d.branch_id is not null and public.can_access_branch(d.branch_id)))
  )
);

-- Expense attachment blobs are visible only when their metadata resolves to an authorized expense.
drop policy if exists "expense_attachments_storage_internal_read" on storage.objects;
drop policy if exists "expense_attachments_storage_internal_write" on storage.objects;
drop policy if exists "expense_attachments_storage_internal_insert" on storage.objects;
drop policy if exists "expense_attachments_storage_internal_update" on storage.objects;
drop policy if exists "expense_attachments_storage_internal_delete" on storage.objects;

create policy "expense_attachments_storage_internal_read"
on storage.objects for select to authenticated
using (
  bucket_id='expense-attachments'
  and exists (
    select 1 from public.expense_attachments ea
    where ea.storage_path=storage.objects.name
      and public.can_access_expense_record(ea.expense_id::text)
  )
);

create policy "expense_attachments_storage_internal_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='expense-attachments'
  and public.is_internal_profile()
  and public.has_profile_permission('expenses.create')
);

create policy "expense_attachments_storage_internal_update"
on storage.objects for update to authenticated
using (
  bucket_id='expense-attachments'
  and exists (
    select 1 from public.expense_attachments ea
    where ea.storage_path=storage.objects.name
      and public.can_access_expense_record(ea.expense_id::text)
  )
)
with check (
  bucket_id='expense-attachments'
  and exists (
    select 1 from public.expense_attachments ea
    where ea.storage_path=storage.objects.name
      and public.can_access_expense_record(ea.expense_id::text)
  )
);

create policy "expense_attachments_storage_internal_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='expense-attachments'
  and exists (
    select 1 from public.expense_attachments ea
    where ea.storage_path=storage.objects.name
      and public.can_access_expense_record(ea.expense_id::text)
  )
);

-- Legacy audit: unresolved rows remain intact and become fail-closed for non-Super-Admin internal users.
create or replace function public.branch_scope_integrity_report()
returns table(check_key text, severity text, affected_count bigint, detail text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_super_admin() and not public.has_profile_permission('system_admin.view') then
    raise exception 'Not authorized to inspect branch-scope integrity.' using errcode='42501';
  end if;

  return query
  select 'documents.unresolved_branch','high',count(*)::bigint,
    'Documents without a trustworthy clinical/treatment branch were preserved with branch_id NULL; non-Super-Admin internal access is fail-closed.'
  from public.documents d where d.branch_id is null
  union all
  select 'documents.conflicting_parent_branch','critical',count(*)::bigint,
    'Documents whose linked clinical visit and treatment resolve to different branches require manual review.'
  from public.documents d
  join public.dental_records dr on dr.id::text=d.clinical_visit_id
  join public.treatments t on t.id::text=d.treatment_id
  where dr.branch_id is not null and t.branch_id is not null and dr.branch_id::text<>t.branch_id::text
  union all
  select 'appointments.unresolved_branch','high',count(*)::bigint,
    'Appointments without branch ownership were preserved and are fail-closed for non-Super-Admin internal users.'
  from public.appointments a where a.branch_id is null
  union all
  select 'dental_records.unresolved_branch','high',count(*)::bigint,
    'Clinical records without branch ownership were preserved and are fail-closed for non-Super-Admin internal users.'
  from public.dental_records dr where dr.branch_id is null
  union all
  select 'treatments.unresolved_branch','high',count(*)::bigint,
    'Treatments without branch ownership were preserved and are fail-closed for non-Super-Admin internal users.'
  from public.treatments t where t.branch_id is null
  union all
  select 'prescriptions.unresolved_branch','high',count(*)::bigint,
    'Prescriptions without branch ownership were preserved and are fail-closed for non-Super-Admin internal users.'
  from public.prescriptions p where p.branch_id is null
  union all
  select 'staff.active_without_branch','high',count(*)::bigint,
    'Active Staff profiles without an active staff_branch_assignment cannot access branch-sensitive operations.'
  from public.profiles p
  where p.status='active' and p.role='staff'
    and not exists (select 1 from public.staff_branch_assignments sba where sba.profile_id=p.id and sba.status='active')
  union all
  select 'dentists.active_without_branch','high',count(*)::bigint,
    'Active Dentist profiles without an active provider branch assignment cannot access branch-sensitive operations.'
  from public.profiles p
  where p.status='active' and p.role in ('dentist','associate_dentist')
    and not exists (
      select 1 from public.providers pr
      join public.provider_branch_assignments pba on pba.provider_id=pr.id
      where pr.profile_id=p.id and pr.status='active' and pba.status='active'
    );
end;
$$;

revoke all on function public.branch_scope_integrity_report() from public, anon;
grant execute on function public.branch_scope_integrity_report() to authenticated, service_role;

comment on column public.documents.branch_id is
  'Originating clinic branch for authorization. Legacy NULL is preserved when branch cannot be inferred safely.';
comment on function public.branch_scope_integrity_report() is
  'Super-Admin diagnostic for unresolved/conflicting legacy branch ownership after Part 2 hardening.';
