alter table public.accounts
  add column is_internal boolean not null default false;

create unique index accounts_single_internal on public.accounts ((true)) where is_internal;

-- Only the service-role helper can create or change the internal marker.
revoke insert, update on public.accounts from authenticated, anon;
grant insert (id, name, created_at), update (name) on public.accounts to authenticated;

create function public.get_or_create_internal_account(p_user_id uuid, p_name text)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare internal_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_user_id and is_super_admin) then
    raise exception 'Agency access required.' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 100 then
    raise exception 'Invalid agency name.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('internal-account', 0));
  select id into internal_id from public.accounts where is_internal;
  if internal_id is null then
    insert into public.accounts(name, is_internal) values (trim(p_name), true)
      returning id into internal_id;
  end if;
  insert into public.account_members(account_id, user_id, role)
    values (internal_id, p_user_id, 'owner')
    on conflict (account_id, user_id) do update set role = 'owner';
  return internal_id;
end;
$$;
revoke all on function public.get_or_create_internal_account(uuid, text) from public, anon, authenticated;
grant execute on function public.get_or_create_internal_account(uuid, text) to service_role;

-- Even direct membership writes cannot invite a client into the agency account.
create policy "internal members must be super admins" on public.account_members
  as restrictive for all to authenticated
  using (not exists (select 1 from public.accounts a where a.id = account_id and a.is_internal)
    or public.is_super_admin())
  with check (not exists (select 1 from public.accounts a where a.id = account_id and a.is_internal)
    or (public.is_super_admin() and exists (
      select 1 from public.profiles p where p.id = user_id and p.is_super_admin)));

create or replace function public.initialize_ai_limits() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not new.is_internal then
    insert into public.ai_limits(account_id) values (new.id);
  end if;
  return new;
end;
$$;

create policy "client accounts only" on public.ai_limits
  as restrictive for all to authenticated
  using (exists (select 1 from public.accounts a where a.id = account_id and not a.is_internal))
  with check (exists (select 1 from public.accounts a where a.id = account_id and not a.is_internal));

-- Unlimited agency requests do not need a client quota row. Keep rate limits
-- and the usage ledger unchanged.
create or replace function public.reserve_ai_request(p_user_id uuid, p_account_id uuid, p_action text, p_model text, p_site_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  unlimited boolean;
  internal boolean;
  limits public.ai_limits%rowtype;
  used bigint;
  quota int;
  credits int := 0;
  request_id uuid;
  request_time timestamptz;
  month_start timestamptz;
begin
  select is_super_admin into unlimited from public.profiles where id = p_user_id;
  select is_internal into internal from public.accounts where id = p_account_id;
  if unlimited is null or internal is null or (not unlimited and (internal or not exists (
    select 1 from public.account_members where user_id = p_user_id and account_id = p_account_id
  ))) then raise exception 'You do not have access to this AI account.' using errcode = '42501'; end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites where id = p_site_id and account_id = p_account_id
  ) then raise exception 'The site does not belong to this account.' using errcode = '42501'; end if;
  if p_action not in ('generate_site', 'edit_section', 'rewrite_text') or p_action is null
    or p_model is null or length(p_model) not between 1 and 100 then
    raise exception 'Invalid AI request.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  if not unlimited then
    select * into strict limits from public.ai_limits where account_id = p_account_id for update;
  end if;
  request_time := clock_timestamp();
  month_start := date_trunc('month', request_time at time zone 'UTC') at time zone 'UTC';
  if (select count(*) from public.ai_requests where user_id = p_user_id and not is_generation
      and created_at > request_time - interval '1 minute') >= 10 then
    raise exception 'AI rate limit reached. Try again in a minute.' using errcode = 'P0001';
  end if;
  if not unlimited then
    select count(*) into used from public.ai_requests
      where account_id = p_account_id and created_at >= month_start and generation_id is null
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

create or replace function public.ai_account_summaries()
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
  left join public.ai_requests r on r.account_id = a.id and r.generation_id is null
    and r.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
  where not a.is_internal and (public.is_super_admin() or public.is_account_owner(a.id))
  group by a.id, a.name, l.monthly_site_generations, l.monthly_edits, l.extra_credits;
$$;

create or replace function public.ai_monthly_costs(p_month date)
returns table (account_id uuid, account_name text, requests bigint, cost_usd numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_super_admin() then raise exception 'Agency access required.' using errcode = '42501'; end if;
  if p_month is null or extract(day from p_month) <> 1 then raise exception 'Choose a calendar month.'; end if;
  return query select a.id, a.name, count(u.id), coalesce(sum(u.cost_usd), 0)
    from public.accounts a left join public.ai_usage u on u.account_id = a.id
      and u.created_at >= p_month::timestamp at time zone 'UTC'
      and u.created_at < (p_month + interval '1 month')::timestamp at time zone 'UTC'
    where not a.is_internal
    group by a.id, a.name order by a.name;
end;
$$;
