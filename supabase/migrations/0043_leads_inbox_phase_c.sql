begin;

do $$
begin
  if to_regprocedure('public.lead_inbox_action(text,uuid[],timestamp with time zone,timestamp with time zone)') is null then
    raise exception 'Apply migration 0042_leads_inbox_phase_a.sql first';
  end if;
end;
$$;

create or replace function public.lead_inbox_action(
  p_action text, p_lead_ids uuid[], p_remind_at timestamptz default null,
  p_snooze_until timestamptz default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if p_action not in ('star','unstar','read','unread','archive','unarchive','snooze','unsnooze',
      'remind','clear_reminder','trash','restore','delete_forever') then
    raise invalid_parameter_value using message = 'Invalid lead inbox action';
  end if;
  if p_lead_ids is null or cardinality(p_lead_ids) = 0 or cardinality(p_lead_ids) > 25 then
    raise invalid_parameter_value using message = 'Choose between 1 and 25 leads';
  end if;
  if p_action in ('trash','restore','delete_forever') and not exists (
    select from public.form_submissions f join public.sites s on s.id = f.site_id
    where f.id = any(p_lead_ids)
      and (public.is_super_admin() or public.is_account_owner(s.account_id))
  ) then
    raise insufficient_privilege using message = 'Only owners can change lead trash';
  end if;
  if p_action = 'delete_forever' then
    delete from public.form_submissions f
    where f.id = any(p_lead_ids) and f.deleted_at is not null
      and (public.is_super_admin() or exists (
        select from public.sites s where s.id = f.site_id
          and public.is_account_owner(s.account_id)
      ));
  else
    update public.form_submissions f set
      starred = case when p_action = 'star' then true when p_action = 'unstar' then false else starred end,
      is_read = case when p_action = 'read' then true when p_action = 'unread' then false else is_read end,
      unread = case when p_action = 'read' then false when p_action = 'unread' then true else unread end,
      has_unread_reply = case when p_action = 'read' then false else has_unread_reply end,
      archived = case when p_action = 'archive' then true when p_action = 'unarchive' then false else archived end,
      archived_at = case when p_action = 'archive' then now()
        when p_action = 'unarchive' then null else archived_at end,
      snoozed_until = case when p_action = 'snooze' then p_snooze_until
        when p_action = 'unsnooze' then null else snoozed_until end,
      remind_at = case when p_action = 'remind' then p_remind_at
        when p_action = 'clear_reminder' then null else remind_at end,
      deleted_at = case when p_action = 'trash' then now()
        when p_action = 'restore' then null else deleted_at end
    where f.id = any(p_lead_ids) and public.can_access_site_leads(f.site_id)
      and (p_action not in ('trash','restore')
        or public.is_super_admin()
        or exists (select from public.sites s where s.id = f.site_id
          and public.is_account_owner(s.account_id)));
  end if;
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.lead_inbox_action(text, uuid[], timestamptz, timestamptz) from public, anon;
grant execute on function public.lead_inbox_action(text, uuid[], timestamptz, timestamptz) to authenticated;

commit;
