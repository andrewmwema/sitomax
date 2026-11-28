begin;
do $$
declare
  agency uuid := '70000000-0000-4000-8000-000000000001';
  owner_id uuid := '70000000-0000-4000-8000-000000000002';
  editor_id uuid := '70000000-0000-4000-8000-000000000003';
  outsider uuid := '70000000-0000-4000-8000-000000000004';
  account_a uuid := '70000000-0000-4000-8000-000000000011';
  account_b uuid := '70000000-0000-4000-8000-000000000012';
  profile jsonb;
  profile_id uuid;
  started timestamptz;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (agency, 'social-admin@example.test', '{}'), (owner_id, 'social-owner@example.test', '{}'),
    (editor_id, 'social-editor@example.test', '{}'), (outsider, 'social-other@example.test', '{}');
  update public.profiles set is_super_admin = true where id = agency;
  insert into public.accounts(id, name) values (account_a, 'Social A'), (account_b, 'Social B');
  insert into public.account_members(account_id, user_id, role) values
    (account_a, owner_id, 'owner'), (account_a, editor_id, 'editor'), (account_b, outsider, 'owner');

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  profile := public.social_connection_profile(account_a);
  profile_id := (profile->>'id')::uuid;
  started := (profile->>'requested_at')::timestamptz;
  assert (public.social_connection_profile(account_a)->>'id')::uuid = profile_id, 'Default profile must be stable';
  assert not exists (select 1 from public.social_profiles), 'Owners cannot read stored mappings directly';
  perform public.save_social_profile_mapping(profile_id, 'v1.' || repeat('a', 100));
  perform public.save_social_profile_mapping(profile_id, 'v1.' || repeat('b', 100));
  assert public.social_connection_profile(account_a)->>'encrypted_provider_profile_id' = 'v1.' || repeat('a', 100), 'Mapping is immutable';
  assert public.sync_social_accounts(profile_id, started,
    '[{"platform":"facebook","displayName":"Page","avatarUrl":null,"status":"connected"}]');
  assert (select count(*) from public.social_accounts) = 1;
  assert not public.sync_social_accounts(profile_id, started - interval '1 second', '[]'), 'Stale sync cannot disconnect new accounts';
  assert (select status from public.social_accounts) = 'connected';
  perform public.log_social_provider_call(account_a, 'list_accounts', true, 200, null);
  assert not exists (select 1 from public.social_provider_logs), 'Client logs are not readable';
  begin
    perform public.social_connection_profile(account_b);
    raise exception 'Expected cross-account access denial';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.social_accounts set display_name = 'Tampered';
    raise exception 'Expected direct update denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.log_social_provider_call(account_a, 'secret-should-not-be-stored', true, 200, null);
    raise exception 'Expected bounded metadata denial';
  exception when invalid_parameter_value then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  execute 'set local role authenticated';
  assert not exists (select 1 from public.social_accounts), 'Editors cannot manage social accounts';
  begin
    perform public.social_connection_profile(account_a);
    raise exception 'Expected editor denial';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  assert not exists (select 1 from public.social_accounts), 'Other tenants cannot read account cards';
  begin
    perform public.sync_social_accounts(profile_id, clock_timestamp(), '[]');
    raise exception 'Expected cross-account sync denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_social_profile_mapping(profile_id, 'v1.' || repeat('c', 100));
    raise exception 'Expected cross-account mapping denial';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', agency::text, true);
  execute 'set local role authenticated';
  assert (select count(*) from public.social_profiles) = 1;
  assert (select count(*) from public.social_provider_logs) = 1;
  assert public.sync_social_accounts(profile_id, clock_timestamp(), '[]');
  assert (select status from public.social_accounts) = 'disconnected';
  perform public.social_connection_profile(account_b);
  execute 'reset role';

  -- Set the counter deterministically rather than racing the wall-clock minute.
  update public.social_profiles set action_window = date_trunc('minute', clock_timestamp()), action_count = 30 where id = profile_id;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.social_connection_profile(account_a);
    raise exception 'Expected action limit';
  exception when raise_exception then
    if sqlerrm <> 'Social action limit reached. Wait a minute and try again.' then raise; end if;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  begin
    perform public.social_connection_profile(account_a);
    raise exception 'Expected anonymous denial';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$$;
rollback;
