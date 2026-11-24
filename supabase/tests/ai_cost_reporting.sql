begin;
do $$
declare
  admin_id uuid := '50000000-0000-4000-8000-000000000001';
  client_user uuid := '50000000-0000-4000-8000-000000000002';
  client_account uuid;
  internal_account uuid;
  parent_id uuid := '50000000-0000-4000-8000-000000000003';
  child_id uuid := '50000000-0000-4000-8000-000000000004';
  agency_id uuid := '50000000-0000-4000-8000-000000000005';
  internal_request uuid := '50000000-0000-4000-8000-000000000006';
  eval_id uuid := '50000000-0000-4000-8000-000000000007';
  outside_id uuid := '50000000-0000-4000-8000-000000000008';
  labeled_id uuid := '50000000-0000-4000-8000-000000000009';
  report jsonb;
  client jsonb;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (admin_id, 'cost-admin@example.test', '{}'), (client_user, 'cost-client@example.test', '{}');
  update public.profiles set is_super_admin = true where id = admin_id;
  insert into public.accounts(name) values ('Cost client') returning id into client_account;
  insert into public.account_members(account_id, user_id, role) values (client_account, client_user, 'owner');
  internal_account := public.get_or_create_internal_account(admin_id, 'Cost agency');

  insert into public.ai_requests(id, account_id, user_id, action, model, status, credits_used, is_unlimited, is_generation, generation_id, created_at) values
    (parent_id, client_account, client_user, 'generate_site', 'test', 'completed', 10, false, true, null, '2026-11-01 00:00:00+00'),
    (child_id, client_account, client_user, 'generate_site', 'test', 'completed', 0, false, false, parent_id, '2026-11-01 00:00:00+00'),
    (agency_id, client_account, admin_id, 'edit_section', 'test', 'completed', 0, true, false, null, '2026-11-15 12:00:00+00'),
    (internal_request, internal_account, admin_id, 'rewrite_text', 'test', 'completed', 0, true, false, null, '2026-11-30 23:59:59+00'),
    (outside_id, client_account, client_user, 'rewrite_text', 'test', 'completed', 1, false, false, null, '2026-12-01 00:00:00+00'),
    (labeled_id, client_account, client_user, 'rewrite_text', 'test', 'pending', 0, false, false, null, '2026-12-02 00:00:00+00');
  insert into public.ai_usage(request_id, account_id, user_id, action, model, input_tokens, output_tokens, cost_usd, action_type, created_at) values
    (child_id, client_account, client_user, 'generate_site', 'test', 100, 50, 0.1, 'site_generation', '2026-11-01 00:00:00+00'),
    (agency_id, client_account, admin_id, 'edit_section', 'test', 200, 40, 0.2, 'agent_run', '2026-11-15 12:00:00+00'),
    (internal_request, internal_account, admin_id, 'rewrite_text', 'test', 50, 10, 0.3, 'blog_ai', '2026-11-30 23:59:59+00'),
    (outside_id, client_account, client_user, 'rewrite_text', 'test', 50, 10, 9, 'edit', '2026-12-01 00:00:00+00');

  execute 'set local role service_role';
  perform public.finish_ai_request_labeled(labeled_id, 10, 5, 0, 0, 0, 0.05, 'lead_draft');
  perform public.finish_ai_request_labeled(labeled_id, 10, 5, 0, 0, 0, 0.05, 'lead_draft');
  execute 'reset role';
  assert (select action_type from public.ai_usage where request_id = labeled_id) = 'lead_draft';
  assert (select count(*) from public.ai_usage where request_id = labeled_id) = 1;
  perform set_config('request.jwt.claim.sub', client_user::text, true);
  execute 'set local role authenticated';
  begin
    perform public.ai_cost_report('2026-11-01');
    raise exception 'Expected report denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_ai_eval_usage(eval_id, 'test', 10, 5, 0, 0, 0, 0.4);
    raise exception 'Expected eval write denial';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  perform public.record_ai_eval_usage(eval_id, 'test', 10, 5, 0, 0, 0, 0.4);
  perform public.record_ai_eval_usage(eval_id, 'test', 10, 5, 0, 0, 0, 0.4);
  begin
    perform public.record_ai_eval_usage(eval_id, 'test', 10, 5, 0, 0, 0, 0.5);
    raise exception 'Expected idempotency conflict';
  exception when unique_violation then null;
  end;
  execute 'reset role';
  update public.ai_usage set created_at = '2026-11-01 00:00:00+00' where id = eval_id;
  perform set_config('request.jwt.claim.sub', client_user::text, true);
  execute 'set local role authenticated';
  assert not exists (select 1 from public.ai_usage where id = eval_id), 'Eval usage is not visible to clients';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  report := public.ai_cost_report('2026-11-01');
  select value into client from jsonb_array_elements(report->'clients') where value->>'account_id' = client_account::text;
  assert (report#>>'{totals,clients}')::numeric = 0.1;
  assert (report#>>'{totals,agency}')::numeric = 0.5;
  assert (report#>>'{totals,evals}')::numeric = 0.4;
  assert (report#>>'{totals,requests}')::int = 4;
  assert (client->>'credits_charged')::int = 10, 'Parent generation credits must be counted exactly once';
  assert (client->>'cost_usd')::numeric = 0.1 and (client->>'agency_cost_usd')::numeric = 0.2;
  assert exists (select 1 from jsonb_array_elements(report->'daily') d
    where d->>'day' = '2026-10-31' and (d->>'clients')::numeric = 0.1 and (d->>'evals')::numeric = 0.4);
  assert exists (select 1 from jsonb_array_elements(report->'agency') a
    where a->>'action_type' = 'agent_run' and (a->>'tokens')::int = 240 and (a->>'cost_usd')::numeric = 0.2);
  execute 'reset role';
end;
$$;
rollback;
