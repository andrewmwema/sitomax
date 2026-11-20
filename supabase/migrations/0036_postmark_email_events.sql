begin;

create table public.email_suppressions (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'),
  event_type text not null check (event_type in ('bounce', 'spam_complaint')),
  reason text not null default '' check (length(reason) <= 1000),
  message_stream text not null default '' check (length(message_stream) <= 200),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from public, anon, authenticated;

create function public.lead_mail_recipients(p_site uuid, p_reply_prefs boolean, p_owners_only boolean) returns text[]
language sql stable set search_path = '' as $$
  with site as (
    select s.account_id, cfg.recipients from public.sites s
      left join public.lead_site_settings cfg on cfg.site_id = s.id where s.id = p_site
  ), owners as (
    select lower(p.email) as email from site
      join public.account_members m on m.account_id = site.account_id and m.role = 'owner'
      join public.profiles p on p.id = m.user_id
  ), candidates as (
    select distinct lower(address) as email from site cross join lateral unnest(
      case when not p_owners_only and cardinality(site.recipients) > 0 then site.recipients
        else array(select owners.email from owners) end
    ) t(address)
  )
  select array(select c.email from candidates c
    where c.email ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'
    and not exists (select from public.email_suppressions x where x.email = c.email)
    and (not p_reply_prefs or not exists (
      select from public.lead_notification_preferences pref join public.profiles p on p.id = pref.user_id
      where pref.site_id = p_site and not pref.replies and lower(p.email) = c.email
        and (p.is_super_admin or exists (select from owners o where o.email = c.email))
    )) order by c.email limit 50);
$$;

create or replace function public.get_lead_reply_route(p_lead uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare found_lead record;
begin
  select f.site_id, f.data, f.lead_email_bounced_at, f.archived,
    coalesce(cfg.reply_mode, 'tracked') as mode, public.lead_contact_email(f.data) as email
    into found_lead from public.form_submissions f left join public.lead_site_settings cfg on cfg.site_id = f.site_id
    where f.id = p_lead and public.can_manage_site_leads(f.site_id);
  if not found then return null; end if;
  return jsonb_build_object(
    'email', found_lead.email, 'mode', found_lead.mode,
    'direct_to', (public.lead_mail_recipients(found_lead.site_id, false, false))[1],
    'owner_copy', (public.lead_mail_recipients(found_lead.site_id, false, true))[1],
    'bounced', found_lead.lead_email_bounced_at is not null,
    'undeliverable', found_lead.email is not null and exists (
      select from public.email_suppressions x where x.email = found_lead.email
    ),
    'undeliverable_type', (select x.event_type from public.email_suppressions x where x.email = found_lead.email),
    'undeliverable_reason', (select x.reason from public.email_suppressions x where x.email = found_lead.email),
    'archived', found_lead.archived
  );
end;
$$;

create or replace function public.reserve_lead_reply(p_secret text, p_lead uuid, p_actor uuid, p_request uuid, p_to text,
  p_from text, p_subject text, p_text text, p_html text, p_mode text) returns text
language plpgsql security definer set search_path = '' as $$
declare f record; used integer;
begin
  perform public.check_lead_worker(p_secret);
  select lead.site_id, lead.data, lead.lead_email_bounced_at, lead.archived, s.account_id,
    coalesce(cfg.reply_mode, 'tracked') as mode into f
    from public.form_submissions lead join public.sites s on s.id = lead.site_id
    left join public.lead_site_settings cfg on cfg.site_id = s.id where lead.id = p_lead;
  if not found or p_to is null or public.lead_contact_email(f.data) is distinct from p_to or f.mode is distinct from p_mode
    or f.archived or f.lead_email_bounced_at is not null
    or exists (select from public.email_suppressions x where x.email = p_to)
    or not (
      exists (select from public.profiles where id = p_actor and is_super_admin)
      or exists (select from public.account_members where account_id = f.account_id and user_id = p_actor and role = 'owner')
    ) then return 'unavailable'; end if;
  insert into public.lead_messages(id, lead_id, site_id, direction, from_email, to_email, subject, body_text, body_html, actor_id, delivery_state, reply_mode)
    values (p_request, p_lead, f.site_id, 'out', p_from, p_to, p_subject, p_text, p_html, p_actor, 'sending', p_mode)
    on conflict (id) do nothing;
  if not found then return 'duplicate'; end if;
  insert into public.lead_send_days(account_id, day, attempts)
    select f.account_id, (now() at time zone 'UTC')::date, 1
    where coalesce((select daily_limit from public.lead_send_limits where account_id = f.account_id), 50) > 0
    on conflict (account_id, day) do update set attempts = public.lead_send_days.attempts + 1
      where public.lead_send_days.attempts < coalesce((select daily_limit from public.lead_send_limits where account_id = f.account_id), 50)
    returning attempts into used;
  if used is null then
    delete from public.lead_messages where id = p_request;
    return 'limited';
  end if;
  return 'reserved';
end;
$$;

create or replace function public.finish_lead_reply(p_secret text, p_request uuid, p_provider_id text, p_bounced boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  perform public.check_lead_worker(p_secret);
  update public.lead_messages set delivery_state = case when p_provider_id is null then 'failed' else 'sent' end,
    postmark_message_id = p_provider_id where id = p_request and direction = 'out' and delivery_state = 'sending'
    returning lead_id, site_id, actor_id, to_email into m;
  if not found then return false; end if;
  if p_bounced then
    insert into public.email_suppressions(email, event_type, reason, message_stream, occurred_at)
      select m.to_email, 'bounce', 'Postmark rejected the recipient as inactive.', '', now()
      on conflict (email) do update set event_type = excluded.event_type, reason = excluded.reason,
        message_stream = excluded.message_stream, occurred_at = excluded.occurred_at, recorded_at = now()
        where public.email_suppressions.occurred_at <= excluded.occurred_at;
    update public.form_submissions set lead_email_bounced_at = now()
      where public.lead_contact_email(data) = m.to_email;
  end if;
  if p_provider_id is not null then
    update public.form_submissions set status = case when status = 'new' then 'contacted' else status end,
      last_activity_at = greatest(last_activity_at, now()) where id = m.lead_id;
    insert into public.lead_events(lead_id, site_id, type, data, actor_id)
      values (m.lead_id, m.site_id, 'email_sent', jsonb_build_object('message_id', p_request), m.actor_id);
  end if;
  return true;
end;
$$;

create function public.record_postmark_email_event(p_secret text, p_email text, p_event_type text,
  p_reason text, p_message_stream text, p_occurred_at timestamptz) returns integer
language plpgsql security definer set search_path = '' as $$
declare normalized_email text := lower(btrim(p_email)); changed integer;
begin
  perform public.check_lead_worker(p_secret);
  if normalized_email is null or normalized_email !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'
    or p_event_type not in ('bounce', 'spam_complaint') or p_occurred_at is null then
    raise invalid_parameter_value using message = 'Invalid Postmark email event';
  end if;
  insert into public.email_suppressions(email, event_type, reason, message_stream, occurred_at)
    values (normalized_email, p_event_type, left(coalesce(p_reason, ''), 1000),
      left(coalesce(p_message_stream, ''), 200), p_occurred_at)
    on conflict (email) do update set event_type = excluded.event_type, reason = excluded.reason,
      message_stream = excluded.message_stream, occurred_at = excluded.occurred_at, recorded_at = now()
      where public.email_suppressions.occurred_at <= excluded.occurred_at;
  update public.form_submissions set lead_email_bounced_at = greatest(coalesce(lead_email_bounced_at, p_occurred_at), p_occurred_at)
    where public.lead_contact_email(data) = normalized_email;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.claim_lead_digests(p_limit integer) returns table (
  site_id uuid, email text, site_name text, received bigint, awaiting bigint
)
language sql security invoker set search_path = '' as $$
  with due as (
    select pref.site_id, pref.user_id
    from public.lead_notification_preferences pref
    join public.sites s on s.id = pref.site_id
    join public.profiles p on p.id = pref.user_id
    where pref.digest and (pref.last_digest_on is null or pref.last_digest_on < (now() at time zone 'UTC')::date)
      and p.email is not null
      and not exists (select from public.email_suppressions x where x.email = lower(p.email))
      and (p.is_super_admin or exists (
        select from public.account_members m where m.account_id = s.account_id and m.user_id = p.id and m.role = 'owner'
      ))
    order by pref.last_digest_on nulls first, pref.site_id, pref.user_id
    limit least(greatest(coalesce(p_limit, 1), 1), 50) for update of pref skip locked
  ), claimed as (
    update public.lead_notification_preferences p set last_digest_on = (now() at time zone 'UTC')::date
      from due where p.site_id = due.site_id and p.user_id = due.user_id returning p.site_id, p.user_id
  )
  select s.id, p.email, coalesce(s.name, s.subdomain), totals.received, totals.awaiting
  from claimed c join public.sites s on s.id = c.site_id join public.profiles p on p.id = c.user_id
  cross join lateral (
    select count(*) filter (where f.created_at >= date_trunc('day', now(), 'UTC') - interval '1 day'
      and f.created_at < date_trunc('day', now(), 'UTC')) received,
      count(*) filter (where not f.archived and f.status = 'new' and f.created_at < now() - interval '24 hours') awaiting
    from public.form_submissions f where f.site_id = s.id
  ) totals;
$$;

revoke all on function public.record_postmark_email_event(text, text, text, text, text, timestamptz)
  from public, authenticated;
grant execute on function public.record_postmark_email_event(text, text, text, text, text, timestamptz) to anon;

-- Future scheduled report sends must exclude suppressed recipients:
-- not exists (select from public.email_suppressions x where x.email = lower(recipient)).

commit;
