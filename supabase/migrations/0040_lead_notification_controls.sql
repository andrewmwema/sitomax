begin;

do $$
begin
  if to_regclass('public.email_suppressions') is null then
    raise exception 'Apply migration 0036_postmark_email_events.sql before migration 0040';
  end if;
end;
$$;

alter table public.lead_site_settings
  add column new_lead_enabled boolean not null default true,
  add column reply_notifications_enabled boolean not null default true,
  add column digest_enabled boolean not null default true;
grant update (new_lead_enabled, reply_notifications_enabled, digest_enabled) on public.lead_site_settings to authenticated;

create table public.lead_notification_failures (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null,
  site_id uuid not null,
  kind text not null check (kind in ('new_lead', 'reply')),
  created_at timestamptz not null default now(),
  foreign key (lead_id, site_id) references public.form_submissions(id, site_id) on delete cascade
);
create index lead_notification_failures_lead_idx on public.lead_notification_failures (lead_id);
alter table public.lead_notification_failures enable row level security;
revoke all on public.lead_notification_failures from public, anon, authenticated;
grant select on public.lead_notification_failures to authenticated;
grant all on public.lead_notification_failures to service_role;
create policy lead_notification_failures_admin on public.lead_notification_failures
  for select to authenticated using (public.is_super_admin());

-- This list matches the immediate new-lead sender, including owner opt-outs and suppressions.
create function public.lead_new_notification_recipients(p_site uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare result text[];
begin
  if auth.role() is distinct from 'service_role' and not public.can_manage_site_leads(p_site) then
    raise insufficient_privilege using message = 'Not authorized to manage site leads';
  end if;
  with site as (
    select s.account_id, cfg.recipients from public.sites s
      left join public.lead_site_settings cfg on cfg.site_id = s.id where s.id = p_site
  ), owners as (
    select p.id, lower(p.email) as email from site
      join public.account_members m on m.account_id = site.account_id and m.role = 'owner'
      join public.profiles p on p.id = m.user_id
  ), candidates as (
    select distinct lower(btrim(address)) as email from site cross join lateral unnest(
      case when cardinality(site.recipients) > 0 then site.recipients
        else array(select owners.email from owners) end
    ) t(address)
  )
  select array(select c.email from candidates c
    where c.email ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'
    and not exists (select from public.email_suppressions x where x.email = c.email)
    and not exists (
      select from public.lead_notification_preferences pref join public.profiles p on p.id = pref.user_id
      where pref.site_id = p_site and not pref.new_lead and lower(p.email) = c.email
        and (p.is_super_admin or exists (select from owners o where o.id = pref.user_id))
    ) order by c.email limit 50) into result;
  return result;
end;
$$;
revoke all on function public.lead_new_notification_recipients(uuid) from public, anon;
grant execute on function public.lead_new_notification_recipients(uuid) to authenticated, service_role;

create table public.lead_notification_test_limits (
  site_id uuid primary key references public.sites(id) on delete cascade,
  last_sent_at timestamptz not null
);
alter table public.lead_notification_test_limits enable row level security;
revoke all on public.lead_notification_test_limits from public, anon, authenticated;

create function public.reserve_lead_notification_test(p_site uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_site_leads(p_site) then
    raise insufficient_privilege using message = 'Not authorized to manage site leads';
  end if;
  insert into public.lead_notification_test_limits(site_id, last_sent_at) values (p_site, now())
    on conflict (site_id) do update set last_sent_at = excluded.last_sent_at
      where public.lead_notification_test_limits.last_sent_at < now() - interval '1 minute';
  return found;
end;
$$;
revoke all on function public.reserve_lead_notification_test(uuid) from public, anon;
grant execute on function public.reserve_lead_notification_test(uuid) to authenticated;

create or replace function public.lead_mail_recipients(p_site uuid, p_reply_prefs boolean, p_owners_only boolean) returns text[]
language sql stable set search_path = '' as $$
  with site as (
    select s.account_id, cfg.recipients, coalesce(cfg.reply_notifications_enabled, true) as replies_enabled from public.sites s
      left join public.lead_site_settings cfg on cfg.site_id = s.id where s.id = p_site
  ), owners as (
    select lower(p.email) as email from site
      join public.account_members m on m.account_id = site.account_id and m.role = 'owner'
      join public.profiles p on p.id = m.user_id
  ), candidates as (
    select distinct lower(address) as email from site cross join lateral unnest(
      case when not p_owners_only and cardinality(site.recipients) > 0 then site.recipients
        else array(select owners.email from owners) end
    ) t(address) where not p_reply_prefs or site.replies_enabled
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

create function public.record_missing_reply_recipients() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.direction = 'in' and not new.auto_reply
    and coalesce((select s.reply_notifications_enabled from public.lead_site_settings s where s.site_id = new.site_id), true)
    and cardinality(public.lead_mail_recipients(new.site_id, true, false)) = 0 then
    insert into public.lead_notification_failures(lead_id, site_id, kind) values (new.lead_id, new.site_id, 'reply');
    raise log 'Lead reply notification could not be sent: no eligible recipients (lead %, site %)', new.lead_id, new.site_id;
  end if;
  return new;
end;
$$;
revoke all on function public.record_missing_reply_recipients() from public, anon, authenticated;
create trigger lead_reply_missing_recipients after insert on public.lead_messages
  for each row execute function public.record_missing_reply_recipients();

create function public.lead_reply_notification_status(p_secret text, p_message uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  perform public.check_lead_worker(p_secret);
  select site_id into m from public.lead_messages where id = p_message and direction = 'in' and not auto_reply;
  if not found then return 'unavailable'; end if;
  if not coalesce((select s.reply_notifications_enabled from public.lead_site_settings s where s.site_id = m.site_id), true)
    then return 'disabled'; end if;
  if cardinality(public.lead_mail_recipients(m.site_id, true, false)) = 0 then return 'no_recipients'; end if;
  return 'ready';
end;
$$;
revoke all on function public.lead_reply_notification_status(text, uuid) from public, authenticated;
grant execute on function public.lead_reply_notification_status(text, uuid) to anon;

create function public.record_lead_reply_notification_failure(p_secret text, p_message uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_lead_worker(p_secret);
  insert into public.lead_notification_failures(lead_id, site_id, kind)
    select m.lead_id, m.site_id, 'reply' from public.lead_messages m
    where m.id = p_message and m.direction = 'in' and not m.auto_reply
      and coalesce((select s.reply_notifications_enabled from public.lead_site_settings s where s.site_id = m.site_id), true)
      and cardinality(public.lead_mail_recipients(m.site_id, true, false)) > 0;
  return exists (select from public.lead_messages m where m.id = p_message and m.direction = 'in');
end;
$$;
revoke all on function public.record_lead_reply_notification_failure(text, uuid) from public, authenticated;
grant execute on function public.record_lead_reply_notification_failure(text, uuid) to anon;

create or replace function public.claim_lead_digests(p_limit integer) returns table (
  site_id uuid, email text, site_name text, received bigint, awaiting bigint
)
language sql security invoker set search_path = '' as $$
  with due as (
    select pref.site_id, pref.user_id
    from public.lead_notification_preferences pref
    join public.sites s on s.id = pref.site_id
    join public.profiles p on p.id = pref.user_id
    left join public.lead_site_settings cfg on cfg.site_id = s.id
    where pref.digest and coalesce(cfg.digest_enabled, true)
      and (pref.last_digest_on is null or pref.last_digest_on < (now() at time zone 'UTC')::date)
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

commit;
