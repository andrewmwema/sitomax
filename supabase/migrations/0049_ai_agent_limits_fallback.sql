begin;

alter table public.ai_limits
  add column if not exists agent_requests_per_hour int not null default 30 check (agent_requests_per_hour >= 0),
  add column if not exists agent_requests_per_day int not null default 150 check (agent_requests_per_day >= 0);

create or replace function public.reserve_ai_agent_slot(p_user_id uuid, p_account_id uuid)
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

  perform pg_advisory_xact_lock(hashtextextended('ai-agent-account:' || p_account_id::text, 0));
  select * into limits from public.ai_limits where account_id = p_account_id;
  if not found then
    raise warning 'AI limits missing for account %; using default agent request limits.', p_account_id;
    limits.agent_requests_per_hour := 30;
    limits.agent_requests_per_day := 150;
  end if;
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

drop policy if exists "owners read AI usage" on public.ai_usage;
drop policy if exists "agency reads AI usage" on public.ai_usage;
create policy "agency reads AI usage" on public.ai_usage for select to authenticated
  using (public.is_super_admin());

commit;