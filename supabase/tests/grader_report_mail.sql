begin;

update public.grader_config set secret_hash = encode(sha256(convert_to('test-grader-worker-secret-1234567890', 'UTF8')), 'hex');
insert into public.grader_reports(id, slug, url_input, domain, status, unlocked, ip_hash)
  values ('03000000-0000-4000-8000-000000000003', 'report-mail-test', 'https://example.com/', 'example.com', 'complete', true, 'hash');
insert into public.grader_unlocks(id, report_id, name, email, consent_marketing)
  values ('04000000-0000-4000-8000-000000000001', '03000000-0000-4000-8000-000000000003', 'Test', 'test@example.com', false);

do $$
declare
  secret constant text := 'test-grader-worker-secret-1234567890';
  jobs jsonb;
  job jsonb;
begin
  if not exists (select 1 from public.grader_report_mail where unlock_id = '04000000-0000-4000-8000-000000000001' and status = 'pending') then
    raise exception 'Transactional report email not queued';
  end if;
  jobs := public.grader_claim_report_mail(secret);
  if jsonb_array_length(jobs) <> 1 then raise exception 'Report email not claimed'; end if;
  job := jobs->0;
  if job->>'email' <> 'test@example.com' or job->>'slug' <> 'report-mail-test' then raise exception 'Incorrect report job'; end if;
  if public.grader_finish_report_mail(secret, (job->>'unlock_id')::uuid, gen_random_uuid(), true) then
    raise exception 'Invalid lease accepted';
  end if;
  if not public.grader_finish_report_mail(secret, (job->>'unlock_id')::uuid, (job->>'lease_id')::uuid, false) then
    raise exception 'Delivery failure not recorded';
  end if;
  if not exists (select 1 from public.grader_report_mail where unlock_id = (job->>'unlock_id')::uuid
      and status = 'pending' and attempts = 1 and next_attempt_at > now()) then
    raise exception 'Delivery retry not scheduled';
  end if;
  begin
    perform public.grader_claim_report_mail('wrong');
    raise exception 'Wrong secret accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local role anon;
do $$
begin
  begin
    perform * from public.grader_report_mail;
    raise exception 'Anonymous report mail read allowed';
  exception when insufficient_privilege then null;
  end;
  if exists (select from storage.objects where bucket_id = 'grader-reports') then
    raise exception 'Anonymous report storage read allowed';
  end if;
end;
$$;
reset role;
rollback;
