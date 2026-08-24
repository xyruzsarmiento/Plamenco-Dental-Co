-- Part 7: Forms & Consent version-management actions.
-- Keeps historical signed consent records immutable while allowing safe draft cleanup.

create or replace function public.form_version_usage_summary(
  p_version_ids uuid[]
)
returns table(
  version_id uuid,
  assignment_count integer,
  signed_submission_count integer,
  final_submission_count integer
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.can_administer_forms() then
    raise exception 'Not authorized to review form version usage.';
  end if;

  return query
  select
    requested.requested_version_id,
    coalesce(assignments.assignment_count, 0)::integer,
    coalesce(submissions.signed_submission_count, 0)::integer,
    coalesce(submissions.final_submission_count, 0)::integer
  from unnest(p_version_ids) as requested(requested_version_id)
  left join lateral (
    select count(*) as assignment_count
    from public.patient_form_assignments a
    where a.template_version_id = requested.requested_version_id
  ) assignments on true
  left join lateral (
    select
      count(*) filter (where s.status = 'signed') as signed_submission_count,
      count(*) as final_submission_count
    from public.patient_form_submissions s
    where s.template_version_id = requested.requested_version_id
  ) submissions on true;
end;
$$;

create or replace function public.delete_form_template_draft_version(
  p_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.form_template_versions%rowtype;
  v_remaining_count integer;
  v_has_published boolean;
  v_has_draft boolean;
begin
  if not public.can_administer_forms() then
    raise exception 'Not authorized to delete form drafts.';
  end if;

  select * into v_version
  from public.form_template_versions
  where id = p_version_id
  for update;

  if v_version.id is null then
    raise exception 'Form version not found.';
  end if;

  if v_version.version_status <> 'draft' then
    raise exception 'Only draft form versions can be deleted. Archive published versions instead.';
  end if;

  if exists(select 1 from public.patient_form_assignments where template_version_id = p_version_id)
     or exists(select 1 from public.patient_form_submissions where template_version_id = p_version_id) then
    raise exception 'This form version is referenced by patient consent records and cannot be deleted.';
  end if;

  delete from public.form_template_versions
  where id = p_version_id
    and version_status = 'draft';

  select count(*), bool_or(version_status = 'published'), bool_or(version_status = 'draft')
  into v_remaining_count, v_has_published, v_has_draft
  from public.form_template_versions
  where template_id = v_version.template_id;

  if v_remaining_count = 0 then
    delete from public.form_templates
    where id = v_version.template_id
      and status = 'draft';
  else
    update public.form_templates
    set
      status = case
        when coalesce(v_has_published, false) then 'published'
        when coalesce(v_has_draft, false) then 'draft'
        else 'archived'
      end,
      updated_at = now()
    where id = v_version.template_id
      and status <> 'archived';
  end if;

  return p_version_id;
end;
$$;

create or replace function public.archive_form_template_version(
  p_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.form_template_versions%rowtype;
  v_next_current uuid;
  v_has_draft boolean;
begin
  if not public.can_administer_forms() then
    raise exception 'Not authorized to archive form versions.';
  end if;

  select * into v_version
  from public.form_template_versions
  where id = p_version_id
  for update;

  if v_version.id is null then
    raise exception 'Form version not found.';
  end if;

  if v_version.version_status = 'draft' then
    raise exception 'Draft versions can be deleted instead of archived.';
  end if;

  if v_version.version_status = 'archived' then
    return p_version_id;
  end if;

  update public.form_template_versions
  set version_status = 'archived', updated_at = now()
  where id = p_version_id
    and version_status = 'published';

  select id into v_next_current
  from public.form_template_versions
  where template_id = v_version.template_id
    and version_status = 'published'
  order by version_number desc
  limit 1;

  select exists(
    select 1 from public.form_template_versions
    where template_id = v_version.template_id
      and version_status = 'draft'
  ) into v_has_draft;

  update public.form_templates
  set
    current_version_id = v_next_current,
    status = case
      when v_next_current is not null then 'published'
      when v_has_draft then 'draft'
      else 'archived'
    end,
    archived_at = case when v_next_current is null then now() else archived_at end,
    archived_by = case when v_next_current is null then auth.uid() else archived_by end,
    updated_at = now()
  where id = v_version.template_id;

  return p_version_id;
end;
$$;

create or replace function public.create_form_version_draft_from_version(
  p_source_version_id uuid
)
returns table(template_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.form_template_versions%rowtype;
  v_next integer;
  v_new uuid;
begin
  if not public.can_administer_forms() then
    raise exception 'Not authorized to manage forms.';
  end if;

  select * into v_source
  from public.form_template_versions
  where id = p_source_version_id;

  if v_source.id is null then
    raise exception 'Source form version not found.';
  end if;

  if exists(select 1 from public.form_template_versions where template_id = v_source.template_id and version_status = 'draft') then
    raise exception 'This form already has a draft version.';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next
  from public.form_template_versions
  where template_id = v_source.template_id;

  insert into public.form_template_versions(
    template_id, version_number, content, requires_signature, signature_method,
    effective_date, version_status
  ) values (
    v_source.template_id, v_next, v_source.content, v_source.requires_signature,
    v_source.signature_method, v_source.effective_date, 'draft'
  ) returning id into v_new;

  update public.form_templates
  set status = case when status = 'archived' then 'draft' else status end,
      archived_at = case when status = 'archived' then null else archived_at end,
      archived_by = case when status = 'archived' then null else archived_by end,
      updated_at = now()
  where id = v_source.template_id;

  return query select v_source.template_id, v_new, v_next;
end;
$$;

revoke all on function public.form_version_usage_summary(uuid[]) from public;
revoke all on function public.delete_form_template_draft_version(uuid) from public;
revoke all on function public.archive_form_template_version(uuid) from public;
revoke all on function public.create_form_version_draft_from_version(uuid) from public;
revoke all on function public.form_version_usage_summary(uuid[]) from anon;
revoke all on function public.delete_form_template_draft_version(uuid) from anon;
revoke all on function public.archive_form_template_version(uuid) from anon;
revoke all on function public.create_form_version_draft_from_version(uuid) from anon;

grant execute on function public.form_version_usage_summary(uuid[]) to authenticated;
grant execute on function public.delete_form_template_draft_version(uuid) to authenticated;
grant execute on function public.archive_form_template_version(uuid) to authenticated;
grant execute on function public.create_form_version_draft_from_version(uuid) to authenticated;
