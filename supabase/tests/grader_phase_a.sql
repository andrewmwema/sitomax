begin;

update public.grader_config
  set secret_hash = encode(sha256(convert_to('test-grader-worker-secret-1234567890', 'UTF8')), 'hex');

do $$
declare
  secret constant text := 'test-grader-worker-secret-1234567890';
  report_id uuid;
  next_report_id uuid;
  result jsonb;
  call_id uuid;
  i integer;
begin
  begin
    perform public.grader_get_report('wrong', 'x');
    raise exception 'Wrong worker secret was accepted';
  exception when insufficient_privilege then null;
  end;
  result := public.grader_create_report(secret, 'test-1', 'https://example.com/', 'example.com',
    null, null, null, null, 'hash', 'agent');
  report_id := (result->>'id')::uuid;
  if report_id is null then raise exception 'Report was not created'; end if;
  for i in 2..5 loop
    perform public.grader_create_report(secret, 'test-' || i, 'https://example.com/', 'example.com',
      null, null, null, null, 'hash', 'agent');
  end loop;
  result := public.grader_create_report(secret, 'test-6', 'https://example.com/', 'example.com',
    null, null, null, null, 'hash', 'agent');
  if result->>'error' <> 'rate_limit' then raise exception 'IP rate limit not enforced'; end if;

  perform public.grader_update_report(secret, report_id, '{"status":"complete","final_url":"https://example.com/",
    "results":{"private":"hidden"},
    "ai_summary":{"headline":"Headline","top_issues":[{"title":"Title","why_it_matters":"Reason","fix":"Secret fix"}]}}');
  result := public.grader_get_report(secret, 'test-1');
  if result ? 'results' or result ? 'ai_summary' or result::text like '%Secret fix%' then
    raise exception 'Locked report leaked non-teaser fields';
  end if;
  if result->'top_issues'->0->>'title' <> 'Title' then raise exception 'Teaser missing issue title'; end if;
  result := public.grader_create_report(secret, 'test-cache', 'https://example.com/', 'example.com',
    null, null, null, null, 'different-hash', 'agent');
  next_report_id := (result->>'id')::uuid;
  result := public.grader_get_cache(secret, next_report_id, 'https://example.com/');
  if result->'results'->>'private' <> 'hidden' then raise exception 'Fresh cache was not returned'; end if;
  update public.grader_reports set completed_at = now() - interval '25 hours' where id = report_id;
  if public.grader_get_cache(secret, next_report_id, 'https://example.com/') is not null then
    raise exception 'Expired scan cache was returned';
  end if;
  update public.grader_reports set created_at = now() - interval '5 minutes' where id = next_report_id;
  result := public.grader_get_report(secret, 'test-cache');
  if result->>'status' <> 'failed' then raise exception 'Stale scan was not marked failed'; end if;

  for i in 1..30 loop
    result := public.grader_places_begin(secret, report_id, 'business-' || i);
    if result->>'call_id' is null then raise exception 'Places reservation unexpectedly failed'; end if;
  end loop;
  result := public.grader_places_begin(secret, report_id, 'business-31');
  if result->>'limited' <> 'true' then raise exception 'Places daily limit not enforced'; end if;
  begin
    update public.grader_config set places_monthly_limit = 901;
    raise exception 'Unsafe Places monthly ceiling was accepted';
  exception when check_violation then null;
  end;
  select id into call_id from public.grader_places_calls where business_key = 'business-1';
  perform public.grader_places_finish(secret, call_id, 'ok', 200, '{"places":[]}');
  result := public.grader_places_begin(secret, report_id, 'business-1');
  if not (result ? 'cached') then raise exception 'Places cache was not reused at the limit'; end if;

  delete from public.grader_places_calls;
  update public.grader_config set places_monthly_limit = 1;
  perform public.grader_places_begin(secret, report_id, 'month-1');
  result := public.grader_places_begin(secret, report_id, 'month-2');
  if result->>'limited' <> 'true' then raise exception 'Places monthly limit not enforced'; end if;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform * from public.grader_reports;
    raise exception 'Public table read was allowed';
  exception when insufficient_privilege then null;
  end;
  if public.grader_storage_authorized() then raise exception 'Unauthenticated storage upload allowed'; end if;
  begin
    insert into storage.objects (bucket_id, name) values ('grader-screenshots', 'unauthorized.png');
    raise exception 'Unauthenticated storage insert was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select set_config('request.headers', '{"x-grader-worker-secret":"test-grader-worker-secret-1234567890"}', true);
do $$
begin
  if not public.grader_storage_authorized() then raise exception 'Valid storage worker secret rejected'; end if;
  insert into storage.objects (bucket_id, name) values ('grader-screenshots', 'authorized.png');
end;
$$;
reset role;

rollback;
