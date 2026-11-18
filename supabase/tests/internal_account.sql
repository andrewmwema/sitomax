-- Run only against an isolated test database with migrations through 0019.
begin;
do $$
declare
  admin_id uuid := '19000000-0000-4000-8000-000000000001';
  client_user uuid := '19000000-0000-4000-8000-000000000002';
  internal_id uuid;
  client_id uuid;
  request_id uuid;
  generation_id uuid;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (admin_id, 'internal-admin@example.test', '{}'),
    (client_user, 'internal-client@example.test', '{}');
  update public.profiles set is_super_admin = true where id = admin_id;
  insert into public.accounts(name) values ('External client') returning id into client_id;
  insert into public.account_members values (client_id, client_user, 'owner');
  assert exists (select 1 from public.ai_limits where account_id = client_id),
    'External clients retain their default credit limits';

  execute 'set local role service_role';
  begin
    perform public.get_or_create_internal_account(client_user, 'Not the agency');
    raise exception 'Expected super admin denial';
  exception when insufficient_privilege then null;
  end;
  internal_id := public.get_or_create_internal_account(admin_id, 'SitoMax');
  assert public.get_or_create_internal_account(admin_id, 'SitoMax') = internal_id,
    'Repeated initialization reuses the same account';
  execute 'reset role';
  assert (select count(*) from public.accounts where is_internal) = 1;
  assert exists (select 1 from public.account_members
    where account_id = internal_id and user_id = admin_id and role = 'owner');
  assert not exists (select 1 from public.ai_limits where account_id = internal_id),
    'The internal account has no client quota row';
  begin
    insert into public.accounts(name, is_internal) values ('Duplicate agency', true);
    raise exception 'Expected unique internal account denial';
  exception when unique_violation then null;
  end;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  assert not has_column_privilege('authenticated', 'public.accounts', 'is_internal', 'UPDATE');
  assert not has_column_privilege('authenticated', 'public.accounts', 'is_internal', 'INSERT');
  assert has_column_privilege('authenticated', 'public.accounts', 'name', 'UPDATE');
  begin
    update public.accounts set is_internal = true where id = client_id;
    raise exception 'Expected internal marker write denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.get_or_create_internal_account(admin_id, 'SitoMax');
    raise exception 'Expected service-only RPC denial';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.account_members values (internal_id, client_user, 'owner');
    raise exception 'Expected internal invitation denial';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ai_limits(account_id) values (internal_id);
    raise exception 'Expected internal quota denial';
  exception when insufficient_privilege then null;
  end;
  assert not exists (select 1 from public.accounts where not is_internal and id = internal_id),
    'Client lists exclude the internal account';
  assert not exists (select 1 from public.ai_account_summaries() where account_id = internal_id);
  assert exists (select 1 from public.ai_account_summaries() where account_id = client_id);
  assert not exists (select 1 from public.ai_monthly_costs(current_date - (extract(day from current_date)::int - 1))
    where account_id = internal_id), 'Client cost reports exclude the internal account';
  execute 'reset role';

  execute 'set local role service_role';
  request_id := public.reserve_ai_request(admin_id, internal_id, 'rewrite_text', 'test-model');
  perform public.finish_ai_request(request_id, false, 10, 5, 0, 0, 0, 0.001);
  generation_id := public.begin_ai_site_generation(admin_id, internal_id, 'test-model');
  request_id := public.reserve_ai_generation_call(generation_id, admin_id, internal_id, 'generate_site', 'test-model');
  perform public.finish_ai_request(request_id, true);
  perform public.finish_ai_site_generation(generation_id, false);
  execute 'reset role';
  assert exists (select 1 from public.ai_requests where id = request_id and is_unlimited and credits_used = 0);
  assert exists (select 1 from public.ai_usage where account_id = internal_id),
    'Internal AI work is still metered without client credits';

  perform set_config('request.jwt.claim.sub', client_user::text, true);
  execute 'set local role authenticated';
  assert not exists (select 1 from public.accounts where is_internal),
    'Clients cannot see the internal account';
  assert not exists (select 1 from public.sites where account_id = internal_id);
  execute 'reset role';
end;
$$;
rollback;
