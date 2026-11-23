-- Run only against an isolated test database with every migration applied.
-- Tests run as the database owner and roll back every fixture.
begin;
do $$
#variable_conflict use_variable
declare
  owner_id uuid := '12000000-0000-4000-8000-000000000001';
  editor_id uuid := '12000000-0000-4000-8000-000000000002';
  stranger_id uuid := '12000000-0000-4000-8000-000000000003';
  admin_id uuid := '12000000-0000-4000-8000-000000000004';
  acct uuid := '22000000-0000-4000-8000-000000000001';
  other_account uuid := '22000000-0000-4000-8000-000000000002';
  site uuid := '32000000-0000-4000-8000-000000000001';
  thread uuid := '62000000-0000-4000-8000-000000000001';
  run uuid := '72000000-0000-4000-8000-000000000001';
  request uuid;
  second_request uuid;
  admin_request uuid;
  visible int;
  message text;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (owner_id, 'owner@limits.test', '{}'), (editor_id, 'editor@limits.test', '{}'),
    (stranger_id, 'stranger@limits.test', '{}'), (admin_id, 'agency@limits.test', '{}');
  update public.profiles set is_super_admin = true where id = admin_id;
  insert into public.accounts(id, name) values (acct, 'Limits test'), (other_account, 'Other limits test');
  insert into public.account_members values
    (acct, owner_id, 'owner'), (acct, editor_id, 'editor'), (other_account, stranger_id, 'owner');
  insert into public.sites(id, account_id, subdomain) values (site, acct, 'agent-limits-test');

  -- Defaults for every account.
  if (select (agent_requests_per_hour, agent_requests_per_day) from public.ai_limits where account_id = acct) is distinct from (30, 150) then
    raise exception 'Expected default agent limits of 30 an hour and 150 a day.';
  end if;

  ---------------------------------------------------------------------------
  -- Account rate limit: shared by every member, agency exempt.
  ---------------------------------------------------------------------------
  update public.ai_limits set agent_requests_per_hour = 3, agent_requests_per_day = 5 where account_id = acct;
  perform public.reserve_ai_agent_slot(owner_id, acct);
  perform public.reserve_ai_agent_slot(editor_id, acct);
  perform public.reserve_ai_agent_slot(owner_id, acct);
  begin
    perform public.reserve_ai_agent_slot(editor_id, acct);
    raise exception 'Expected the hourly limit to apply to the whole account.';
  exception when sqlstate 'P0001' then
    get stacked diagnostics message = message_text;
    if message !~ '^Your account has reached its hourly AI agent limit\. Try again in about \d+ minutes?\.$' then
      raise exception 'Unexpected hourly limit message: %', message;
    end if;
  end;
  if (select count(*) from public.ai_agent_request_log where account_id = acct) <> 3 then
    raise exception 'A refused request must not be counted.';
  end if;

  -- The agency is never limited or counted, and another account has its own allowance.
  perform public.reserve_ai_agent_slot(admin_id, acct);
  perform public.reserve_ai_agent_slot(stranger_id, other_account);
  if (select count(*) from public.ai_agent_request_log where account_id = acct) <> 3
    or (select count(*) from public.ai_agent_request_log where account_id = other_account) <> 1 then
    raise exception 'Agency requests must not be counted, and accounts must be counted apart.';
  end if;
  begin
    perform public.reserve_ai_agent_slot(stranger_id, acct);
    raise exception 'Expected a non-member to be refused.';
  exception when insufficient_privilege then null;
  end;

  -- An hour later the hourly allowance is free again, until the daily one is used up.
  update public.ai_agent_request_log set created_at = created_at - interval '2 hours' where account_id = acct;
  perform public.reserve_ai_agent_slot(owner_id, acct);
  perform public.reserve_ai_agent_slot(owner_id, acct);
  begin
    perform public.reserve_ai_agent_slot(owner_id, acct);
    raise exception 'Expected the daily limit.';
  exception when sqlstate 'P0001' then
    get stacked diagnostics message = message_text;
    if message !~ '^Your account has reached its daily AI agent limit\. Try again in about 22 hours\.$' then
      raise exception 'Unexpected daily limit message: %', message;
    end if;
  end;
  -- Requests older than a day stop counting and are removed.
  update public.ai_agent_request_log set created_at = created_at - interval '25 hours' where account_id = acct;
  perform public.reserve_ai_agent_slot(owner_id, acct);
  if (select count(*) from public.ai_agent_request_log where account_id = acct) <> 1 then
    raise exception 'Expected requests older than a day to be removed.';
  end if;
  update public.ai_limits set agent_requests_per_hour = 0 where account_id = acct;
  begin
    perform public.reserve_ai_agent_slot(owner_id, acct);
    raise exception 'Expected a zero limit to turn the agent off.';
  exception when sqlstate 'P0001' then
    get stacked diagnostics message = message_text;
    if message not like 'The AI agent is turned off%' then raise exception 'Unexpected message: %', message; end if;
  end;

  -- Clients can neither take slots themselves nor read the ledger; the agency can read it.
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.reserve_ai_agent_slot(owner_id, acct);
    raise exception 'Expected clients to be unable to call the limit function.';
  exception when insufficient_privilege then null;
  end;
  select count(*) into visible from public.ai_agent_request_log;
  if visible <> 0 then raise exception 'Clients must not read the request log.'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  select count(*) into visible from public.ai_agent_request_log;
  if visible <> 2 then raise exception 'Expected the agency to read the request log, saw % rows.', visible; end if;
  execute 'reset role';

  ---------------------------------------------------------------------------
  -- Credit charging: 1 credit for a run beyond the allowance, 3 for a large run.
  ---------------------------------------------------------------------------
  update public.ai_limits set monthly_edits = 1, extra_credits = 4 where account_id = acct;
  request := public.reserve_ai_request(owner_id, acct, 'edit_section', 'test-model', site);
  if (select (credits_used, is_unlimited, status) from public.ai_requests where id = request) is distinct from (0, false, 'pending'::text)
    or (select extra_credits from public.ai_limits where account_id = acct) <> 4 then
    raise exception 'A run inside the monthly allowance must not use credits.';
  end if;
  second_request := public.reserve_ai_request(owner_id, acct, 'edit_section', 'test-model', site);
  if (select credits_used from public.ai_requests where id = second_request) <> 1
    or (select extra_credits from public.ai_limits where account_id = acct) <> 3 then
    raise exception 'A run beyond the allowance must cost 1 credit.';
  end if;
  -- Growing into a large run costs 3 in total, once.
  perform public.upgrade_ai_agent_request(second_request);
  perform public.upgrade_ai_agent_request(second_request);
  if (select credits_used from public.ai_requests where id = second_request) <> 3
    or (select extra_credits from public.ai_limits where account_id = acct) <> 1 then
    raise exception 'A large run must cost 3 credits in total, charged once.';
  end if;
  -- A large run needs its credits even when the run started inside the allowance.
  begin
    perform public.upgrade_ai_agent_request(request);
    raise exception 'Expected a large run without enough credits to be refused.';
  exception when sqlstate 'P0001' then
    get stacked diagnostics message = message_text;
    if message not like 'A large AI run requires 3 credits%' then raise exception 'Unexpected message: %', message; end if;
  end;
  if (select credits_used from public.ai_requests where id = request) <> 0
    or (select extra_credits from public.ai_limits where account_id = acct) <> 1 then
    raise exception 'A refused large run must leave the reservation and the credits unchanged.';
  end if;
  -- A run that used no AI is released and its credits returned; a finished one is recorded once.
  perform public.finish_ai_request(second_request, true);
  if (select extra_credits from public.ai_limits where account_id = acct) <> 4
    or (select status from public.ai_requests where id = second_request) <> 'failed' then
    raise exception 'A released run must return its credits.';
  end if;
  perform public.finish_ai_request(request, false, 1200, 300, 5000, 0, 0, 0.0042);
  perform public.finish_ai_request(request, false, 9999, 9999, 0, 0, 0, 1);
  if (select (input_tokens, output_tokens, cache_read_tokens, cost_usd) from public.ai_usage where request_id = request)
      is distinct from (1200::bigint, 300::bigint, 5000::bigint, 0.0042::numeric) then
    raise exception 'A finished run must record its usage exactly once.';
  end if;
  -- The monthly allowance and credits both spent: the next run is refused.
  update public.ai_limits set extra_credits = 0 where account_id = acct;
  begin
    perform public.reserve_ai_request(owner_id, acct, 'edit_section', 'test-model', site);
    raise exception 'Expected the monthly limit.';
  exception when sqlstate 'P0001' then
    get stacked diagnostics message = message_text;
    if message not like 'Monthly AI limit reached%' then raise exception 'Unexpected message: %', message; end if;
  end;
  -- Agency runs are unlimited and never use a client's credits.
  admin_request := public.reserve_ai_request(admin_id, acct, 'edit_section', 'test-model', site);
  perform public.upgrade_ai_agent_request(admin_request);
  if (select (credits_used, is_unlimited) from public.ai_requests where id = admin_request) is distinct from (0, true) then
    raise exception 'Agency runs must be unlimited and free of credits.';
  end if;

  ---------------------------------------------------------------------------
  -- Access to conversations: private to the member who started them.
  ---------------------------------------------------------------------------
  insert into public.ai_agent_threads(id, site_id, user_id, title) values (thread, site, owner_id, 'Make it premium');
  insert into public.ai_agent_runs(id, thread_id, status, request_id, cost_usd, run_state)
    values (run, thread, 'completed', request, 0.0042, '{"tokenUsage":{"inputTokens":1200}}');
  insert into public.ai_agent_messages(thread_id, run_id, role, content) values (thread, run, 'user', 'Make it premium');

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.ai_agent_threads) <> 1 or (select count(*) from public.ai_agent_messages) <> 1
    or (select status from public.ai_agent_runs where id = run) <> 'completed' then
    raise exception 'The member who started a conversation must be able to read it.';
  end if;
  -- Provider cost, token counts and the saved model conversation stay on the server.
  begin
    perform cost_usd from public.ai_agent_runs where id = run;
    raise exception 'Clients must not read the provider cost of a run.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform usage from public.ai_agent_runs where id = run;
    raise exception 'Clients must not read the token usage of a run.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform run_state from public.ai_agent_runs where id = run;
    raise exception 'Clients must not read the saved model conversation.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.ai_requests;
    raise exception 'Clients must not read AI reservations.';
  exception when insufficient_privilege then null;
  end;
  -- The usage ledger holds the same cost per request, so owners cannot read it either.
  if (select count(*) from public.ai_usage) <> 0 then
    raise exception 'Clients must not read provider cost in the usage ledger.';
  end if;
  -- Owners still see their allowance and credits.
  if (select count(*) from public.ai_account_summaries() s where s.account_id = acct) <> 1 then
    raise exception 'Owners must still see their AI allowance.';
  end if;
  -- Conversations are written by the server only.
  begin
    insert into public.ai_agent_threads(site_id, user_id, title) values (site, owner_id, 'Direct');
    raise exception 'Clients must not create conversations directly.';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_agent_runs set status = 'running' where id = run;
    raise exception 'Clients must not change runs directly.';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ai_agent_messages where thread_id = thread;
    raise exception 'Clients must not delete messages directly.';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  if (select cost_usd from public.ai_usage where request_id = request) <> 0.0042 then
    raise exception 'The agency must read provider cost in the usage ledger.';
  end if;
  execute 'reset role';

  -- Another member of the same account, another account and the agency see nothing of it.
  foreach visible in array array[1, 2, 3] loop
    perform set_config('request.jwt.claim.sub', (array[editor_id, stranger_id, admin_id])[visible]::text, true);
    execute 'set local role authenticated';
    if (select count(*) from public.ai_agent_threads) <> 0 or (select count(*) from public.ai_agent_runs) <> 0
      or (select count(*) from public.ai_agent_messages) <> 0 then
      raise exception 'A conversation must be private to the member who started it (case %).', visible;
    end if;
    execute 'reset role';
  end loop;

  -- Leaving the account ends access to the conversation.
  delete from public.account_members where account_id = acct and user_id = owner_id;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.ai_agent_threads) <> 0 or (select count(*) from public.ai_agent_runs) <> 0
    or (select count(*) from public.ai_agent_messages) <> 0 then
    raise exception 'A former member must lose access to their conversations.';
  end if;
  execute 'reset role';
end;
$$;
rollback;
