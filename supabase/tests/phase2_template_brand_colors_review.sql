-- REVIEW ONLY. Obtain separate approval before running, after 0054-0057,
-- 0059-0060 and the Phase 2 fixtures. Rolls back all TEST writes; no AI calls.
begin;

do $$
declare
  fixture_account constant uuid := '64000000-0000-4000-8000-000000000001';
  client_id uuid;
  generation uuid;
  fixture_business jsonb;
  master_theme jsonb;
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
  select business, theme into strict fixture_business, master_theme
    from public.site_templates where id = 'showcase' and is_active;
  update public.ai_limits set extra_credits = 50 where account_id = fixture_account;
  if not found then raise exception 'The TEST fixture has no limits.'; end if;
  perform set_config('request.jwt.claim.sub', client_id::text, true);
  generation := public.begin_ai_template_build(client_id, fixture_account, 'TEST-model');
  begin
    perform public.create_ai_template_site_with_colors(fixture_account, generation, 'showcase',
      'TEST-PHASE2-Colors', 'test-phase2-colors', 'UTC', fixture_business, 'invalid', null);
    raise exception 'Invalid colors were accepted.';
  exception when invalid_parameter_value then null;
  end;
  if exists (select 1 from public.sites where account_id = fixture_account)
    or exists (select 1 from public.ai_template_builds where generation_id = generation and template_id is not null) then
    raise exception 'Invalid colors left a site or selection behind.';
  end if;
  result := public.create_ai_template_site_with_colors(fixture_account, generation, 'showcase',
    'TEST-PHASE2-Colors', 'test-phase2-colors', 'UTC', fixture_business, '#123456', '#abcdef');
  fixture_site_id := (result->>'siteId')::uuid;
  if not exists (select 1 from public.sites where id = fixture_site_id and theme = master_theme
      and draft_theme#>>'{colors,primary}' = '#123456'
      and draft_theme#>>'{colors,secondary}' = '#abcdef')
    or not exists (select 1 from public.site_draft_versions where site_id = fixture_site_id and theme = master_theme)
    or not exists (select 1 from public.site_templates where id = 'showcase' and theme = master_theme)
    or exists (select 1 from public.pages where site_id = fixture_site_id and published_data is not null) then
    raise exception 'Colors must affect only the copied draft, preserving its original theme history and master.';
  end if;
end;
$$;

rollback;
