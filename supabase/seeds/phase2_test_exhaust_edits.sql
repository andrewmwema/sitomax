-- REVIEW ONLY. Obtain separate approval before execution, after the client
-- recommendation build. This adds simulated TEST requests, not provider calls.
-- It removes the remaining TEST credits on this fixture account. Run cleanup
-- after acceptance to delete the fixture account and simulated requests.
begin;

do $$
declare
  fixture_account constant uuid := '64000000-0000-4000-8000-000000000007';
  client_id uuid;
  fixture_site uuid;
  used integer;
  month_start timestamptz := date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
begin
  if clock_timestamp() - month_start < interval '2 minutes' then
    raise exception 'Run after the first two minutes of the UTC month.';
  end if;
  select p.id into strict client_id from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com')
      and lower(p.email) = lower(u.email) and not p.is_super_admin;
  perform 1 from public.accounts a where a.id = fixture_account
    and a.name = 'TEST-PHASE2-Mode2-Client' and a.site_plan_key = 'starter' and not a.is_internal for update;
  if not found or not exists (select 1 from public.account_members
      where account_id = fixture_account and user_id = client_id and role = 'owner')
    or exists (select 1 from public.account_members
      where account_id = fixture_account and (user_id <> client_id or role <> 'owner'))
    or exists (select 1 from public.ai_account_allowance_overrides where account_id = fixture_account)
    or not exists (select 1 from public.ai_plan_allowances where plan_key = 'starter' and monthly_edits = 50)
    or exists (select 1 from public.ai_requests where account_id = fixture_account and status = 'pending') then
    raise exception 'The unused TEST limit fixture is missing, changed, or has active requests.';
  end if;
  select s.id into strict fixture_site from public.sites s
    where s.account_id = fixture_account and s.name like 'TEST-%' and s.subdomain like 'test-%'
      and s.template_key in ('showcase', 'clarity', 'studio') and s.custom_domain is null and not s.domain_verified;
  if (select count(*) from public.sites where account_id = fixture_account) <> 1 then
    raise exception 'The TEST limit fixture must contain exactly one marked site.';
  end if;
  perform 1 from public.ai_limits where account_id = fixture_account for update;
  if not found then raise exception 'The TEST limit fixture has no limits.'; end if;
  select count(*) into used from public.ai_requests where account_id = fixture_account
    and created_at >= month_start and generation_id is null and status in ('pending', 'completed')
    and credits_used = 0 and not is_unlimited and action <> 'generate_site';
  if used > 50 then raise exception 'The TEST edit count is already above the plan allowance.'; end if;
  update public.ai_limits set extra_credits = 0 where account_id = fixture_account;
  insert into public.ai_requests(account_id, user_id, site_id, action, model, status, created_at)
    select fixture_account, client_id, fixture_site, 'edit_section', 'TEST-model', 'completed', month_start
    from generate_series(1, 50 - used);
end;
$$;

commit;
