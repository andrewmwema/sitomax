alter table public.sites
  add column domain_provider text,
  add column domain_pending_since timestamptz,
  add column domain_last_checked_at timestamptz,
  add column domain_check_stopped_at timestamptz,
  add column domain_notification_sent_at timestamptz,
  add column domain_notification_claimed_at timestamptz;

update public.sites set domain_pending_since = now() where custom_domain is not null;
-- Existing live domains should not receive a retroactive "just connected" email.
update public.sites set domain_notification_sent_at = now() where domain_verified;

create function public.reset_domain_connection()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.custom_domain is distinct from old.custom_domain or (old.domain_verified and not new.domain_verified) then
    new.domain_pending_since := case when new.custom_domain is null then null else now() end;
    if new.custom_domain is distinct from old.custom_domain then
      new.domain_provider := null;
    end if;
    new.domain_last_checked_at := null;
    new.domain_check_stopped_at := null;
    new.domain_notification_sent_at := null;
    new.domain_notification_claimed_at := null;
  end if;
  return new;
end;
$$;
create trigger reset_domain_connection before update of custom_domain, domain_verified on public.sites
  for each row execute function public.reset_domain_connection();

create index sites_pending_domains_idx on public.sites(domain_last_checked_at)
  where custom_domain is not null and not domain_verified and domain_check_stopped_at is null;

create table public.domain_action_limits (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('dns', 'email')),
  cost integer not null check (cost between 1 and 20),
  created_at timestamptz not null default clock_timestamp()
);
create index domain_action_limits_user_time_idx on public.domain_action_limits(user_id, created_at);
create index domain_action_limits_cleanup_idx on public.domain_action_limits(created_at);
alter table public.domain_action_limits enable row level security;
revoke all on public.domain_action_limits from public, anon, authenticated;
grant all on public.domain_action_limits to service_role;
create policy "service manages domain limits" on public.domain_action_limits
  for all to service_role using (true) with check (true);

create function public.consume_domain_action(p_kind text, p_cost integer default 1)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  used integer;
  allowance integer;
begin
  if actor is null or p_kind is null or p_kind not in ('dns', 'email') or p_cost is null or p_cost < 1 or p_cost > 20 then
    raise exception 'Invalid domain action';
  end if;
  allowance := case when p_kind = 'dns' then 20 else 3 end;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':domain:' || p_kind, 0));
  delete from public.domain_action_limits where created_at < clock_timestamp() - interval '1 day';
  select coalesce(sum(cost), 0) into used from public.domain_action_limits
    where user_id = actor and kind = p_kind and created_at > clock_timestamp() - interval '1 minute';
  if used + p_cost > allowance then return false; end if;
  insert into public.domain_action_limits(user_id, kind, cost) values (actor, p_kind, p_cost);
  return true;
end;
$$;
revoke all on function public.consume_domain_action(text, integer) from public, anon;
grant execute on function public.consume_domain_action(text, integer) to authenticated;
