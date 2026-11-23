begin;

-- Per-account limits on AI agent requests. One request is a message, an
-- answer, a plan approval or a Continue: each one starts model work. Agency
-- staff are exempt. The agency can change the numbers per client account.
alter table public.ai_limits
  add column agent_requests_per_hour int not null default 30 check (agent_requests_per_hour >= 0),
  add column agent_requests_per_day int not null default 150 check (agent_requests_per_day >= 0);

-- Ledger of counted requests. It is written only by the service-role function
-- below, after the app has checked that the user may use the account.
create table public.ai_agent_request_log (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);
create index ai_agent_request_log_account_created
  on public.ai_agent_request_log(account_id, created_at);
alter table public.ai_agent_request_log enable row level security;
create policy "agency reads the AI agent request log" on public.ai_agent_request_log
  for select to authenticated using (public.is_super_admin());
revoke all on public.ai_agent_request_log from anon, authenticated;
grant select on public.ai_agent_request_log to authenticated;
grant all on public.ai_agent_request_log to service_role;

create function public.reserve_ai_agent_slot(p_user_id uuid, p_account_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  unlimited boolean;
  internal boolean;
  limits public.ai_limits%rowtype;
  request_time timestamptz;
  used_hour int;
  used_day int;
  oldest_hour timestamptz;
  oldest_day timestamptz;
  wait_for int;
begin
  select is_super_admin into unlimited from public.profiles where id = p_user_id;
  select is_internal into internal from public.accounts where id = p_account_id;
  if unlimited is null or internal is null or (not unlimited and (internal or not exists (
    select 1 from public.account_members where user_id = p_user_id and account_id = p_account_id
  ))) then raise exception 'You do not have access to this AI account.' using errcode = '42501'; end if;
  if unlimited then return; end if;

  -- One request at a time per account, so two tabs cannot both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended('ai-agent-account:' || p_account_id::text, 0));
  select * into strict limits from public.ai_limits where account_id = p_account_id;
  request_time := clock_timestamp();
  delete from public.ai_agent_request_log
    where account_id = p_account_id and created_at <= request_time - interval '1 day';
  select count(*) filter (where created_at > request_time - interval '1 hour'), count(*),
      min(created_at) filter (where created_at > request_time - interval '1 hour'), min(created_at)
    into used_hour, used_day, oldest_hour, oldest_day
    from public.ai_agent_request_log where account_id = p_account_id;

  if limits.agent_requests_per_hour = 0 or limits.agent_requests_per_day = 0 then
    raise exception 'The AI agent is turned off for this account. Ask your agency to enable it.' using errcode = 'P0001';
  end if;
  if used_day >= limits.agent_requests_per_day then
    wait_for := greatest(1, ceil(extract(epoch from oldest_day + interval '1 day' - request_time) / 3600))::int;
    raise exception 'Your account has reached its daily AI agent limit. Try again in about % hour%.',
      wait_for, case when wait_for = 1 then '' else 's' end using errcode = 'P0001';
  end if;
  if used_hour >= limits.agent_requests_per_hour then
    wait_for := greatest(1, ceil(extract(epoch from oldest_hour + interval '1 hour' - request_time) / 60))::int;
    raise exception 'Your account has reached its hourly AI agent limit. Try again in about % minute%.',
      wait_for, case when wait_for = 1 then '' else 's' end using errcode = 'P0001';
  end if;
  insert into public.ai_agent_request_log(account_id, user_id, created_at) values (p_account_id, p_user_id, request_time);
end;
$$;
revoke all on function public.reserve_ai_agent_slot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_agent_slot(uuid, uuid) to service_role;

-- Clients see what a run cost them in credits. Token counts, the provider cost
-- and the saved model conversation are read by the server only, which shows
-- them to the agency.
revoke select on public.ai_agent_runs from authenticated;
grant select (id, thread_id, status, request_id, changeset, started_at, finished_at)
  on public.ai_agent_runs to authenticated;

commit;
