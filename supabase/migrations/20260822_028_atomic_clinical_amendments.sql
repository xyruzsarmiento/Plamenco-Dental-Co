create or replace function public.add_clinical_record_amendment(p_dental_record_id uuid,p_amendment_text text,p_reason text,p_provider_id text default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 v_uid uuid:=auth.uid(); v_actor text; v_record public.dental_records%rowtype; v_amend public.clinical_record_amendments%rowtype;
begin
 if v_uid is null or not public.has_profile_permission('clinical_records.amend') then raise exception 'Not authorized to amend clinical records.' using errcode='42501'; end if;
 if trim(coalesce(p_amendment_text,''))='' or trim(coalesce(p_reason,''))='' then raise exception 'Amendment text and reason are required.'; end if;
 select coalesce(nullif(full_name,''),nullif(email,''),v_uid::text) into v_actor from public.profiles where id=v_uid and status='active';
 if v_actor is null then raise exception 'Active clinic profile required.' using errcode='42501'; end if;
 select * into v_record from public.dental_records where id=p_dental_record_id for update;
 if not found then raise exception 'Clinical record not found.'; end if;
 if v_record.status not in ('finalized','amended') then raise exception 'Only finalized clinical records can be amended.'; end if;
 insert into public.clinical_record_amendments(id,dental_record_id,patient_id,provider_id,amendment_text,reason,author)
 values(gen_random_uuid()::text,v_record.id::text,v_record.patient_id::text,nullif(p_provider_id,''),trim(p_amendment_text),trim(p_reason),v_actor)
 returning * into v_amend;
 update public.dental_records set status='amended',last_updated_by=v_actor,updated_at=now() where id=v_record.id returning * into v_record;
 insert into public.audit_logs(user_name,action,entity,entity_id,metadata) values(v_actor,'clinical_record_amendment_added','dental_record',v_record.id::text,jsonb_build_object('patientId',v_record.patient_id,'providerId',p_provider_id,'reason',p_reason));
 return jsonb_build_object('amendment',to_jsonb(v_amend),'record',to_jsonb(v_record));
end;$$;
revoke all on function public.add_clinical_record_amendment(uuid,text,text,text) from public,anon;
grant execute on function public.add_clinical_record_amendment(uuid,text,text,text) to authenticated;

alter policy clinical_amendments_read_self_or_internal on public.clinical_record_amendments to authenticated;
alter policy clinical_amendments_write_clinical_authorized on public.clinical_record_amendments to authenticated;