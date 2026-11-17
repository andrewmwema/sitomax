create table public.ai_limits (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  monthly_site_generations int not null default 1 check (monthly_site_generations >= 0),
  monthly_edits int not null default 50 check (monthly_edits >= 0),
  extra_credits int not null default 0 check (extra_credits >= 0)
);
alter table public.ai_limits enable row level security;
create policy "owners read AI limits" on public.ai_limits for select to authenticated
  using (public.is_account_owner(account_id) or public.is_super_admin());
create policy "agency updates AI limits" on public.ai_limits for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "agency creates AI limits" on public.ai_limits for insert to authenticated
  with check (public.is_super_admin());

-- Private reservations serialize quota and credit consumption across app instances.
create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  site_id uuid references public.sites(id) on delete set null,
  action text not null check (action in ('generate_site', 'edit_section', 'rewrite_text')),
  model text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  credits_used int not null default 0 check (credits_used in (0, 1, 10)),
  is_unlimited boolean not null default false,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.ai_requests enable row level security;
-- No client policies. Only server-side service-role functions access reservations.
create index ai_requests_user_date on public.ai_requests(user_id, created_at);
create index ai_requests_account_date on public.ai_requests(account_id, created_at);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.ai_requests(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  site_id uuid references public.sites(id) on delete set null,
  action text not null check (action in ('generate_site', 'edit_section', 'rewrite_text')),
  model text not null,
  input_tokens bigint not null check (input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  cache_write_5m_tokens bigint not null default 0 check (cache_write_5m_tokens >= 0),
  cache_write_1h_tokens bigint not null default 0 check (cache_write_1h_tokens >= 0),
  cost_usd numeric(24,12) not null check (cost_usd >= 0),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.ai_usage enable row level security;
create policy "owners read AI usage" on public.ai_usage for select to authenticated
  using (public.is_account_owner(account_id) or public.is_super_admin());
create index ai_usage_account_date on public.ai_usage(account_id, created_at);

insert into public.ai_limits(account_id) select id from public.accounts;
create function public.initialize_ai_limits() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.ai_limits(account_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.initialize_ai_limits() from public;
create trigger initialize_ai_limits after insert on public.accounts
  for each row execute function public.initialize_ai_limits();

create function public.reserve_ai_request(p_user_id uuid, p_account_id uuid, p_action text, p_model text, p_site_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  unlimited boolean;
  limits public.ai_limits%rowtype;
  used bigint;
  quota int;
  credits int := 0;
  request_id uuid;
  request_time timestamptz;
  month_start timestamptz;
begin
  select is_super_admin into unlimited from public.profiles where id = p_user_id;
  if unlimited is null or (not unlimited and not exists (
    select 1 from public.account_members where user_id = p_user_id and account_id = p_account_id
  )) then
    raise exception 'You do not have access to this AI account.' using errcode = '42501';
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites where id = p_site_id and account_id = p_account_id
  ) then
    raise exception 'The site does not belong to this account.' using errcode = '42501';
  end if;
  if p_action not in ('generate_site', 'edit_section', 'rewrite_text') or p_action is null
    or p_model is null or length(p_model) not between 1 and 100 then
    raise exception 'Invalid AI request.' using errcode = '22023';
  end if;
  -- User lock is global across accounts; account lock is shared across users.
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  select * into strict limits from public.ai_limits where account_id = p_account_id for update;
  request_time := clock_timestamp();
  month_start := date_trunc('month', request_time at time zone 'UTC') at time zone 'UTC';
  if (select count(*) from public.ai_requests
      where user_id = p_user_id and created_at > request_time - interval '1 minute') >= 10 then
    raise exception 'AI rate limit reached. Try again in a minute.' using errcode = 'P0001';
  end if;
  if not unlimited then
    select count(*) into used from public.ai_requests
      where account_id = p_account_id and created_at >= month_start
      and status in ('pending', 'completed') and credits_used = 0 and not is_unlimited
      and (case when p_action = 'generate_site' then action = 'generate_site' else action <> 'generate_site' end);
    quota := case when p_action = 'generate_site' then limits.monthly_site_generations else limits.monthly_edits end;
    if used >= quota then
      credits := case when p_action = 'generate_site' then 10 else 1 end;
      if limits.extra_credits < credits then
        raise exception 'Monthly AI limit reached. Ask your agency for more credits.' using errcode = 'P0001';
      end if;
      update public.ai_limits set extra_credits = extra_credits - credits where account_id = p_account_id;
    end if;
  end if;
  insert into public.ai_requests(account_id, user_id, site_id, action, model, credits_used, is_unlimited, created_at)
    values (p_account_id, p_user_id, p_site_id, p_action, p_model, credits, unlimited, request_time)
    returning id into request_id;
  return request_id;
end;
$$;

create function public.finish_ai_request(
  p_request_id uuid, p_failed boolean, p_input_tokens bigint default 0, p_output_tokens bigint default 0,
  p_cache_read_tokens bigint default 0, p_cache_write_5m_tokens bigint default 0,
  p_cache_write_1h_tokens bigint default 0, p_cost_usd numeric default 0
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  request public.ai_requests%rowtype;
begin
  select * into strict request from public.ai_requests where id = p_request_id for update;
  if request.status = 'completed' and not p_failed then return; end if;
  if request.status = 'failed' and p_failed then return; end if;
  if request.status <> 'pending' or p_failed is null then raise exception 'AI request is already finalized.'; end if;
  if p_failed then
    update public.ai_limits set extra_credits = extra_credits + request.credits_used where account_id = request.account_id;
    update public.ai_requests set status = 'failed' where id = request.id;
  else
    insert into public.ai_usage(request_id, account_id, user_id, site_id, action, model,
      input_tokens, output_tokens, cache_read_tokens, cache_write_5m_tokens, cache_write_1h_tokens, cost_usd, created_at)
    values (request.id, request.account_id, request.user_id, request.site_id, request.action, request.model,
      p_input_tokens, p_output_tokens, p_cache_read_tokens, p_cache_write_5m_tokens, p_cache_write_1h_tokens, p_cost_usd, request.created_at);
    update public.ai_requests set status = 'completed' where id = request.id;
  end if;
end;
$$;

revoke all on function public.reserve_ai_request(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_ai_request(uuid, boolean, bigint, bigint, bigint, bigint, bigint, numeric) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.finish_ai_request(uuid, boolean, bigint, bigint, bigint, bigint, bigint, numeric) to service_role;
revoke all on public.ai_requests from anon, authenticated;
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
revoke all on public.ai_limits from anon, authenticated;
grant select, insert, update on public.ai_limits to authenticated;
grant all on public.ai_limits, public.ai_requests, public.ai_usage to service_role;

create function public.ai_account_summaries()
returns table (account_id uuid, account_name text, site_generations bigint, edits bigint,
  included_generations bigint, included_edits bigint, pending_requests bigint,
  monthly_site_generations int, monthly_edits int, extra_credits int)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, a.name,
    count(r.id) filter (where r.status = 'completed' and r.action = 'generate_site'),
    count(r.id) filter (where r.status = 'completed' and r.action <> 'generate_site'),
    count(r.id) filter (where r.status <> 'failed' and r.credits_used = 0 and not r.is_unlimited and r.action = 'generate_site'),
    count(r.id) filter (where r.status <> 'failed' and r.credits_used = 0 and not r.is_unlimited and r.action <> 'generate_site'),
    count(r.id) filter (where r.status = 'pending'),
    l.monthly_site_generations, l.monthly_edits, l.extra_credits
  from public.accounts a join public.ai_limits l on l.account_id = a.id
  left join public.ai_requests r on r.account_id = a.id
    and r.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
  where public.is_super_admin() or public.is_account_owner(a.id)
  group by a.id, a.name, l.monthly_site_generations, l.monthly_edits, l.extra_credits;
$$;
revoke all on function public.ai_account_summaries() from public, anon;
grant execute on function public.ai_account_summaries() to authenticated;

create function public.ai_monthly_costs(p_month date)
returns table (account_id uuid, account_name text, requests bigint, cost_usd numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_super_admin() then raise exception 'Agency access required.' using errcode = '42501'; end if;
  if p_month is null or extract(day from p_month) <> 1 then raise exception 'Choose a calendar month.'; end if;
  return query select a.id, a.name, count(u.id), coalesce(sum(u.cost_usd), 0)
    from public.accounts a left join public.ai_usage u on u.account_id = a.id
      and u.created_at >= p_month::timestamp at time zone 'UTC'
      and u.created_at < (p_month + interval '1 month')::timestamp at time zone 'UTC'
    group by a.id, a.name order by a.name;
end;
$$;
revoke all on function public.ai_monthly_costs(date) from public, anon;
grant execute on function public.ai_monthly_costs(date) to authenticated;
