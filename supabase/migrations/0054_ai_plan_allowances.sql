begin;

insert into public.site_plans (plan_key, site_limit)
values ('growth', 1), ('premium', 1)
on conflict (plan_key) do nothing;

create table public.ai_plan_allowances (
  plan_key text primary key references public.site_plans(plan_key),
  monthly_site_generations integer not null check (monthly_site_generations >= 0),
  monthly_edits integer not null check (monthly_edits >= 0)
);
alter table public.ai_plan_allowances enable row level security;
create policy "authenticated users read AI plan allowances" on public.ai_plan_allowances
  for select to authenticated using (true);
create policy "super admins manage AI plan allowances" on public.ai_plan_allowances
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
revoke all on public.ai_plan_allowances from public, anon, authenticated;
grant select, insert, update, delete on public.ai_plan_allowances to authenticated;
grant all on public.ai_plan_allowances to service_role;

insert into public.ai_plan_allowances (plan_key, monthly_site_generations, monthly_edits)
values ('starter', 2, 50), ('growth', 5, 150), ('premium', 10, 500);

create table public.ai_account_allowance_overrides (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  monthly_site_generations integer check (monthly_site_generations >= 0),
  monthly_edits integer check (monthly_edits >= 0)
);
alter table public.ai_account_allowance_overrides enable row level security;
create policy "owners read AI allowance overrides" on public.ai_account_allowance_overrides
  for select to authenticated using (public.is_account_owner(account_id) or public.is_super_admin());
create policy "super admins manage AI allowance overrides" on public.ai_account_allowance_overrides
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
revoke all on public.ai_account_allowance_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.ai_account_allowance_overrides to authenticated;
grant all on public.ai_account_allowance_overrides to service_role;

-- Old defaults are not identifiable as intentional overrides. Preserve each
-- non-default field; default-valued fields inherit their plan.
lock table public.ai_limits in share row exclusive mode;
insert into public.ai_account_allowance_overrides (account_id, monthly_site_generations, monthly_edits)
select account_id,
  case when monthly_site_generations <> 1 then monthly_site_generations end,
  case when monthly_edits <> 50 then monthly_edits end
from public.ai_limits
where monthly_site_generations <> 1 or monthly_edits <> 50;

-- Existing main can still update the old columns during a rolling deployment.
create function public.capture_legacy_ai_allowance_override()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_argv[0] = 'generations' then
    insert into public.ai_account_allowance_overrides(account_id, monthly_site_generations)
      values (new.account_id, new.monthly_site_generations)
      on conflict (account_id) do update set monthly_site_generations = excluded.monthly_site_generations;
  else
    insert into public.ai_account_allowance_overrides(account_id, monthly_edits)
      values (new.account_id, new.monthly_edits)
      on conflict (account_id) do update set monthly_edits = excluded.monthly_edits;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_legacy_ai_allowance_override() from public, anon, authenticated;
create trigger capture_legacy_ai_generation_override
  after update of monthly_site_generations on public.ai_limits
  for each row execute function public.capture_legacy_ai_allowance_override('generations');
create trigger capture_legacy_ai_edit_override
  after update of monthly_edits on public.ai_limits
  for each row execute function public.capture_legacy_ai_allowance_override('edits');

create function public.reserve_ai_request_for_plan(
  p_user_id uuid, p_account_id uuid, p_action text, p_model text, p_site_id uuid default null
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  unlimited boolean;
  internal boolean;
  limits public.ai_limits%rowtype;
  allowance public.ai_plan_allowances%rowtype;
  account_override public.ai_account_allowance_overrides%rowtype;
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
    select p.* into allowance from public.accounts a
      join public.ai_plan_allowances p on p.plan_key = a.site_plan_key
      where a.id = p_account_id;
    if not found then raise exception 'AI allowances are not configured for this plan.' using errcode = 'P0001'; end if;
    select * into account_override from public.ai_account_allowance_overrides where account_id = p_account_id;
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
    quota := case when p_action = 'generate_site'
      then coalesce(account_override.monthly_site_generations, allowance.monthly_site_generations)
      else coalesce(account_override.monthly_edits, allowance.monthly_edits) end;
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

create function public.begin_ai_site_generation_for_plan(
  p_user_id uuid, p_account_id uuid, p_model text, p_site_id uuid default null
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare request_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_user_id and is_super_admin) and (
    p_site_id is null or not exists (select 1 from public.account_members
      where user_id = p_user_id and account_id = p_account_id and role = 'owner')
  ) then raise exception 'Only account owners or the agency can generate a site.' using errcode = '42501'; end if;
  request_id := public.reserve_ai_request_for_plan(p_user_id, p_account_id, 'generate_site', p_model, p_site_id);
  update public.ai_requests set is_generation = true where id = request_id;
  return request_id;
end;
$$;

create function public.begin_selected_ai_generation_for_plan(
  p_user_id uuid, p_account_id uuid, p_model text, p_page_count integer, p_site_id uuid default null
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare reservation uuid; surcharge integer;
begin
  if p_page_count is null or p_page_count not between 1 and 10 then
    raise exception 'Select between 1 and 10 pages.' using errcode = '22023';
  end if;
  reservation := public.begin_ai_site_generation_for_plan(p_user_id, p_account_id, p_model, p_site_id);
  surcharge := 2 * greatest(0, p_page_count - 6);
  if surcharge > 0 and not (select is_unlimited from public.ai_requests where id = reservation) then
    update public.ai_limits set extra_credits = extra_credits - surcharge
      where account_id = p_account_id and extra_credits >= surcharge;
    if not found then raise exception 'Not enough credits for the selected pages.' using errcode = 'P0001'; end if;
    update public.ai_requests set page_surcharge = surcharge where id = reservation;
  end if;
  return reservation;
end;
$$;

create function public.ai_account_plan_summaries()
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
    coalesce(o.monthly_site_generations, p.monthly_site_generations),
    coalesce(o.monthly_edits, p.monthly_edits), l.extra_credits
  from public.accounts a
  join public.ai_limits l on l.account_id = a.id
  join public.ai_plan_allowances p on p.plan_key = a.site_plan_key
  left join public.ai_account_allowance_overrides o on o.account_id = a.id
  left join public.ai_requests r on r.account_id = a.id and r.generation_id is null
    and r.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
  where not a.is_internal and (public.is_super_admin() or public.is_account_owner(a.id))
  group by a.id, a.name, p.monthly_site_generations, p.monthly_edits,
    o.monthly_site_generations, o.monthly_edits, l.extra_credits;
$$;

revoke all on function public.reserve_ai_request_for_plan(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.begin_ai_site_generation_for_plan(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.begin_selected_ai_generation_for_plan(uuid, uuid, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_request_for_plan(uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.begin_ai_site_generation_for_plan(uuid, uuid, text, uuid) to service_role;
grant execute on function public.begin_selected_ai_generation_for_plan(uuid, uuid, text, integer, uuid) to service_role;
revoke all on function public.ai_account_plan_summaries() from public, anon;
grant execute on function public.ai_account_plan_summaries() to authenticated;

commit;
