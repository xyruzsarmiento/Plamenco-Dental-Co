-- Configurable reporting tax profile for management exports.
-- This stores clinic-configured reporting assumptions; it does not determine statutory tax liability.

create table if not exists public.report_tax_configuration (
  id text primary key default 'clinic',
  enabled boolean not null default false,
  tax_label text not null default 'Tax',
  rate_percent numeric(7,4) not null default 0 check (rate_percent >= 0 and rate_percent <= 100),
  basis text not null default 'billed_revenue' check (basis in ('billed_revenue', 'collections')),
  prices_include_tax boolean not null default true,
  notes text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.report_tax_configuration (id)
values ('clinic')
on conflict (id) do nothing;

alter table public.report_tax_configuration enable row level security;

drop policy if exists "report_tax_internal_read" on public.report_tax_configuration;
drop policy if exists "report_tax_management_write" on public.report_tax_configuration;

create policy "report_tax_internal_read"
on public.report_tax_configuration
for select
using (public.is_internal_profile());

create policy "report_tax_management_write"
on public.report_tax_configuration
for all
using (public.is_management_role())
with check (public.is_management_role());

drop trigger if exists set_report_tax_configuration_updated_at on public.report_tax_configuration;
create trigger set_report_tax_configuration_updated_at
before update on public.report_tax_configuration
for each row execute procedure public.set_updated_at();

create index if not exists idx_report_tax_configuration_enabled
on public.report_tax_configuration (enabled);
