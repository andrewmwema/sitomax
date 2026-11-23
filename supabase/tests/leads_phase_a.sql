-- Run only against an isolated test database with every migration applied.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000101', 'owner-a@example.test'),
  ('00000000-0000-4000-8000-000000000102', 'owner-b@example.test'),
  ('00000000-0000-4000-8000-000000000103', 'editor@example.test'),
  ('00000000-0000-4000-8000-000000000104', 'co-owner@example.test'),
  ('00000000-0000-4000-8000-000000000105', 'agency@example.test');
update public.profiles set is_super_admin = true where id = '00000000-0000-4000-8000-000000000105';
insert into public.accounts(id, name) values
  ('00000000-0000-4000-8000-000000000201', 'A'), ('00000000-0000-4000-8000-000000000202', 'B');
insert into public.account_members(account_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'owner'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 'owner'),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000103', 'editor'),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000104', 'owner');
insert into public.sites(id, account_id, subdomain) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 'leads-test-a'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', 'leads-test-b');
insert into public.lead_site_settings (site_id, webhook_url, webhook_secret) values
  ('00000000-0000-4000-8000-000000000301', 'https://catch.example.test', repeat('a',64));
insert into public.form_submissions(id, site_id, created_at, data, status) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000301', now() - interval '26 hours', '{"name":"Example"}', 'new'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000302', now(), '{}', 'new'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000301', now(), '{}', 'lost');
insert into public.lead_worker_config(secret_hash) values (encode(sha256(convert_to(repeat('w',32), 'UTF8')), 'hex'));

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000301';
  b uuid := '00000000-0000-4000-8000-000000000302';
  lead_a uuid := '00000000-0000-4000-8000-000000000401';
  lead_b uuid := '00000000-0000-4000-8000-000000000402';
  stats jsonb;
begin
  assert not exists (select from public.form_submissions where id = lead_b);
  assert not exists (select from public.lead_events where lead_id = lead_b);
  assert not public.can_manage_site_leads(b);
  begin
    insert into public.lead_site_settings (site_id, recipients) values (b, '{owner-a@example.test}');
    raise exception 'Owner A cannot set recipients for B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lead_notes(lead_id, site_id, body) values (lead_b, a, 'cross-tenant');
    raise exception 'A note must reference a lead on the same site';
  exception when foreign_key_violation then null;
  end;
  assert (public.lead_inbox_stats(a)->>'awaiting')::int = 1;
  update public.form_submissions set status = 'won' where id in (lead_a, lead_b);
  update public.form_submissions set status = 'won' where id = lead_a;
  update public.form_submissions set archived = true where id = lead_a;
  insert into public.lead_notes(lead_id, site_id, body) values (lead_a, a, 'owner note');
  insert into public.lead_notification_preferences(site_id, digest) values (a, true);
  stats := public.lead_inbox_stats(a);
  assert (stats->>'won_month')::int = 1 and (stats->>'won')::int = 1 and (stats->>'lost')::int = 1 and (stats->>'awaiting')::int = 0;
  assert (select count(*) from public.lead_events where lead_id = lead_a and type = 'status_changed') = 1;
  assert (select count(*) from public.lead_events where lead_id = lead_a and type = 'note_added') = 1;
  assert (select count(*) from public.lead_webhook_deliveries) = 3;
end;
$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
do $$
begin
  assert (select status from public.form_submissions where id = '00000000-0000-4000-8000-000000000402') = 'new';
  assert not exists (select from public.lead_notes);
  assert not exists (select from public.lead_site_settings);
  assert not exists (select from public.lead_webhook_deliveries);
end;
$$;

-- Since 0042 the inbox is shared by the whole account: editors read and triage
-- their account's leads. Settings, webhook logs and Trash stay with owners.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000301';
  lead_a uuid := '00000000-0000-4000-8000-000000000401';
begin
  assert (select count(*) from public.form_submissions) = 2
    and not exists (select from public.form_submissions where site_id <> a), 'Editors see only their account''s leads';
  assert exists (select from public.lead_events where lead_id = lead_a)
    and not exists (select from public.lead_events where site_id <> a);
  assert (select count(*) from public.lead_notes) = 1, 'Notes are shared with the team';
  assert public.lead_inbox_action('star', array[lead_a]) = 1, 'Editors share inbox state';
  assert not public.can_manage_site_leads(a);
  assert not exists (select from public.lead_site_settings), 'Webhook secrets stay with owners';
  assert not exists (select from public.lead_webhook_deliveries);
  begin
    perform public.lead_inbox_action('trash', array[lead_a]);
    raise exception 'Editors cannot move leads to Trash';
  exception when insufficient_privilege then null;
  end;
  assert (select deleted_at is null and starred from public.form_submissions where id = lead_a);
end;
$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000104',true);
do $$
begin
  assert (select count(*) from public.lead_notes) = 1;
  update public.lead_notes set body = 'not my note';
  assert not found;
  delete from public.lead_notes;
  assert not found;
  assert not exists (select from public.lead_notification_preferences);
end;
$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000105',true);
do $$
begin
  assert (select count(*) from public.form_submissions where site_id in (
    '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000302')) = 3;
end;
$$;

set local role anon;
do $$
declare
  job record;
  picked integer := 0;
begin
  begin
    perform public.lead_worker_claim_webhooks(repeat('x',32));
    raise exception 'A wrong worker secret must fail closed';
  exception when insufficient_privilege then null;
  end;
  assert not has_function_privilege('anon', 'public.claim_lead_webhooks(integer)', 'execute');
  for job in select * from public.lead_worker_claim_webhooks(repeat('w',32)) loop
    picked := picked + 1;
    assert job.attempts = 1 and job.payload->>'site_id' = '00000000-0000-4000-8000-000000000301';
    assert not public.lead_worker_finish_webhook(repeat('w',32), job.event_id, gen_random_uuid(), 204);
    assert public.lead_worker_finish_webhook(repeat('w',32), job.event_id, job.lease_id,
      case when job.payload->>'type' = 'lead.status_changed' then 503 else 204 end);
  end loop;
  assert picked = 3;
  assert not exists (select from public.lead_worker_claim_webhooks(repeat('w',32))), 'Immediate retries must not occur';
  assert (select count(*) from public.lead_worker_claim_digests(repeat('w',32)) where email = 'owner-a@example.test') = 1;
  assert not exists (select from public.lead_worker_claim_digests(repeat('w',32)));
end;
$$;

reset role;
do $$
begin
  assert (select count(*) from public.lead_webhook_deliveries where site_id = '00000000-0000-4000-8000-000000000301'
    and status = 'retrying' and next_attempt_at > now() and http_status = 503) = 1;
end;
$$;

rollback;
