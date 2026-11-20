begin;

alter table public.agency_settings add column show_lead_email_branding boolean not null default false;
alter table public.lead_site_settings
  add column reply_mode text not null default 'tracked' check (reply_mode in ('tracked', 'direct')),
  add column verified_from_domain text; -- TODO (Level 2): verify and use the client's own sending domain.
grant update (reply_mode) on public.lead_site_settings to authenticated;
alter table public.form_submissions add column lead_email_bounced_at timestamptz;

create table public.lead_send_limits (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  daily_limit integer not null check (daily_limit between 0 and 10000)
);
create table public.lead_send_days (
  account_id uuid not null references public.accounts(id) on delete cascade,
  day date not null,
  attempts integer not null,
  primary key (account_id, day)
);
create table public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  site_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  from_email text not null,
  to_email text not null,
  subject text not null check (length(subject) <= 998),
  body_text text not null check (length(body_text) <= 1000000),
  body_html text not null check (length(body_html) <= 3100000),
  forward_text text check (length(forward_text) <= 1000000),
  postmark_message_id text,
  in_reply_to text,
  actor_id uuid references public.profiles(id) on delete set null,
  delivery_state text not null check (delivery_state in ('sending', 'sent', 'failed', 'received')),
  auto_reply boolean not null default false,
  reply_mode text check (reply_mode in ('tracked', 'direct')),
  has_attachments boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (lead_id, site_id) references public.form_submissions(id, site_id) on delete cascade,
  unique (direction, postmark_message_id)
);
create index lead_message_thread_idx on public.lead_messages (lead_id, created_at desc, id);

create table public.lead_reply_templates (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  body_text text not null check (length(btrim(body_text)) between 1 and 8000),
  unique (site_id, name)
);
create table public.lead_reply_forwards (
  message_id uuid not null references public.lead_messages(id) on delete cascade,
  recipient text not null,
  attempts integer not null default 0,
  state text not null default 'pending' check (state in ('pending', 'retrying', 'sent', 'failed', 'canceled')),
  next_at timestamptz not null default now(),
  lease_id uuid,
  primary key (message_id, recipient)
);
create index lead_reply_forward_queue_idx on public.lead_reply_forwards(next_at) where state in ('pending', 'retrying');

alter table public.lead_send_limits enable row level security;
alter table public.lead_send_days enable row level security;
alter table public.lead_messages enable row level security;
alter table public.lead_reply_templates enable row level security;
alter table public.lead_reply_forwards enable row level security;
revoke all on public.lead_send_limits, public.lead_send_days, public.lead_messages,
  public.lead_reply_templates, public.lead_reply_forwards from public, anon, authenticated;
grant select on public.lead_messages, public.lead_reply_templates, public.lead_send_limits to authenticated;
grant select (message_id, state) on public.lead_reply_forwards to authenticated;
grant insert, update, delete on public.lead_send_limits to authenticated;
grant insert (site_id, name, body_text), update (name, body_text), delete
  on public.lead_reply_templates to authenticated;
create policy lead_message_read on public.lead_messages for select to authenticated
  using (public.can_manage_site_leads(site_id));
create policy lead_template_access on public.lead_reply_templates for all to authenticated
  using (public.can_manage_site_leads(site_id)) with check (public.can_manage_site_leads(site_id));
create policy lead_limits_admin on public.lead_send_limits for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy lead_forwards_read on public.lead_reply_forwards for select to authenticated using (
  exists (select from public.lead_messages m where m.id = message_id and public.can_manage_site_leads(m.site_id))
);

create function public.lead_contact_email(p_fields jsonb) returns text
language sql immutable set search_path = '' as $$
  select lower(btrim(value #>> '{}'))
  from jsonb_each(case when jsonb_typeof(p_fields) = 'object' then p_fields else '{}'::jsonb end) as f(key, value)
  where regexp_replace(lower(key), '[[:space:]_-]+', '', 'g') in ('email', 'emailaddress')
    and jsonb_typeof(value) = 'string'
  order by case when regexp_replace(lower(key), '[[:space:]_-]+', '', 'g') = 'email' then 0 else 1 end, key collate "C"
  limit 1
$$;

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
    and (not p_reply_prefs or not exists (
      select from public.lead_notification_preferences pref join public.profiles p on p.id = pref.user_id
      where pref.site_id = p_site and not pref.replies and lower(p.email) = c.email
        and (p.is_super_admin or exists (select from owners o where o.email = c.email))
    )) order by c.email limit 50);
$$;

create function public.get_lead_reply_route(p_lead uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare found_lead record;
begin
  select f.site_id, f.data, f.lead_email_bounced_at, f.archived, coalesce(cfg.reply_mode, 'tracked') as mode
    into found_lead from public.form_submissions f left join public.lead_site_settings cfg on cfg.site_id = f.site_id
    where f.id = p_lead and public.can_manage_site_leads(f.site_id);
  if not found then return null; end if;
  return jsonb_build_object('email', public.lead_contact_email(found_lead.data), 'mode', found_lead.mode,
    'direct_to', (public.lead_mail_recipients(found_lead.site_id, false, false))[1],
    'owner_copy', (public.lead_mail_recipients(found_lead.site_id, false, true))[1],
    'bounced', found_lead.lead_email_bounced_at is not null, 'archived', found_lead.archived);
end;
$$;

create function public.reserve_lead_reply(p_secret text, p_lead uuid, p_actor uuid, p_request uuid, p_to text,
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
    or f.archived or f.lead_email_bounced_at is not null or not (
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

create function public.finish_lead_reply(p_secret text, p_request uuid, p_provider_id text, p_bounced boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  perform public.check_lead_worker(p_secret);
  update public.lead_messages set delivery_state = case when p_provider_id is null then 'failed' else 'sent' end,
    postmark_message_id = p_provider_id where id = p_request and direction = 'out' and delivery_state = 'sending'
    returning lead_id, site_id, actor_id into m;
  if not found then return false; end if;
  if p_bounced then
    update public.form_submissions set lead_email_bounced_at = now() where id = m.lead_id;
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

create function public.store_lead_inbound(p_secret text, p_lead uuid, p_from text, p_to text,
  p_subject text, p_text text, p_html text, p_full_text text, p_provider_id text, p_in_reply_to text,
  p_auto boolean, p_attachments boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare f record; mid uuid;
begin
  perform public.check_lead_worker(p_secret);
  select lead.site_id, lead.data into f from public.form_submissions lead where lead.id = p_lead;
  if not found or p_from is null or public.lead_contact_email(f.data) is distinct from p_from
    or not exists (select from public.lead_messages m where m.lead_id = p_lead and m.direction = 'out'
      and m.reply_mode = 'tracked' and m.delivery_state in ('sent', 'sending')) then return null; end if;
  insert into public.lead_messages(lead_id, site_id, direction, from_email, to_email, subject, body_text, body_html,
    forward_text, postmark_message_id, in_reply_to, delivery_state, auto_reply, has_attachments)
    values (p_lead, f.site_id, 'in', p_from, p_to, p_subject, p_text, p_html, p_full_text, p_provider_id, p_in_reply_to, 'received', p_auto, p_attachments)
    on conflict (direction, postmark_message_id) do nothing returning id into mid;
  if mid is not null and not p_auto then
    update public.form_submissions set has_unread_reply = true,
      last_activity_at = greatest(last_activity_at, now()) where id = p_lead;
    insert into public.lead_events(lead_id, site_id, type, data)
      values (p_lead, f.site_id, 'reply_received', jsonb_build_object('message_id', mid));
    insert into public.lead_reply_forwards(message_id, recipient)
      select mid, unnest(public.lead_mail_recipients(f.site_id, true, false));
  end if;
  return mid;
end;
$$;

create function public.claim_lead_reply_forwards(p_secret text, p_message uuid default null)
returns table (message_id uuid, recipient text, lease_id uuid, lead_id uuid, lead_name text, business text,
  lead_email text, subject text, body_text text, original_text text, has_attachments boolean)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_lead_worker(p_secret);
  update public.lead_reply_forwards q set state = 'failed', lease_id = null
    where q.attempts >= 4 and q.next_at <= now() and q.state in ('pending', 'retrying')
      and (p_message is null or q.message_id = p_message);
  update public.lead_reply_forwards q set state = 'canceled', lease_id = null
    from public.lead_messages m where m.id = q.message_id and q.next_at <= now()
      and q.state in ('pending', 'retrying') and (p_message is null or q.message_id = p_message)
      and not (q.recipient = any(public.lead_mail_recipients(m.site_id, true, false)));
  return query with due as (
    select q.message_id, q.recipient from public.lead_reply_forwards q
    where (p_message is null or q.message_id = p_message) and q.next_at <= now()
      and q.state in ('pending', 'retrying') and q.attempts < 4
    order by q.next_at, q.message_id, q.recipient limit case when p_message is null then 20 else 50 end for update skip locked
  ), claimed as (
    update public.lead_reply_forwards q set attempts = q.attempts + 1, next_at = now() + interval '5 minutes',
      lease_id = gen_random_uuid() from due d where q.message_id = d.message_id and q.recipient = d.recipient returning q.*
  )
  select c.message_id, c.recipient, c.lease_id, m.lead_id,
    left(coalesce(f.data->>'Name', f.data->>'name', f.data->>'Full Name', 'Lead'), 100),
    coalesce(nullif(s.business->>'businessName', ''), s.name, s.subdomain), m.from_email,
    m.subject, coalesce(m.forward_text, m.body_text), coalesce(original.body_text, f.data::text, ''), m.has_attachments
  from claimed c join public.lead_messages m on m.id = c.message_id
    join public.form_submissions f on f.id = m.lead_id join public.sites s on s.id = m.site_id
    left join lateral (select o.body_text from public.lead_messages o
      where o.lead_id = m.lead_id and o.direction = 'out' and o.delivery_state = 'sent' and o.created_at <= m.created_at
      order by (o.postmark_message_id is not distinct from m.in_reply_to) desc, o.created_at desc limit 1) original on true;
end;
$$;

create function public.finish_lead_reply_forward(p_secret text, p_message uuid, p_lease uuid, p_sent boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_lead_worker(p_secret);
  update public.lead_reply_forwards q set state = case when p_sent then 'sent' when q.attempts >= 4 then 'failed' else 'retrying' end,
    next_at = now() + make_interval(mins => 5 * q.attempts), lease_id = null
    where q.message_id = p_message and q.lease_id = p_lease;
  return found;
end;
$$;

revoke all on function public.lead_contact_email(jsonb), public.lead_mail_recipients(uuid, boolean, boolean),
  public.get_lead_reply_route(uuid), public.reserve_lead_reply(text, uuid, uuid, uuid, text, text, text, text, text, text),
  public.finish_lead_reply(text, uuid, text, boolean), public.store_lead_inbound(text, uuid, text, text, text, text, text, text, text, text, boolean, boolean),
  public.claim_lead_reply_forwards(text, uuid), public.finish_lead_reply_forward(text, uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.get_lead_reply_route(uuid) to authenticated;
grant execute on function public.reserve_lead_reply(text, uuid, uuid, uuid, text, text, text, text, text, text),
  public.finish_lead_reply(text, uuid, text, boolean), public.store_lead_inbound(text, uuid, text, text, text, text, text, text, text, text, boolean, boolean),
  public.claim_lead_reply_forwards(text, uuid), public.finish_lead_reply_forward(text, uuid, uuid, boolean) to anon;

commit;
