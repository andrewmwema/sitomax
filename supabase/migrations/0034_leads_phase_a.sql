begin;

alter table public.form_submissions
  add column status text not null default 'new' check (status in ('new', 'contacted', 'won', 'lost')),
  add column status_changed_at timestamptz not null default now(),
  add column assigned_to uuid references public.profiles(id) on delete set null,
  add column last_activity_at timestamptz not null default now(),
  add column has_unread_reply boolean not null default false,
  add column archived boolean not null default false,
  add unique (id, site_id);

update public.form_submissions set last_activity_at = created_at, status_changed_at = created_at;
create index leads_inbox_idx on public.form_submissions
  (site_id, archived, has_unread_reply desc, is_read, created_at desc, id desc);
grant update (status, archived) on public.form_submissions to authenticated;

create function public.can_manage_site_leads(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_super_admin() or exists (
    select from public.sites s where s.id = p_site and public.is_account_owner(s.account_id)
  );
$$;
revoke all on function public.can_manage_site_leads(uuid) from public, anon;
grant execute on function public.can_manage_site_leads(uuid) to authenticated, service_role;

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  site_id uuid not null,
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (lead_id, site_id) references public.form_submissions(id, site_id) on delete cascade
);
create index lead_notes_lead_idx on public.lead_notes (lead_id, created_at desc, id desc);

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  site_id uuid not null,
  type text not null check (type in ('created', 'status_changed', 'note_added', 'email_sent', 'reply_received')),
  data jsonb not null default '{}',
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (lead_id, site_id) references public.form_submissions(id, site_id) on delete cascade
);
create index lead_events_lead_idx on public.lead_events (lead_id, created_at desc, id desc);
insert into public.lead_events (lead_id, site_id, type, created_at)
  select id, site_id, 'created', created_at from public.form_submissions;

create table public.lead_site_settings (
  site_id uuid primary key references public.sites(id) on delete cascade,
  recipients text[] not null default '{}' check (cardinality(recipients) <= 25),
  webhook_url text,
  webhook_secret text,
  webhook_version uuid not null default gen_random_uuid(),
  check ((webhook_url is null and webhook_secret is null) or
    (webhook_url is not null and length(webhook_url) <= 2048 and webhook_url like 'https://%'
      and webhook_secret is not null and webhook_secret ~ '^[0-9a-f]{64}$'))
);

create table public.lead_notification_preferences (
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  new_lead boolean not null default true,
  replies boolean not null default true,
  digest boolean not null default false,
  last_digest_on date,
  primary key (site_id, user_id)
);

create table public.lead_webhook_deliveries (
  event_id uuid primary key references public.lead_events(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  webhook_version uuid not null,
  event_type text not null,
  status text not null default 'pending' check (status in ('pending', 'retrying', 'delivered', 'failed', 'canceled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  http_status integer,
  created_at timestamptz not null default now()
);
create index lead_webhook_due_idx on public.lead_webhook_deliveries (next_attempt_at)
  where status in ('pending', 'retrying');
create index lead_webhook_log_idx on public.lead_webhook_deliveries (site_id, created_at desc, event_id);

alter table public.lead_notes enable row level security;
alter table public.lead_events enable row level security;
alter table public.lead_site_settings enable row level security;
alter table public.lead_notification_preferences enable row level security;
alter table public.lead_webhook_deliveries enable row level security;
revoke all on public.lead_notes, public.lead_events, public.lead_site_settings,
  public.lead_notification_preferences, public.lead_webhook_deliveries from public, anon, authenticated;
grant all on public.lead_notes, public.lead_events, public.lead_site_settings,
  public.lead_notification_preferences, public.lead_webhook_deliveries to service_role;
grant select on public.lead_notes, public.lead_events, public.lead_site_settings,
  public.lead_notification_preferences, public.lead_webhook_deliveries to authenticated;
grant insert (lead_id, site_id, body), update (body), delete on public.lead_notes to authenticated;
grant insert (site_id, recipients, webhook_url, webhook_secret),
  update (recipients, webhook_url, webhook_secret) on public.lead_site_settings to authenticated;
grant insert (site_id, user_id, new_lead, replies, digest), update (new_lead, replies, digest)
  on public.lead_notification_preferences to authenticated;

create policy lead_notes_read on public.lead_notes for select to authenticated
  using (public.can_manage_site_leads(site_id));
create policy lead_notes_add on public.lead_notes for insert to authenticated
  with check (public.can_manage_site_leads(site_id) and author_id = auth.uid());
create policy lead_notes_edit on public.lead_notes for update to authenticated
  using (public.can_manage_site_leads(site_id) and author_id = auth.uid())
  with check (public.can_manage_site_leads(site_id) and author_id = auth.uid());
create policy lead_notes_remove on public.lead_notes for delete to authenticated
  using (public.can_manage_site_leads(site_id) and author_id = auth.uid());
create policy lead_events_read on public.lead_events for select to authenticated
  using (public.can_manage_site_leads(site_id));
create policy lead_site_settings_owner on public.lead_site_settings for all to authenticated
  using (public.can_manage_site_leads(site_id)) with check (public.can_manage_site_leads(site_id));
create policy lead_preferences_self on public.lead_notification_preferences for all to authenticated
  using (public.can_manage_site_leads(site_id) and user_id = auth.uid())
  with check (public.can_manage_site_leads(site_id) and user_id = auth.uid());
create policy lead_webhook_log_owner on public.lead_webhook_deliveries for select to authenticated
  using (public.can_manage_site_leads(site_id));

create function public.track_lead_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := statement_timestamp();
    new.last_activity_at := greatest(new.last_activity_at, new.status_changed_at);
  end if;
  return new;
end;
$$;
create trigger track_lead_update before update on public.form_submissions
  for each row execute function public.track_lead_update();

create function public.clear_lead_unread_reply() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.has_unread_reply := false;
  return new;
end;
$$;
create trigger clear_lead_unread_reply before update of is_read on public.form_submissions
  for each row when (new.is_read) execute function public.clear_lead_unread_reply();

create function public.record_lead_submission_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_events (lead_id, site_id, type, created_at)
      values (new.id, new.site_id, 'created', new.created_at);
  elsif new.status is distinct from old.status then
    insert into public.lead_events (lead_id, site_id, type, actor_id, data, created_at)
      values (new.id, new.site_id, 'status_changed', auth.uid(),
        jsonb_build_object('from', old.status, 'to', new.status), new.status_changed_at);
  end if;
  return null;
end;
$$;
create trigger record_lead_submission_event after insert or update of status on public.form_submissions
  for each row execute function public.record_lead_submission_event();

create function public.record_lead_note_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.form_submissions set last_activity_at = greatest(last_activity_at, statement_timestamp())
    where id = coalesce(new.lead_id, old.lead_id) and site_id = coalesce(new.site_id, old.site_id);
  if tg_op = 'INSERT' then
    insert into public.lead_events (lead_id, site_id, type, actor_id, created_at)
      values (new.lead_id, new.site_id, 'note_added', new.author_id, new.created_at);
  end if;
  return null;
end;
$$;
create trigger record_lead_note_activity after insert or update of body or delete on public.lead_notes
  for each row execute function public.record_lead_note_activity();

create function public.rotate_lead_webhook_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.webhook_url, new.webhook_secret) is distinct from (old.webhook_url, old.webhook_secret) then
    new.webhook_version := gen_random_uuid();
  end if;
  return new;
end;
$$;
create trigger rotate_lead_webhook_version before update on public.lead_site_settings
  for each row execute function public.rotate_lead_webhook_version();

create function public.queue_lead_webhook() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type in ('created', 'status_changed', 'reply_received') then
    insert into public.lead_webhook_deliveries (event_id, site_id, webhook_version, event_type)
      select new.id, new.site_id, s.webhook_version, 'lead.' || new.type
      from public.lead_site_settings s where s.site_id = new.site_id and s.webhook_url is not null;
  end if;
  return null;
end;
$$;
create trigger queue_lead_webhook after insert on public.lead_events
  for each row execute function public.queue_lead_webhook();

revoke all on function public.track_lead_update(), public.clear_lead_unread_reply(), public.record_lead_submission_event(),
  public.record_lead_note_activity(), public.rotate_lead_webhook_version(), public.queue_lead_webhook()
  from public, anon, authenticated;

create function public.lead_inbox_stats(p_site_id uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'received', count(*) filter (where created_at >= date_trunc('week', now(), 'UTC')),
    'awaiting', count(*) filter (where not archived and status = 'new' and created_at < now() - interval '24 hours'),
    'won_month', count(*) filter (where status = 'won' and status_changed_at >= date_trunc('month', now(), 'UTC')),
    'won', count(*) filter (where status = 'won'),
    'lost', count(*) filter (where status = 'lost')
  ) from public.form_submissions where p_site_id is null or site_id = p_site_id;
$$;
revoke all on function public.lead_inbox_stats(uuid) from public, anon;
grant execute on function public.lead_inbox_stats(uuid) to authenticated;

create function public.claim_lead_webhooks(p_limit integer) returns table (
  event_id uuid, attempts integer, lease_id uuid, url text, secret text, payload jsonb
)
language plpgsql security invoker set search_path = '' as $$
begin
  update public.lead_webhook_deliveries d set status = 'canceled', lease_id = null
    where d.status in ('pending', 'retrying') and d.next_attempt_at <= now() and not exists (
      select from public.lead_site_settings s where s.site_id = d.site_id and s.webhook_version = d.webhook_version
    );
  update public.lead_webhook_deliveries d set status = 'failed', lease_id = null
    where d.status in ('pending', 'retrying') and d.next_attempt_at <= now() and d.attempts >= 5;

  return query
  with due as (
    select d.event_id from public.lead_webhook_deliveries d
    where d.status in ('pending', 'retrying') and d.next_attempt_at <= now()
      and d.attempts < 5
    order by d.next_attempt_at, d.event_id limit least(greatest(coalesce(p_limit, 1), 1), 20)
    for update skip locked
  ), claimed as (
    update public.lead_webhook_deliveries d set attempts = d.attempts + 1,
      next_attempt_at = now() + interval '5 minutes', lease_id = gen_random_uuid()
      from due where d.event_id = due.event_id returning d.*
  )
  select c.event_id, c.attempts, c.lease_id, s.webhook_url, s.webhook_secret, jsonb_build_object(
    'id', e.id, 'type', c.event_type, 'created_at', e.created_at, 'site_id', e.site_id,
    'lead_id', e.lead_id, 'data', e.data,
    'submission', jsonb_build_object('form_name', f.form_name, 'page_path', f.page_path,
      'fields', f.data, 'received_at', f.created_at)
  )
  from claimed c join public.lead_site_settings s on s.site_id = c.site_id and s.webhook_version = c.webhook_version
    join public.lead_events e on e.id = c.event_id
    join public.form_submissions f on f.id = e.lead_id and f.site_id = e.site_id;
end;
$$;

create function public.claim_lead_digests(p_limit integer) returns table (
  site_id uuid, email text, site_name text, received bigint, awaiting bigint
)
language sql security invoker set search_path = '' as $$
  with due as (
    select pref.site_id, pref.user_id
    from public.lead_notification_preferences pref
    join public.sites s on s.id = pref.site_id
    join public.profiles p on p.id = pref.user_id
    where pref.digest and (pref.last_digest_on is null or pref.last_digest_on < (now() at time zone 'UTC')::date)
      and p.email is not null and (p.is_super_admin or exists (
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
revoke all on function public.claim_lead_webhooks(integer), public.claim_lead_digests(integer)
  from public, anon, authenticated;
grant execute on function public.claim_lead_webhooks(integer), public.claim_lead_digests(integer) to service_role;

-- The scheduled worker uses narrowly scoped RPCs instead of the service role.
create table public.lead_worker_config (
  singleton boolean primary key default true check (singleton),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$')
);
alter table public.lead_worker_config enable row level security;
revoke all on public.lead_worker_config from public, anon, authenticated;

create function public.check_lead_worker(p_secret text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_secret is null or octet_length(p_secret) not between 32 and 512 or not exists (
    select from public.lead_worker_config c where c.secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) then raise insufficient_privilege using message = 'Lead worker is not authorized'; end if;
end;
$$;
revoke all on function public.check_lead_worker(text) from public, anon, authenticated;

create function public.lead_worker_claim_webhooks(p_secret text) returns table (
  event_id uuid, attempts integer, lease_id uuid, url text, secret text, payload jsonb
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_lead_worker(p_secret);
  return query select * from public.claim_lead_webhooks(20);
end;
$$;
create function public.lead_worker_claim_digests(p_secret text) returns table (
  site_id uuid, email text, site_name text, received bigint, awaiting bigint
)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_lead_worker(p_secret);
  return query select * from public.claim_lead_digests(20);
end;
$$;
create function public.lead_worker_finish_webhook(
  p_secret text, p_event_id uuid, p_lease_id uuid, p_http_status integer
) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_lead_worker(p_secret);
  update public.lead_webhook_deliveries d set
    status = case when p_http_status between 200 and 299 then 'delivered'
      when d.attempts >= 5 then 'failed' else 'retrying' end,
    http_status = p_http_status,
    next_attempt_at = now() + case d.attempts when 1 then interval '1 minute'
      when 2 then interval '5 minutes' when 3 then interval '15 minutes' else interval '1 hour' end,
    lease_id = null
    where d.event_id = p_event_id and d.lease_id = p_lease_id;
  return found;
end;
$$;
revoke all on function public.lead_worker_claim_webhooks(text), public.lead_worker_claim_digests(text),
  public.lead_worker_finish_webhook(text, uuid, uuid, integer) from public, authenticated;
grant execute on function public.lead_worker_claim_webhooks(text), public.lead_worker_claim_digests(text),
  public.lead_worker_finish_webhook(text, uuid, uuid, integer) to anon;

-- Keep the existing RPC working during rollout, but let the new handler deep-link to the accepted lead.
create function public.submit_contact_form_lead(
  p_site_id uuid, p_ip_hash text, p_path text, p_form_name text, p_data jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  request_time timestamptz := clock_timestamp();
  current_attempts integer;
  lead_id uuid;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid rate limit key'; end if;
  delete from public.form_rate_limits where window_start < request_time - interval '1 day';
  insert into public.form_rate_limits(site_id, ip_hash, window_start, attempts)
    values (p_site_id, p_ip_hash, request_time, 1)
  on conflict (site_id, ip_hash) do update set
    window_start = case when public.form_rate_limits.window_start <= request_time - interval '10 minutes'
      then request_time else public.form_rate_limits.window_start end,
    attempts = case when public.form_rate_limits.window_start <= request_time - interval '10 minutes'
      then 1 else public.form_rate_limits.attempts + 1 end
  returning attempts into current_attempts;
  if current_attempts > 10 then return null; end if;
  insert into public.form_submissions(site_id, page_path, form_name, data)
    values (p_site_id, p_path, p_form_name, p_data) returning id into lead_id;
  return lead_id;
end;
$$;
revoke all on function public.submit_contact_form_lead(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_contact_form_lead(uuid, text, text, text, jsonb) to service_role;

create or replace function public.submit_contact_form(
  p_site_id uuid, p_ip_hash text, p_path text, p_form_name text, p_data jsonb
) returns boolean
language sql security invoker set search_path = '' as $$
  select public.submit_contact_form_lead(p_site_id, p_ip_hash, p_path, p_form_name, p_data) is not null;
$$;

commit;
