begin;

alter table public.ai_usage
  alter column request_id drop not null,
  alter column account_id drop not null,
  add column source text not null default 'app' check (source in ('app', 'eval')),
  add column action_type text not null default 'edit' check (action_type in ('site_generation', 'agent_run', 'edit', 'lead_draft', 'blog_ai', 'eval')),
  add constraint ai_usage_source_identity check (
    (source = 'app' and request_id is not null and account_id is not null and action_type <> 'eval')
    or (source = 'eval' and request_id is null and account_id is null and site_id is null and action_type = 'eval')
  );

update public.ai_usage set action_type = case when action = 'generate_site' then 'site_generation' else 'edit' end;
update public.ai_usage u set action_type = 'agent_run'
  where exists (select 1 from public.ai_agent_runs r where r.request_id = u.request_id);
create index ai_usage_created_at on public.ai_usage(created_at);

-- Keep finalization and labeling atomic; only authenticated server accounting uses this function.
create function public.finish_ai_request_labeled(
  p_request_id uuid, p_input_tokens bigint, p_output_tokens bigint, p_cache_read_tokens bigint,
  p_cache_write_5m_tokens bigint, p_cache_write_1h_tokens bigint, p_cost_usd numeric, p_action_type text
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_action_type not in ('site_generation', 'agent_run', 'edit', 'lead_draft', 'blog_ai') or p_action_type is null then
    raise exception 'Invalid AI usage category.' using errcode = '22023';
  end if;
  perform public.finish_ai_request(p_request_id, false, p_input_tokens, p_output_tokens,
    p_cache_read_tokens, p_cache_write_5m_tokens, p_cache_write_1h_tokens, p_cost_usd);
  update public.ai_usage set action_type = p_action_type where request_id = p_request_id and source = 'app';
  if not found then raise exception 'AI usage was not recorded.'; end if;
end;
$$;
revoke all on function public.finish_ai_request_labeled(uuid, bigint, bigint, bigint, bigint, bigint, numeric, text) from public, anon, authenticated;
grant execute on function public.finish_ai_request_labeled(uuid, bigint, bigint, bigint, bigint, bigint, numeric, text) to service_role;

-- Eval records have no client, reservation or quota impact. Only an authenticated agency user may write them.
create function public.record_ai_eval_usage(
  p_id uuid, p_model text, p_input_tokens bigint, p_output_tokens bigint, p_cache_read_tokens bigint,
  p_cache_write_5m_tokens bigint, p_cache_write_1h_tokens bigint, p_cost_usd numeric
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_super_admin() then raise exception 'Agency access required.' using errcode = '42501'; end if;
  if p_id is null or p_model is null or length(p_model) not between 1 and 100
    or p_input_tokens is null or p_output_tokens is null or p_cache_read_tokens is null
    or p_cache_write_5m_tokens is null or p_cache_write_1h_tokens is null or p_cost_usd is null then
    raise exception 'Invalid eval usage.' using errcode = '22023';
  end if;
  insert into public.ai_usage(id, user_id, action, model, input_tokens, output_tokens, cache_read_tokens,
    cache_write_5m_tokens, cache_write_1h_tokens, cost_usd, source, action_type)
  values (p_id, auth.uid(), 'edit_section', p_model, p_input_tokens, p_output_tokens, p_cache_read_tokens,
    p_cache_write_5m_tokens, p_cache_write_1h_tokens, p_cost_usd, 'eval', 'eval')
  on conflict (id) do nothing;
  if not exists (select 1 from public.ai_usage where id = p_id and user_id = auth.uid() and source = 'eval'
    and model = p_model and input_tokens = p_input_tokens and output_tokens = p_output_tokens
    and cache_read_tokens = p_cache_read_tokens and cache_write_5m_tokens = p_cache_write_5m_tokens
    and cache_write_1h_tokens = p_cache_write_1h_tokens and cost_usd = p_cost_usd) then
    raise exception 'Eval usage id conflicts with an existing record.' using errcode = '23505';
  end if;
end;
$$;
revoke all on function public.record_ai_eval_usage(uuid, text, bigint, bigint, bigint, bigint, bigint, numeric) from public, anon;
grant execute on function public.record_ai_eval_usage(uuid, text, bigint, bigint, bigint, bigint, bigint, numeric) to authenticated;

create function public.ai_cost_report(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if not public.is_super_admin() then raise exception 'Agency access required.' using errcode = '42501'; end if;
  if p_month is null or extract(day from p_month) <> 1 then raise exception 'Choose a calendar month.' using errcode = '22023'; end if;
  with period as (
    select p_month::timestamp at time zone 'UTC' as starts,
      (p_month + interval '1 month')::timestamp at time zone 'UTC' as ends
  ), usage_rows as (
    select u.*, case when u.source = 'eval' then 'eval'
      when a.is_internal or r.is_unlimited then 'agency' else 'client' end as bucket,
      (u.created_at at time zone 'America/Chicago')::date as local_day,
      u.input_tokens + u.output_tokens + u.cache_read_tokens + u.cache_write_5m_tokens + u.cache_write_1h_tokens as tokens
    from public.ai_usage u cross join period p
    left join public.accounts a on a.id = u.account_id
    left join public.ai_requests r on r.id = u.request_id
    where u.created_at >= p.starts and u.created_at < p.ends
  ), client_cost as (
    select account_id, count(*) filter (where bucket = 'client') as requests,
      coalesce(sum(cost_usd) filter (where bucket = 'client'), 0) as cost_usd,
      coalesce(sum(cost_usd) filter (where bucket = 'agency'), 0) as agency_cost_usd
    from usage_rows where account_id is not null group by account_id
  ), client_credits as (
    select r.account_id, sum(r.credits_used) as credits
    from public.ai_requests r cross join period p
    where r.created_at >= p.starts and r.created_at < p.ends and r.status = 'completed'
      and r.generation_id is null and not r.is_unlimited
    group by r.account_id
  ), clients as (
    select a.id as account_id, a.name as account_name, coalesce(c.requests, 0) as requests,
      coalesce(c.cost_usd, 0) as cost_usd, coalesce(c.agency_cost_usd, 0) as agency_cost_usd,
      coalesce(credits.credits, 0) as credits_charged
    from public.accounts a left join client_cost c on c.account_id = a.id
    left join client_credits credits on credits.account_id = a.id where not a.is_internal
  ), daily as (
    select local_day as day, coalesce(sum(cost_usd) filter (where bucket = 'client'), 0) as clients,
      coalesce(sum(cost_usd) filter (where bucket = 'agency'), 0) as agency,
      coalesce(sum(cost_usd) filter (where bucket = 'eval'), 0) as evals
    from usage_rows group by local_day
  ), agency as (
    select action_type, count(*) as requests, sum(tokens) as tokens, sum(cost_usd) as cost_usd
    from usage_rows where bucket = 'agency' group by action_type
  )
  select jsonb_build_object(
    'clients', coalesce((select jsonb_agg(to_jsonb(c) order by c.account_name, c.account_id) from clients c), '[]'::jsonb),
    'agency', coalesce((select jsonb_agg(to_jsonb(a) order by a.action_type) from agency a), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from daily d), '[]'::jsonb),
    'totals', (select jsonb_build_object(
      'clients', coalesce(sum(cost_usd) filter (where bucket = 'client'), 0),
      'agency', coalesce(sum(cost_usd) filter (where bucket = 'agency'), 0),
      'evals', coalesce(sum(cost_usd) filter (where bucket = 'eval'), 0),
      'requests', count(*)) from usage_rows)
  ) into result;
  return result;
end;
$$;
revoke all on function public.ai_cost_report(date) from public, anon;
grant execute on function public.ai_cost_report(date) to authenticated;

commit;
