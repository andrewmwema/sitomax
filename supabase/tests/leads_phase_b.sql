-- Run against an isolated database with migrations through 0035.
begin;

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000101', 'owner-a@example.test'),
  ('00000000-0000-4000-8000-000000000102', 'owner-b@example.test');
insert into public.accounts(id, name) values
  ('00000000-0000-4000-8000-000000000201', 'A'), ('00000000-0000-4000-8000-000000000202', 'B');
insert into public.account_members(account_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'owner'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102', 'owner');
insert into public.sites(id, account_id, subdomain) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000201', 'reply-test-a'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000202', 'reply-test-b');
insert into public.form_submissions(id, site_id, data) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000301', '{"Email":"lead-a@example.test","Name":"Test lead"}'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000302', '{"Email":"lead-b@example.test"}');
insert into public.lead_worker_config(secret_hash) values (encode(sha256(convert_to(repeat('w',32), 'UTF8')), 'hex'));
insert into public.lead_send_limits(account_id, daily_limit) values ('00000000-0000-4000-8000-000000000201', 1);
insert into public.lead_site_settings(site_id, webhook_url, webhook_secret) values
  ('00000000-0000-4000-8000-000000000301', 'https://catch.example.test', repeat('a',64));

set local role anon;
do $$
declare
  lead uuid := '00000000-0000-4000-8000-000000000401';
  owner_a uuid := '00000000-0000-4000-8000-000000000101';
  owner_b uuid := '00000000-0000-4000-8000-000000000102';
  request_id uuid := gen_random_uuid();
  w text := repeat('w',32);
  mid uuid;
  job record;
begin
  assert public.reserve_lead_reply(w, lead, owner_b, request_id, 'lead-a@example.test', 'leads@example.test', 'Hello', 'Reply', '<p>Reply</p>', 'tracked') = 'unavailable';
  assert public.reserve_lead_reply(w, lead, owner_a, request_id, 'other@example.test', 'leads@example.test', 'Hello', 'Reply', '<p>Reply</p>', 'tracked') = 'unavailable';
  assert public.reserve_lead_reply(w, lead, owner_a, request_id, 'lead-a@example.test', 'leads@example.test', 'Hello', 'Reply', '<p>Reply</p>', 'tracked') = 'reserved';
  assert public.reserve_lead_reply(w, lead, owner_a, request_id, 'lead-a@example.test', 'leads@example.test', 'Hello', 'Reply', '<p>Reply</p>', 'tracked') = 'duplicate';
  assert public.reserve_lead_reply(w, lead, owner_a, gen_random_uuid(), 'lead-a@example.test', 'leads@example.test', 'Hello', 'Reply', '<p>Reply</p>', 'tracked') = 'limited';
  assert public.finish_lead_reply(w, request_id, 'outbound-id', false);
  assert not public.finish_lead_reply(w, request_id, 'outbound-id', false);
  assert public.store_lead_inbound(w, lead, 'lead-b@example.test', 'signed@example.test', 'Re: Hello', 'Injected', '<p>Injected</p>', 'Full', 'bad-sender', null, false, false) is null;
  mid := public.store_lead_inbound(w, lead, 'lead-a@example.test', 'signed@example.test', 'Re: Hello', 'Excerpt', '<p>Excerpt</p>', 'Full reply', 'inbound-id', 'outbound-id', false, true);
  assert mid is not null;
  assert public.store_lead_inbound(w, lead, 'lead-a@example.test', 'signed@example.test', 'Re: Hello', 'Excerpt', '<p>Excerpt</p>', 'Full reply', 'inbound-id', null, false, true) is null;
  select * into strict job from public.claim_lead_reply_forwards(w, mid);
  assert job.recipient = 'owner-a@example.test' and job.lead_email = 'lead-a@example.test' and job.body_text = 'Full reply' and job.original_text = 'Reply';
  assert public.finish_lead_reply_forward(w, mid, job.lease_id, false);
  assert not exists (select from public.claim_lead_reply_forwards(w, mid)), 'Retry must not be immediate';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
do $$
begin
  assert not exists (select from public.lead_messages);
  assert not exists (select state from public.lead_reply_forwards);
  assert public.get_lead_reply_route('00000000-0000-4000-8000-000000000401') is null;
end;
$$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
do $$
declare
  lead uuid := '00000000-0000-4000-8000-000000000401';
  site uuid := '00000000-0000-4000-8000-000000000301';
begin
  assert (select count(*) from public.lead_messages where lead_id = lead) = 2;
  assert (select state from public.lead_reply_forwards) = 'retrying';
  assert exists (select from public.form_submissions where id = lead and has_unread_reply and status = 'contacted');
  assert (select count(*) from public.lead_events where lead_id = lead and type in ('email_sent', 'reply_received')) = 2;
  assert exists (select from public.lead_webhook_deliveries where site_id = site and event_type = 'lead.reply_received');
  update public.lead_site_settings set reply_mode = 'direct' where site_id = site;
  assert public.get_lead_reply_route(lead)->>'mode' = 'direct';
  assert public.get_lead_reply_route(lead)->>'direct_to' = 'owner-a@example.test';
end;
$$;

rollback;
