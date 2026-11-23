begin;

alter table public.ai_requests drop constraint ai_requests_credits_used_check;
alter table public.ai_requests add constraint ai_requests_credits_used_check
  check (credits_used in (0, 1, 3, 10));

create table public.ai_agent_threads (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New chat' check (length(title) between 1 and 120),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index ai_agent_threads_site_user_updated
  on public.ai_agent_threads(site_id, user_id, updated_at desc);
alter table public.ai_agent_threads enable row level security;
create policy "site members read their AI agent threads" on public.ai_agent_threads
  for select to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.sites s where s.id = site_id
      and (public.is_super_admin() or public.is_account_member(s.account_id))
  ));

create table public.ai_agent_runs (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_agent_threads(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'awaiting_approval', 'awaiting_input', 'paused', 'completed', 'failed', 'stopped')),
  request_id uuid references public.ai_requests(id) on delete set null,
  usage jsonb not null default '{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWrite5mTokens":0,"cacheWrite1hTokens":0}'::jsonb
    check (jsonb_typeof(usage) = 'object'),
  cost_usd numeric(24,12) not null default 0 check (cost_usd >= 0),
  changeset jsonb not null default '{}'::jsonb check (jsonb_typeof(changeset) = 'object'),
  run_state jsonb not null default '{}'::jsonb check (jsonb_typeof(run_state) = 'object'),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz
);
create index ai_agent_runs_thread_started on public.ai_agent_runs(thread_id, started_at desc);
alter table public.ai_agent_runs enable row level security;
create policy "site members read their AI agent runs" on public.ai_agent_runs
  for select to authenticated
  using (exists (
    select 1 from public.ai_agent_threads t join public.sites s on s.id = t.site_id
    where t.id = thread_id and t.user_id = auth.uid()
      and (public.is_super_admin() or public.is_account_member(s.account_id))
  ));

create table public.ai_agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_agent_threads(id) on delete cascade,
  run_id uuid references public.ai_agent_runs(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null check (length(content) <= 20000),
  tool_calls jsonb not null default '[]'::jsonb check (jsonb_typeof(tool_calls) = 'array'),
  created_at timestamptz not null default clock_timestamp()
);
create index ai_agent_messages_thread_created on public.ai_agent_messages(thread_id, created_at);
alter table public.ai_agent_messages enable row level security;
create policy "site members read their AI agent messages" on public.ai_agent_messages
  for select to authenticated
  using (exists (
    select 1 from public.ai_agent_threads t join public.sites s on s.id = t.site_id
    where t.id = thread_id and t.user_id = auth.uid()
      and (public.is_super_admin() or public.is_account_member(s.account_id))
  ));

create function public.touch_ai_agent_thread_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_ai_agent_thread_updated_at() from public, anon, authenticated;
create trigger touch_ai_agent_thread_before_update
  before update on public.ai_agent_threads
  for each row execute function public.touch_ai_agent_thread_updated_at();

create function public.touch_ai_agent_thread()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  update public.ai_agent_threads set updated_at = clock_timestamp()
    where id = new.thread_id;
  return new;
end;
$$;
revoke all on function public.touch_ai_agent_thread() from public, anon, authenticated;
create trigger touch_ai_agent_thread_after_message
  after insert on public.ai_agent_messages
  for each row execute function public.touch_ai_agent_thread();
create trigger touch_ai_agent_thread_after_run
  after update on public.ai_agent_runs
  for each row execute function public.touch_ai_agent_thread();

create function public.upgrade_ai_agent_request(p_request_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare request public.ai_requests%rowtype; required_credits int;
begin
  select * into strict request from public.ai_requests where id = p_request_id for update;
  if request.status <> 'pending' or request.action <> 'edit_section' or request.is_generation then
    raise exception 'AI agent reservation is unavailable.' using errcode = 'P0001';
  end if;
  if request.is_unlimited or request.credits_used = 3 then return; end if;
  if request.credits_used not in (0, 1) then
    raise exception 'AI agent reservation has an invalid credit state.' using errcode = '22023';
  end if;
  required_credits := 3 - request.credits_used;
  update public.ai_limits set extra_credits = extra_credits - required_credits
    where account_id = request.account_id and extra_credits >= required_credits;
  if not found then
    raise exception 'A large AI run requires 3 credits. Ask your agency for more credits.' using errcode = 'P0001';
  end if;
  update public.ai_requests set credits_used = 3 where id = request.id;
end;
$$;
revoke all on function public.upgrade_ai_agent_request(uuid) from public, anon, authenticated;
grant execute on function public.upgrade_ai_agent_request(uuid) to service_role;

revoke all on public.ai_agent_threads, public.ai_agent_runs, public.ai_agent_messages from anon, authenticated;
grant select on public.ai_agent_threads, public.ai_agent_runs, public.ai_agent_messages to authenticated;
grant all on public.ai_agent_threads, public.ai_agent_runs, public.ai_agent_messages to service_role;

commit;
