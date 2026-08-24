-- Extend management tax settings for explicit clinic tax profiles.
-- This is for internal reporting estimates only, not statutory tax filing.

alter table public.report_tax_configuration
  add column if not exists tax_profile text not null default 'non_vat_percentage',
  add column if not exists entity_type text not null default 'individual_professional',
  add column if not exists vat_status text not null default 'non_vat',
  add column if not exists percentage_tax_rate numeric(7,4) not null default 3,
  add column if not exists corporate_income_tax_rate numeric(7,4) not null default 25,
  add column if not exists vat_rate numeric(7,4) not null default 12,
  add column if not exists vat_threshold_cents bigint default 300000000,
  add column if not exists effective_date date not null default date '2026-01-01';

update public.report_tax_configuration
set
  tax_profile = coalesce(nullif(tax_profile, ''), 'non_vat_percentage'),
  entity_type = coalesce(nullif(entity_type, ''), 'individual_professional'),
  vat_status = coalesce(nullif(vat_status, ''), 'non_vat'),
  percentage_tax_rate = case
    when percentage_tax_rate is not null and percentage_tax_rate > 0 then percentage_tax_rate
    when rate_percent is not null and rate_percent > 0 then rate_percent
    else 3
  end,
  corporate_income_tax_rate = coalesce(nullif(corporate_income_tax_rate, 0), 25),
  vat_rate = coalesce(nullif(vat_rate, 0), 12),
  vat_threshold_cents = coalesce(vat_threshold_cents, 300000000),
  effective_date = coalesce(effective_date, date '2026-01-01')
where id = 'clinic';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'report_tax_configuration_tax_profile_check') then
    alter table public.report_tax_configuration
      add constraint report_tax_configuration_tax_profile_check
      check (tax_profile in ('non_vat_percentage', 'vat_registered', 'corporate_income_tax', 'individual_professional'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_tax_configuration_entity_type_check') then
    alter table public.report_tax_configuration
      add constraint report_tax_configuration_entity_type_check
      check (entity_type in ('corporation', 'individual_professional', 'partnership'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_tax_configuration_vat_status_check') then
    alter table public.report_tax_configuration
      add constraint report_tax_configuration_vat_status_check
      check (vat_status in ('non_vat', 'vat_registered', 'unknown'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_tax_configuration_percentage_rate_check') then
    alter table public.report_tax_configuration
      add constraint report_tax_configuration_percentage_rate_check
      check (percentage_tax_rate >= 0 and percentage_tax_rate <= 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_tax_configuration_cit_rate_check') then
    alter table public.report_tax_configuration
      add constraint report_tax_configuration_cit_rate_check
      check (corporate_income_tax_rate >= 0 and corporate_income_tax_rate <= 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_tax_configuration_vat_rate_check') then
    alter table public.report_tax_configuration
      add constraint report_tax_configuration_vat_rate_check
      check (vat_rate >= 0 and vat_rate <= 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'report_tax_configuration_vat_threshold_check') then
    alter table public.report_tax_configuration
      add constraint report_tax_configuration_vat_threshold_check
      check (vat_threshold_cents is null or vat_threshold_cents >= 0);
  end if;
end $$;

comment on table public.report_tax_configuration is
  'Clinic-configured internal management tax estimate assumptions; not a statutory tax return calculation.';

comment on column public.report_tax_configuration.tax_profile is
  'Selected management estimate profile: non-VAT percentage, VAT reporting, corporate income tax, or individual/professional practice.';

comment on column public.report_tax_configuration.vat_threshold_cents is
  'Configurable VAT registration threshold reference in cents when management wants to display/track it.';
