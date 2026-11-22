begin;

do $$
begin
  if to_regclass('public.lead_messages') is null
    or to_regprocedure('public.check_lead_worker(text)') is null then
    raise exception 'Apply migrations 0034_leads_phase_a.sql through 0036_postmark_email_events.sql first';
  end if;
end;
$$;

alter table public.form_submissions
  add column starred boolean not null default false,
  add column archived_at timestamptz,
  add column deleted_at timestamptz,
  add column snoozed_until timestamptz,
  add column remind_at timestamptz,
  add column last_message_direction text check (last_message_direction in ('in', 'out')),
  add column last_message_at timestamptz,
  add column last_message_preview text,
  add column unread boolean not null default false;

update public.form_submissions
  set archived_at = case when archived then coalesce(status_changed_at, created_at) else null end,
      unread = case when has_unread_reply or not is_read then true else false end;

create index leads_needs_reply_idx on public.form_submissions
  (site_id, archived_at, deleted_at, snoozed_until, last_message_at desc, id desc);
create index leads_waiting_idx on public.form_submissions
  (site_id, archived_at, deleted_at, snoozed_until, last_message_at desc, id desc)
  where last_message_direction = 'out';
create index leads_starred_idx on public.form_submissions
  (site_id, starred, deleted_at, archived_at, last_activity_at desc, id desc)
  where starred;
create index leads_status_idx on public.form_submissions
  (site_id, status, archived_at, deleted_at, last_activity_at desc, id desc);
create index leads_trash_idx on public.form_submissions
  (deleted_at, id);
create index leads_reminders_idx on public.form_submissions
  (remind_at) where remind_at is not null and deleted_at is null;
create index leads_snoozed_idx on public.form_submissions
  (snoozed_until) where snoozed_until is not null and deleted_at is null;

grant update (
  starred, archived, archived_at, snoozed_until, remind_at, unread,
  is_read, status
) on public.form_submissions to authenticated;

create function public.can_access_site_leads(p_site uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select from public.sites s where s.id = p_site and public.is_account_member(s.account_id)
  )
$$;
revoke all on function public.can_access_site_leads(uuid) from public, anon;
grant execute on function public.can_access_site_leads(uuid) to authenticated, service_role;

create policy "members read form submissions" on public.form_submissions
  for select to authenticated using (
    exists (
      select from public.sites s
      where s.id = site_id and public.is_account_member(s.account_id)
    )
  );
create policy "members update lead inbox state" on public.form_submissions
  for update to authenticated using (
    exists (
      select from public.sites s
      where s.id = site_id and public.is_account_member(s.account_id)
    )
  ) with check (
    exists (
      select from public.sites s
      where s.id = site_id and public.is_account_member(s.account_id)
    )
  );

drop policy if exists lead_notes_read on public.lead_notes;
drop policy if exists lead_notes_add on public.lead_notes;
drop policy if exists lead_notes_edit on public.lead_notes;
drop policy if exists lead_notes_remove on public.lead_notes;
create policy lead_notes_member_read on public.lead_notes for select to authenticated
  using (public.can_access_site_leads(site_id));
create policy lead_notes_member_add on public.lead_notes for insert to authenticated
  with check (public.can_access_site_leads(site_id) and author_id = auth.uid());
create policy lead_notes_member_edit on public.lead_notes for update to authenticated
  using (public.can_access_site_leads(site_id) and author_id = auth.uid())
  with check (public.can_access_site_leads(site_id) and author_id = auth.uid());
create policy lead_notes_member_remove on public.lead_notes for delete to authenticated
  using (public.can_access_site_leads(site_id) and author_id = auth.uid());

drop policy if exists lead_events_read on public.lead_events;
create policy lead_events_member_read on public.lead_events for select to authenticated
  using (public.can_access_site_leads(site_id));

drop policy if exists lead_message_read on public.lead_messages;
create policy lead_message_member_read on public.lead_messages for select to authenticated
  using (public.can_access_site_leads(site_id));

create function public.sync_lead_inbox_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare preview text;
begin
  preview := left(coalesce(nullif(btrim(new.body_text), ''), '(No text)'), 240);
  update public.form_submissions set
    last_message_direction = new.direction,
    last_message_at = new.created_at,
    last_message_preview = preview,
    last_activity_at = greatest(last_activity_at, new.created_at),
    has_unread_reply = case when new.direction = 'in' and not new.auto_reply
      then true else has_unread_reply end,
    unread = case when new.direction = 'in' and not new.auto_reply
      then true else unread end,
    remind_at = case when new.direction = 'in' and not new.auto_reply
      then null else remind_at end
  where id = new.lead_id and site_id = new.site_id;
  return null;
end;
$$;
create trigger sync_lead_inbox_message after insert on public.lead_messages
  for each row execute function public.sync_lead_inbox_message();

create function public.sync_lead_archived_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.archived and not old.archived then
    new.archived_at := coalesce(statement_timestamp(), now());
  elsif not new.archived then
    new.archived_at := null;
  end if;
  return new;
end;
$$;
create trigger sync_lead_archived_at before update of archived on public.form_submissions
  for each row execute function public.sync_lead_archived_at();

create or replace function public.clear_lead_unread_reply() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.has_unread_reply := false;
  new.unread := false;
  return new;
end;
$$;

create function public.lead_inbox_counts(p_site_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visible as (
    select f.* from public.form_submissions f
    where f.deleted_at is null
      and (p_site_id is null or f.site_id = p_site_id)
  )
  select jsonb_build_object(
    'needs_reply', count(*) filter (where archived_at is null
      and (snoozed_until is null or snoozed_until <= now())
      and (last_message_direction = 'in' or (last_message_direction is null and status = 'new'))),
    'waiting', count(*) filter (where archived_at is null
      and last_message_direction = 'out'
      and (snoozed_until is null or snoozed_until <= now())),
    'all_open', count(*) filter (where archived_at is null and status not in ('won', 'lost')),
    'starred', count(*) filter (where starred),
    'won', count(*) filter (where archived_at is null and status = 'won'),
    'lost', count(*) filter (where archived_at is null and status = 'lost'),
    'archived', (select count(*) from public.form_submissions a
      where a.deleted_at is null and a.archived_at is not null
        and (p_site_id is null or a.site_id = p_site_id)),
    'trash', (select count(*) from public.form_submissions t
      where t.deleted_at is not null and (p_site_id is null or t.site_id = p_site_id))
  ) from visible
$$;
revoke all on function public.lead_inbox_counts(uuid) from public, anon;
grant execute on function public.lead_inbox_counts(uuid) to authenticated;

create function public.lead_inbox_view(
  p_view text, p_site_id uuid default null, p_search text default null,
  p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_limit integer default 25
) returns table (
  id uuid, site_id uuid, form_name text, page_path text, data jsonb, created_at timestamptz,
  is_read boolean, status text, status_changed_at timestamptz, last_activity_at timestamptz,
  has_unread_reply boolean, archived boolean, starred boolean, archived_at timestamptz,
  deleted_at timestamptz, snoozed_until timestamptz, remind_at timestamptz,
  last_message_direction text, last_message_at timestamptz, last_message_preview text, unread boolean
) language sql stable security invoker set search_path = '' as $$
  with filtered as (
    select f.* from public.form_submissions f
    where (p_site_id is null or f.site_id = p_site_id)
      and (
        p_view = 'trash' and f.deleted_at is not null
        or p_view = 'archived' and f.deleted_at is null and f.archived_at is not null
        or p_view = 'all_open' and f.deleted_at is null and f.archived_at is null and f.status not in ('won', 'lost')
        or p_view = 'needs_reply' and f.deleted_at is null and f.archived_at is null
          and (f.snoozed_until is null or f.snoozed_until <= now())
          and (f.last_message_direction = 'in' or (f.last_message_direction is null and f.status = 'new'))
        or p_view = 'waiting' and f.deleted_at is null and f.archived_at is null
          and f.last_message_direction = 'out'
          and (f.snoozed_until is null or f.snoozed_until <= now())
        or p_view = 'starred' and f.deleted_at is null and f.starred
        or p_view = 'won' and f.deleted_at is null and f.archived_at is null and f.status = 'won'
        or p_view = 'lost' and f.deleted_at is null and f.archived_at is null and f.status = 'lost'
      )
      and (
        p_search is null or length(btrim(p_search)) = 0
        or exists (
          select from public.lead_messages m
          where m.lead_id = f.id
            and (m.subject ilike '%' || p_search || '%' or m.body_text ilike '%' || p_search || '%')
        )
        or f.data::text ilike '%' || p_search || '%'
        or f.form_name ilike '%' || p_search || '%'
        or f.page_path ilike '%' || p_search || '%'
      )
  )
  select f.id, f.site_id, f.form_name, f.page_path, f.data, f.created_at,
    f.is_read, f.status, f.status_changed_at, f.last_activity_at,
    f.has_unread_reply, f.archived, f.starred, f.archived_at,
    f.deleted_at, f.snoozed_until, f.remind_at,
    f.last_message_direction, f.last_message_at, f.last_message_preview, f.unread
  from filtered f
  where p_cursor_at is null or (f.last_activity_at, f.id) < (p_cursor_at, p_cursor_id)
  order by f.last_activity_at desc, f.id desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100)
$$;
revoke all on function public.lead_inbox_view(text, uuid, text, timestamptz, uuid, integer) from public, anon;
grant execute on function public.lead_inbox_view(text, uuid, text, timestamptz, uuid, integer) to authenticated;

create function public.lead_inbox_action(
  p_action text, p_lead_ids uuid[], p_remind_at timestamptz default null,
  p_snooze_until timestamptz default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if p_action not in ('star','unstar','read','unread','archive','unarchive','snooze','unsnooze',
      'remind','clear_reminder','trash','restore') then
    raise invalid_parameter_value using message = 'Invalid lead inbox action';
  end if;
  if p_lead_ids is null or cardinality(p_lead_ids) = 0 or cardinality(p_lead_ids) > 25 then
    raise invalid_parameter_value using message = 'Choose between 1 and 25 leads';
  end if;
  if p_action in ('trash','restore') and not exists (
    select from public.form_submissions f join public.sites s on s.id = f.site_id
    where f.id = any(p_lead_ids)
      and (public.is_super_admin() or public.is_account_owner(s.account_id))
  ) then
    raise insufficient_privilege using message = 'Only owners can trash or restore leads';
  end if;
  update public.form_submissions f set
    starred = case when p_action = 'star' then true when p_action = 'unstar' then false else starred end,
    is_read = case when p_action = 'read' then true when p_action = 'unread' then false else is_read end,
    unread = case when p_action = 'read' then false when p_action = 'unread' then true else unread end,
    has_unread_reply = case when p_action = 'read' then false else has_unread_reply end,
    archived = case when p_action = 'archive' then true when p_action = 'unarchive' then false else archived end,
    snoozed_until = case when p_action = 'snooze' then p_snooze_until
      when p_action = 'unsnooze' then null else snoozed_until end,
    remind_at = case when p_action = 'remind' then p_remind_at
      when p_action = 'clear_reminder' then null else remind_at end,
    deleted_at = case when p_action = 'trash' then now()
      when p_action = 'restore' then null else deleted_at end
  where f.id = any(p_lead_ids)
    and public.can_access_site_leads(f.site_id)
    and (p_action not in ('trash','restore')
      or public.is_super_admin()
      or exists (select from public.sites s where s.id = f.site_id
        and public.is_account_owner(s.account_id)));
  get diagnostics affected = row_count;
  if p_action = 'snooze' and affected > 0 and (p_snooze_until is null or p_snooze_until <= now()) then
    raise invalid_parameter_value using message = 'Snooze must be in the future';
  end if;
  if p_action = 'remind' and affected > 0 and (p_remind_at is null or p_remind_at <= now()) then
    raise invalid_parameter_value using message = 'Reminder must be in the future';
  end if;
  return affected;
end;
$$;
revoke all on function public.lead_inbox_action(text, uuid[], timestamptz, timestamptz) from public, anon;
grant execute on function public.lead_inbox_action(text, uuid[], timestamptz, timestamptz) to authenticated;

create function public.lead_worker_maintenance(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare purged integer; due_reminders integer; due_snoozes integer;
begin
  perform public.check_lead_worker(p_secret);
  delete from public.form_submissions
    where deleted_at is not null and deleted_at < now() - interval '30 days';
  get diagnostics purged = row_count;
  select count(*) into due_reminders from public.form_submissions
    where remind_at is not null and remind_at <= now() and deleted_at is null;
  select count(*) into due_snoozes from public.form_submissions
    where snoozed_until is not null and snoozed_until <= now() and deleted_at is null;
  return jsonb_build_object('purged', purged, 'due_reminders', due_reminders, 'due_snoozes', due_snoozes);
end;
$$;
revoke all on function public.lead_worker_maintenance(text) from public, authenticated;
grant execute on function public.lead_worker_maintenance(text) to anon;

create or replace function public.track_lead_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := statement_timestamp();
    new.last_activity_at := greatest(new.last_activity_at, new.status_changed_at);
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    new.last_activity_at := greatest(new.last_activity_at, statement_timestamp());
  end if;
  return new;
end;
$$;

commit;
