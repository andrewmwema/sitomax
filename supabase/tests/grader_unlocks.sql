begin;

update public.grader_config set secret_hash = encode(sha256(convert_to('test-grader-worker-secret-1234567890', 'UTF8')), 'hex');
insert into public.accounts(id, name) values ('01000000-0000-4000-8000-000000000001', 'Grader account');
insert into public.sites(id, account_id, name, subdomain) values
  ('02000000-0000-4000-8000-000000000001', '01000000-0000-4000-8000-000000000001', 'Grader site', 'grader-test');
insert into public.grader_reports(id, slug, url_input, domain, status, scores, ai_summary, ip_hash) values
  ('03000000-0000-4000-8000-000000000001', 'grader-first', 'https://example.com/', 'example.com', 'complete',
   '{"overall":70}', '{"top_issues":[{"title":"Improve speed"}]}', 'hash'),
  ('03000000-0000-4000-8000-000000000002', 'grader-second', 'https://example.com/', 'example.com', 'complete',
   '{"overall":71}', '{"top_issues":[{"title":"Improve mobile"}]}', 'hash');

do $$
declare
  secret constant text := 'test-grader-worker-secret-1234567890';
  account constant uuid := '01000000-0000-4000-8000-000000000001';
  site constant uuid := '02000000-0000-4000-8000-000000000001';
  result jsonb;
  lead uuid;
  job jsonb;
begin
  result := public.grader_unlock_report(secret, 'grader-first', 'Test', 'TEST@example.com', null, false,
    repeat('a', 64), 'https://sitomax.com/grader/grader-first', account, site);
  if result->>'ok' <> 'true' then raise exception 'Unlock failed: %', result; end if;
  select id into strict lead from public.form_submissions where site_id = site;
  if (select count(*) from public.lead_events where lead_id = lead and type in ('created', 'note_added')) <> 2 then
    raise exception 'Lead events missing';
  end if;
  if not exists (select 1 from public.lead_notes where lead_id = lead and body like '%Improve speed%') then
    raise exception 'Report details missing';
  end if;
  update public.form_submissions set status = 'contacted' where id = lead;
  perform public.grader_unlock_report(secret, 'grader-second', 'Test', 'test@example.com', null, true,
    repeat('a', 64), 'https://sitomax.com/grader/grader-second', account, site);
  perform public.grader_unlock_report(secret, 'grader-second', 'Test', 'test@example.com', null, true,
    repeat('a', 64), 'https://sitomax.com/grader/grader-second', account, site);
  if (select count(*) from public.form_submissions where site_id = site) <> 1
    or (select status from public.form_submissions where id = lead) <> 'contacted'
    or (select count(*) from public.grader_unlocks) <> 2
    or (select count(*) from public.grader_notifications) <> 2 then
    raise exception 'Deduplication, status preservation or idempotency failed';
  end if;
  if (select count(*) from public.lead_notes where lead_id = lead) <> 2 then
    raise exception 'Second report not attached to existing lead';
  end if;
  result := public.grader_claim_notifications(secret);
  if jsonb_array_length(result) <> 2 then raise exception 'Notifications not claimed'; end if;
  job := result->0;
  if not public.grader_finish_notification(secret, (job->>'id')::uuid, (job->>'lease_id')::uuid, false) then
    raise exception 'Notification failure not recorded';
  end if;
  if not exists (select 1 from public.grader_notifications where id = (job->>'id')::uuid
      and status = 'pending' and attempts = 1 and next_attempt_at > now()) then
    raise exception 'Notification retry not scheduled';
  end if;
  begin
    perform public.grader_unlock_report('wrong', 'grader-first', 'Test', 'test@example.com', null, false,
      repeat('a', 64), 'https://sitomax.com/grader/grader-first', account, site);
    raise exception 'Wrong secret accepted';
  exception when insufficient_privilege then null;
  end;
  for i in 1..7 loop
    perform public.grader_unlock_report(secret, 'grader-first', 'Test', 'test@example.com', null, false,
      repeat('a', 64), 'https://sitomax.com/grader/grader-first', account, site);
  end loop;
  result := public.grader_unlock_report(secret, 'grader-first', 'Test', 'test@example.com', null, false,
    repeat('a', 64), 'https://sitomax.com/grader/grader-first', account, site);
  if result->>'error' <> 'rate_limit' then raise exception 'Unlock rate limit not enforced'; end if;
  begin
    perform public.grader_unlock_report(secret, 'grader-first', 'Test', 'test@example.com', null, false,
      repeat('b', 64), 'https://sitomax.com/grader/grader-first', gen_random_uuid(), site);
    raise exception 'Mismatched destination accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform * from public.grader_notifications;
    raise exception 'Anonymous notification read allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
rollback;
