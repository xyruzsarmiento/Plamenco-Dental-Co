-- Legacy records created before branch ownership became mandatory are unreadable
-- to branch-scoped clinicians. Recover their branch from the nearest dated,
-- branch-attributed care activity for the same patient without broadening RLS.

with ranked_candidates as (
  select
    target.id as target_id,
    source.branch_id,
    row_number() over (
      partition by target.id
      order by abs(extract(epoch from (source.created_at - target.created_at))), source.created_at desc
    ) as candidate_rank
  from public.dental_records target
  cross join lateral (
    select treatment.branch_id, treatment.created_at
    from public.treatments treatment
    where treatment.patient_id = target.patient_id and treatment.branch_id is not null
    union all
    select plan.branch_id, plan.created_at
    from public.treatment_plans plan
    where plan.patient_id = target.patient_id and plan.branch_id is not null
    union all
    select appointment.branch_id::text, appointment.created_at
    from public.appointments appointment
    where appointment.patient_id = target.patient_id and appointment.branch_id is not null
  ) source
  where target.branch_id is null
), selected_candidates as (
  select target_id, branch_id from ranked_candidates where candidate_rank = 1
)
update public.dental_records target
set branch_id = candidate.branch_id, updated_at = now()
from selected_candidates candidate
where target.id = candidate.target_id and target.branch_id is null;

with ranked_candidates as (
  select
    target.id as target_id,
    source.branch_id,
    row_number() over (
      partition by target.id
      order by abs(extract(epoch from (source.created_at - target.created_at))), source.created_at desc
    ) as candidate_rank
  from public.treatments target
  cross join lateral (
    select record.branch_id, record.created_at
    from public.dental_records record
    where record.patient_id = target.patient_id and record.branch_id is not null
    union all
    select treatment.branch_id, treatment.created_at
    from public.treatments treatment
    where treatment.patient_id = target.patient_id and treatment.branch_id is not null and treatment.id <> target.id
    union all
    select plan.branch_id, plan.created_at
    from public.treatment_plans plan
    where plan.patient_id = target.patient_id and plan.branch_id is not null
    union all
    select appointment.branch_id::text, appointment.created_at
    from public.appointments appointment
    where appointment.patient_id = target.patient_id and appointment.branch_id is not null
  ) source
  where target.branch_id is null
), selected_candidates as (
  select target_id, branch_id from ranked_candidates where candidate_rank = 1
)
update public.treatments target
set branch_id = candidate.branch_id, updated_at = now()
from selected_candidates candidate
where target.id = candidate.target_id and target.branch_id is null;

with ranked_candidates as (
  select
    target.id as target_id,
    source.branch_id,
    row_number() over (
      partition by target.id
      order by abs(extract(epoch from (source.created_at - target.created_at))), source.created_at desc
    ) as candidate_rank
  from public.treatment_plans target
  cross join lateral (
    select plan.branch_id, plan.created_at
    from public.treatment_plans plan
    where plan.patient_id = target.patient_id and plan.branch_id is not null and plan.id <> target.id
    union all
    select treatment.branch_id, treatment.created_at
    from public.treatments treatment
    where treatment.patient_id = target.patient_id and treatment.branch_id is not null
    union all
    select record.branch_id, record.created_at
    from public.dental_records record
    where record.patient_id = target.patient_id and record.branch_id is not null
    union all
    select appointment.branch_id::text, appointment.created_at
    from public.appointments appointment
    where appointment.patient_id = target.patient_id and appointment.branch_id is not null
  ) source
  where target.branch_id is null
), selected_candidates as (
  select target_id, branch_id from ranked_candidates where candidate_rank = 1
)
update public.treatment_plans target
set branch_id = candidate.branch_id, updated_at = now()
from selected_candidates candidate
where target.id = candidate.target_id and target.branch_id is null;
