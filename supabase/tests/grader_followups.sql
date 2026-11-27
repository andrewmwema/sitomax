begin;

update public.grader_config set secret_hash = encode(sha256(convert_to('test-grader-worker-secret-1234567890', 'UTF8')), 'hex');
insert into public.accounts(id, name) values ('11000000-0000-4000-8000-000000000001', 'Follow-up account');
insert into public.sites(id, account_id, name, subdomain) values
  ('12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Follow-up site', 'followup-test');

do $$
declare
  secret constant text := 'test-grader-worker-secret-1234567890';
  account constant uuid := '11000000-0000-4000-8000-000000000001';
  site constant uuid := '12000000-0000-4000-8000-000000000001';
  result jsonb;
  job jsonb;
  unsubscribe_id uuid;
  lead uuid;
  i integer;
begin
  for i in 1..5 loop
    insert into public.grader_reports(slug, url_input, domain, status, ip_hash)
      values ('followup-' || i, 'https://example.com/', 'example.com', 'complete', 'hash');
    perform public.grader_unlock_report(secret, 'followup-' || i, 'Test', 'followup-' || i || '@example.com', null,
      i <> 5, repeat('a', 64), 'https://sitomax.com/grader/followup-' || i, account, site);
  end loop;
  if (select count(*) from public.grader_followups) <> 12 then raise exception 'Consent did not control scheduling'; end if;
  update public.grader_followups set next_attempt_at = now() - interval '1 minute';
  update public.grader_report_mail set status = 'sent', sent_at = now();

  insert into auth.users(id, email) values (gen_random_uuid(), 'FOLLOWUP-1@example.com');
  select n.lead_id into lead from public.grader_notifications n join public.grader_unlocks u on u.id = n.unlock_id
    where u.email = 'followup-2@example.com';
  update public.form_submissions set status = 'contacted' where id = lead;
  update public.form_submissions set status = 'new' where id = lead;
  select u.id into unsubscribe_id from public.grader_unlocks u where u.email = 'followup-3@example.com';
  if not public.grader_unsubscribe(secret, unsubscribe_id) then raise exception 'Unsubscribe failed'; end if;

  result := public.grader_claim_followups(secret);
  if jsonb_array_length(result) <> 1 or result->0->>'email' <> 'followup-4@example.com'
    or (result->0->>'day')::integer <> 2 then
    raise exception 'Suppression or sequencing failed: %', result;
  end if;
  if (select count(*) from public.grader_followups where status = 'suppressed') <> 9 then
    raise exception 'Suppression did not stop all ineligible sequences';
  end if;
  job := result->0;
  if not public.grader_check_followup(secret, (job->>'unlock_id')::uuid, 2, (job->>'lease_id')::uuid) then
    raise exception 'Eligible follow-up rejected';
  end if;
  perform public.grader_unsubscribe(secret, (job->>'unlock_id')::uuid);
  if public.grader_check_followup(secret, (job->>'unlock_id')::uuid, 2, (job->>'lease_id')::uuid) then
    raise exception 'Unsubscribed follow-up still eligible';
  end if;
  if (select count(*) from public.grader_followups where status = 'suppressed') <> 12 then
    raise exception 'Unsubscribe did not cancel sequence';
  end if;
  begin
    perform public.grader_claim_followups('wrong');
    raise exception 'Wrong worker secret accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform * from public.grader_unsubscribes;
    raise exception 'Anonymous suppression read allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
rollback;
