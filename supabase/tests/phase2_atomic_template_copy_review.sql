-- REVIEW ONLY. Obtain separate approval before running, after 0054-0057,
-- 0059 and the Phase 2 fixtures. Rolls back all TEST writes; no AI calls.
begin;

do $$
declare
  fixture_account constant uuid := '64000000-0000-4000-8000-000000000001';
  client_id uuid;
  generation uuid;
  page_count integer;
  original_template jsonb;
  fixture_business jsonb;
  result jsonb;
  fixture_site_id uuid;
begin
  select p.id into strict client_id from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com')
      and lower(p.email) = lower(u.email) and not p.is_super_admin;
  if not exists (select 1 from public.accounts a
    join public.account_members m on m.account_id = a.id and m.user_id = client_id and m.role = 'owner'
    where a.id = fixture_account and a.name = 'TEST-PHASE2-Showcase-Client'
      and a.site_plan_key = 'starter' and not a.is_internal)
    or exists (select 1 from public.sites where account_id = fixture_account)
    or exists (select 1 from public.ai_requests where account_id = fixture_account) then
    raise exception 'The TEST fixture must exist and have no sites or AI requests.';
  end if;
  select to_jsonb(t), t.business into strict original_template, fixture_business
    from public.site_templates t where t.id = 'showcase' and t.is_active;
  update public.ai_limits set extra_credits = 50 where account_id = fixture_account;
  if not found then raise exception 'The TEST fixture has no limits.'; end if;
  perform set_config('request.jwt.claim.sub', client_id::text, true);
  generation := public.begin_ai_template_build(client_id, fixture_account, 'TEST-model');
  page_count := jsonb_array_length(original_template->'pages');

  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.create_ai_template_site(fixture_account, generation, 'showcase',
      'TEST-PHASE2-Atomic', 'test-phase2-atomic', 'UTC', fixture_business);
    raise exception 'An unauthorized user was accepted.';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', client_id::text, true);
  begin
    perform public.create_ai_template_site(fixture_account, generation, 'showcase',
      'TEST-PHASE2-Atomic', 'test-phase2-atomic', 'TEST-invalid-timezone', fixture_business);
    raise exception 'An invalid timezone was accepted.';
  exception when invalid_parameter_value then null;
  end;
  if exists (select 1 from public.sites where account_id = fixture_account)
    or exists (select 1 from public.ai_requests where id = generation and (site_id is not null or checkpoint_open))
    or exists (select 1 from public.ai_requests where id = generation and template_page_surcharge <> 0)
    or exists (select 1 from public.ai_template_builds where generation_id = generation and template_id is not null)
    or not exists (select 1 from public.ai_limits where account_id = fixture_account and extra_credits = 50)
    or exists (select 1 from public.ai_page_retries where generation_id = generation) then
    raise exception 'Failed copy left a selection, surcharge, site or checkpoints behind.';
  end if;

  result := public.create_ai_template_site(fixture_account, generation, 'showcase',
    'TEST-PHASE2-Atomic', 'test-phase2-atomic', 'UTC', fixture_business);
  fixture_site_id := (result->>'siteId')::uuid;
  if not exists (select 1 from public.sites where id = fixture_site_id and account_id = fixture_account and business = fixture_business)
    or not exists (select 1 from public.ai_requests where id = generation and ai_requests.site_id = fixture_site_id and checkpoint_open)
    or (select count(*) from public.ai_page_retries where generation_id = generation) <> page_count
    or jsonb_array_length(result->'pages') <> page_count
    or (select count(*) from public.pages where pages.site_id = fixture_site_id and ai_pending_build and published_data is null) <> page_count
    or not exists (select 1 from public.pages where id = (result->>'editorPageId')::uuid and pages.site_id = fixture_site_id and sort_order = 0)
    or original_template is distinct from (select to_jsonb(t) from public.site_templates t where t.id = 'showcase') then
    raise exception 'Atomic copy did not preserve the master or prepare all unpublished checkpoints.';
  end if;
end;
$$;

rollback;
