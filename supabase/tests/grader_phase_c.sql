begin;

update public.grader_config set secret_hash = encode(sha256(convert_to('test-grader-worker-secret-1234567890', 'UTF8')), 'hex');

do $$
declare
  secret constant text := 'test-grader-worker-secret-1234567890';
  admin_id constant uuid := '69000000-0000-4000-8000-000000000001';
  other_id constant uuid := '69000000-0000-4000-8000-000000000002';
  result jsonb;
  base uuid;
  competitor uuid;
  kept_competitor uuid;
  rows_seen integer;
  i integer;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (admin_id, 'grader-c-admin@example.test', '{}'), (other_id, 'grader-c-user@example.test', '{}');
  update public.profiles set is_super_admin = true where id = admin_id;

  for i in 1..6 loop
    result := public.grader_create_report(secret, 'admin-' || i, 'https://example.com/', 'example.com',
      null, null, null, null, 'admin-hash', 'agent', 'admin');
    if result ? 'error' then raise exception 'Admin scans must skip the per-IP limit: %', result; end if;
  end loop;
  base := (result->>'id')::uuid;
  update public.grader_reports set status = 'complete', results = '{"checks":[]}', ai_summary = '{"headline":"H"}',
    scores = '{"overall":72,"grade":"C","categories":{}}' where id = base;

  result := public.grader_get_report(secret, 'admin-6');
  if not (result->>'unlocked')::boolean or not result ? 'results' then
    raise exception 'Admin reports must return the full report: %', result;
  end if;

  begin
    perform public.grader_create_report(secret, 'bad-source', 'https://example.com/', 'example.com',
      null, null, null, null, 'hash', 'agent', 'other');
    raise exception 'Invalid source was accepted';
  exception when invalid_parameter_value then null;
  end;

  insert into public.grader_reports(slug, url_input, domain, status, ip_hash)
    values ('locked-base', 'https://locked.example/', 'locked.example', 'complete', 'hash');
  result := public.grader_create_report(secret, 'compare-locked', 'https://rival.example/', 'rival.example',
    null, null, null, null, 'compare-hash', 'agent', 'public', 'locked-base');
  if result->>'error' <> 'not_found' then raise exception 'Locked reports must not start comparisons: %', result; end if;

  result := public.grader_create_report(secret, 'compare-ok', 'https://rival.example/', 'rival.example',
    null, null, null, null, 'compare-hash', 'agent', 'public', 'admin-6');
  competitor := (result->>'id')::uuid;
  if (select compare_of from public.grader_reports where id = competitor) <> base then
    raise exception 'Comparison was not linked';
  end if;
  if public.grader_get_report(secret, 'admin-6')->>'competitor_slug' <> 'compare-ok' then
    raise exception 'Full report must expose its latest competitor';
  end if;
  if public.grader_get_report(secret, 'compare-ok') ? 'results' then
    raise exception 'Competitor scans must stay locked';
  end if;

  -- Retention: only old, locked public scans that are not attached to a kept report expire.
  insert into public.grader_reports(slug, url_input, domain, status, ip_hash, created_at, unlocked, source) values
    ('old-locked', 'https://a.example/', 'a.example', 'complete', 'r', now() - interval '91 days', false, 'public'),
    ('old-unlocked', 'https://b.example/', 'b.example', 'complete', 'r', now() - interval '91 days', true, 'public'),
    ('old-admin', 'https://c.example/', 'c.example', 'complete', 'r', now() - interval '91 days', false, 'admin'),
    ('new-locked', 'https://d.example/', 'd.example', 'complete', 'r', now() - interval '89 days', false, 'public');
  insert into public.grader_reports(slug, url_input, domain, status, ip_hash, created_at, compare_of)
    values ('old-competitor', 'https://e.example/', 'e.example', 'complete', 'r', now() - interval '91 days', base)
    returning id into kept_competitor;
  result := public.grader_retention_expired(secret, 50);
  if (result->>'retention_days')::integer <> 90 or jsonb_array_length(result->'reports') <> 1
    or result->'reports'->0->>'slug' <> 'old-locked' then
    raise exception 'Unexpected retention candidates: %', result;
  end if;
  if public.grader_delete_expired(secret, array(select id from public.grader_reports where slug in
    ('old-locked', 'old-unlocked', 'old-admin', 'new-locked', 'old-competitor'))) <> 1 then
    raise exception 'Retention must delete only expired locked public scans';
  end if;
  if exists (select from public.grader_reports where slug = 'old-locked')
    or not exists (select from public.grader_reports where id = kept_competitor) then
    raise exception 'Retention deleted the wrong reports';
  end if;

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  execute 'set local role authenticated';
  select count(*) into rows_seen from public.grader_admin_list_reports();
  if rows_seen <> 0 then raise exception 'Non-admins must not list grader reports'; end if;
  begin
    perform public.grader_set_share_disabled('admin-6', true);
    raise exception 'Non-admins must not disable share links';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  select count(*) into rows_seen from public.grader_admin_list_reports(p_source => 'admin', p_limit => 3);
  if rows_seen <> 3 then raise exception 'Admin list pagination failed'; end if;
  if (select total_count from public.grader_admin_list_reports(p_source => 'admin', p_limit => 3) limit 1) <> 7 then
    raise exception 'Admin list total count failed';
  end if;
  if (select count(*) from public.grader_admin_list_reports(p_search => 'RIVAL.example')) <> 1
    or (select count(*) from public.grader_admin_list_reports(p_grade => 'C')) <> 1
    or (select count(*) from public.grader_admin_list_reports(p_unlocked => true)) <> 1 then
    raise exception 'Admin list filters failed';
  end if;
  if not public.grader_set_share_disabled('admin-6', true) then raise exception 'Share toggle failed'; end if;
  execute 'reset role';
  if not (public.grader_get_report(secret, 'admin-6')->>'share_disabled')::boolean then
    raise exception 'Share disabled flag missing from report';
  end if;
end;
$$;

rollback;
