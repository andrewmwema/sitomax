-- REVIEW ONLY: run only with explicit approval, after 0054-0056 and the Phase 2
-- fixtures. This transaction writes only to the named TEST accounts and is
-- rolled back. It makes no provider calls. Stop other test activity first.
begin;

do $$
declare
  client_id uuid;
  admin_id uuid;
  fixture record;
  request_id uuid;
  credits integer;
  month_start timestamptz := date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
begin
  if clock_timestamp() - month_start < interval '2 minutes' then
    raise exception 'Run after the first two minutes of the UTC month.';
  end if;
  select p.id into strict client_id from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com')
      and lower(p.email) = lower(u.email) and not p.is_super_admin;
  select p.id into strict admin_id from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com')
      and lower(p.email) = lower(u.email) and p.is_super_admin;

  for fixture in select * from (values
    ('64000000-0000-4000-8000-000000000001'::uuid, 'TEST-PHASE2-Showcase-Client', 'starter', 2, 50),
    ('64000000-0000-4000-8000-000000000003'::uuid, 'TEST-PHASE2-Clarity-Client', 'growth', 5, 150),
    ('64000000-0000-4000-8000-000000000005'::uuid, 'TEST-PHASE2-Studio-Client', 'premium', 10, 500)
  ) as fixtures(id, name, plan_key, builds, edits) loop
    if not exists (select 1 from public.accounts a
      join public.account_members m on m.account_id = a.id and m.user_id = client_id and m.role = 'owner'
      where a.id = fixture.id and a.name = fixture.name and a.site_plan_key = fixture.plan_key and not a.is_internal)
      or exists (select 1 from public.ai_requests r where r.account_id = fixture.id)
      or exists (select 1 from public.ai_account_allowance_overrides o where o.account_id = fixture.id) then
      raise exception 'Fixture % is missing, changed, or already used.', fixture.name;
    end if;
    if not exists (select 1 from public.ai_plan_allowances p where p.plan_key = fixture.plan_key
      and p.monthly_site_generations = fixture.builds and p.monthly_edits = fixture.edits) then
      raise exception 'Incorrect allowance for %.', fixture.plan_key;
    end if;

    update public.ai_limits set extra_credits = 20 where account_id = fixture.id;
    if not found then raise exception 'Missing AI limits for %.', fixture.name; end if;
    insert into public.ai_requests(account_id, user_id, action, model, status, created_at)
      select fixture.id, client_id, 'generate_site', 'TEST-model', 'completed', month_start
      from generate_series(1, fixture.builds - 1);
    insert into public.ai_requests(account_id, user_id, action, model, status, created_at)
      select fixture.id, client_id, 'edit_section', 'TEST-model', 'completed', month_start
      from generate_series(1, fixture.edits - 1);

    request_id := public.reserve_ai_request_for_plan(client_id, fixture.id, 'generate_site', 'TEST-model');
    if (select credits_used from public.ai_requests where id = request_id) <> 0 then
      raise exception 'Last included build was charged for %.', fixture.plan_key;
    end if;
    update public.ai_requests set created_at = month_start where id = request_id;
    request_id := public.reserve_ai_request_for_plan(client_id, fixture.id, 'generate_site', 'TEST-model');
    if (select credits_used from public.ai_requests where id = request_id) <> 10 then
      raise exception 'Build overage was not 10 credits for %.', fixture.plan_key;
    end if;
    perform public.finish_ai_request(request_id, true);

    request_id := public.reserve_ai_request_for_plan(client_id, fixture.id, 'edit_section', 'TEST-model');
    if (select credits_used from public.ai_requests where id = request_id) <> 0 then
      raise exception 'Last included edit was charged for %.', fixture.plan_key;
    end if;
    update public.ai_requests set created_at = month_start where id = request_id;
    request_id := public.reserve_ai_request_for_plan(client_id, fixture.id, 'rewrite_text', 'TEST-model');
    if (select credits_used from public.ai_requests where id = request_id) <> 1 then
      raise exception 'Edit overage was not 1 credit for %.', fixture.plan_key;
    end if;
    perform public.finish_ai_request(request_id, true);
    select extra_credits into strict credits from public.ai_limits where account_id = fixture.id;
    if credits <> 20 then raise exception 'Failed-request credits were not refunded for %.', fixture.plan_key; end if;
    perform set_config('request.jwt.claim.sub', client_id::text, true);
    if not exists (select 1 from public.ai_account_plan_summaries() summary
      where summary.account_id = fixture.id and summary.monthly_site_generations = fixture.builds
        and summary.monthly_edits = fixture.edits and summary.included_generations = fixture.builds
        and summary.included_edits = fixture.edits and summary.extra_credits = 20) then
      raise exception 'Usage summary does not match the allowance for %.', fixture.plan_key;
    end if;

    update public.ai_limits set extra_credits = 0 where account_id = fixture.id;
    begin
      perform public.reserve_ai_request_for_plan(client_id, fixture.id, 'edit_section', 'TEST-model');
      raise exception 'Expected the edit allowance to be exhausted.';
    exception when raise_exception then
      if sqlerrm <> 'Monthly AI limit reached. Ask your agency for more credits.' then raise; end if;
    end;
    request_id := public.reserve_ai_request_for_plan(admin_id, fixture.id, 'generate_site', 'TEST-model');
    if not (select is_unlimited and credits_used = 0 from public.ai_requests where id = request_id) then
      raise exception 'Agency build was not unlimited.';
    end if;
    update public.ai_requests set created_at = month_start where id = request_id;
  end loop;

  if exists (select 1 from public.ai_account_allowance_overrides where account_id in (
    '64000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000003',
    '64000000-0000-4000-8000-000000000005')) then
    raise exception 'Changing extra credits must not create allowance overrides.';
  end if;
  if not exists (select 1 from public.accounts a
    join public.account_members m on m.account_id = a.id and m.user_id = client_id and m.role = 'owner'
    where a.id = '64000000-0000-4000-8000-000000000002'
      and a.name = 'TEST-PHASE2-Showcase-Agency' and a.site_plan_key = 'starter' and not a.is_internal)
    or exists (select 1 from public.ai_requests where account_id = '64000000-0000-4000-8000-000000000002')
    or exists (select 1 from public.ai_account_allowance_overrides where account_id = '64000000-0000-4000-8000-000000000002') then
    raise exception 'The legacy compatibility fixture is missing, changed, or already used.';
  end if;
  update public.ai_limits set monthly_site_generations = monthly_site_generations, monthly_edits = monthly_edits
    where account_id = '64000000-0000-4000-8000-000000000002';
  if exists (select 1 from public.ai_account_allowance_overrides
    where account_id = '64000000-0000-4000-8000-000000000002') then
    raise exception 'An unchanged legacy save must not create overrides.';
  end if;
  begin
    delete from public.ai_limits where account_id = '64000000-0000-4000-8000-000000000002';
    if not found then raise exception 'Missing legacy compatibility fixture limits.'; end if;
    begin
      perform public.reserve_ai_request_for_plan(client_id, '64000000-0000-4000-8000-000000000002',
        'edit_section', 'TEST-model');
      raise exception 'Expected a missing-limits error.';
    exception when raise_exception then
      if sqlerrm <> 'AI limits are not configured for this account. Contact your agency.' then raise; end if;
    end;
    raise sqlstate 'P1234' using message = 'Rollback the missing-limits test.';
  exception when sqlstate 'P1234' then null;
  end;
  update public.ai_limits set monthly_site_generations = 3, monthly_edits = 55, extra_credits = 20
    where account_id = '64000000-0000-4000-8000-000000000002';
  if not found or not exists (select 1 from public.ai_account_allowance_overrides
    where account_id = '64000000-0000-4000-8000-000000000002'
      and monthly_site_generations = 3 and monthly_edits = 55) then
    raise exception 'Legacy quota updates were not captured.';
  end if;
  if not exists (select 1 from public.ai_account_plan_summaries() summary
    where summary.account_id = '64000000-0000-4000-8000-000000000002'
      and summary.monthly_site_generations = 3 and summary.monthly_edits = 55 and summary.extra_credits = 20) then
    raise exception 'Effective account overrides were not reported.';
  end if;
  update public.ai_account_allowance_overrides set monthly_site_generations = null
    where account_id = '64000000-0000-4000-8000-000000000002';
  if not exists (select 1 from public.ai_account_plan_summaries() summary
    where summary.account_id = '64000000-0000-4000-8000-000000000002'
      and summary.monthly_site_generations = 2 and summary.monthly_edits = 55) then
    raise exception 'A null override did not inherit the plan.';
  end if;
  update public.ai_account_allowance_overrides set monthly_site_generations = 0
    where account_id = '64000000-0000-4000-8000-000000000002';
  request_id := public.reserve_ai_request_for_plan(client_id, '64000000-0000-4000-8000-000000000002',
    'generate_site', 'TEST-model');
  if (select credits_used from public.ai_requests where id = request_id) <> 10 then
    raise exception 'The account override was not enforced.';
  end if;
  perform public.finish_ai_request(request_id, true);
  request_id := public.reserve_ai_request(client_id, '64000000-0000-4000-8000-000000000002',
    'generate_site', 'TEST-model');
  if (select credits_used from public.ai_requests where id = request_id) <> 0 then
    raise exception 'The deployed-main reservation function no longer works.';
  end if;
  update public.ai_limits set monthly_site_generations = 1, monthly_edits = 50
    where account_id = '64000000-0000-4000-8000-000000000002';
  if not exists (select 1 from public.ai_account_allowance_overrides
    where account_id = '64000000-0000-4000-8000-000000000002'
      and monthly_site_generations = 1 and monthly_edits = 50) then
    raise exception 'Explicit legacy default values were not captured.';
  end if;
end;
$$;

rollback;
