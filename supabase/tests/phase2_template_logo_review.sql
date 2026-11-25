-- REVIEW ONLY. Obtain separate approval before running, after 0054-0057,
-- 0059 and 0061 and the Phase 2 fixtures. This rolls back all TEST writes,
-- including a TEST storage metadata row. It does not upload a file or call AI.
begin;

do $$
declare
  fixture_account constant uuid := '64000000-0000-4000-8000-000000000001';
  client_id uuid;
  generation uuid;
  fixture_business jsonb;
  result jsonb;
  fixture_site_id uuid;
  logo_path text;
  logo_url text;
  initial_theme jsonb;
  initial_header jsonb;
  target_header jsonb;
  edited_header jsonb;
  version_count integer;
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
  if has_function_privilege('authenticated',
    'public.checkpoint_ai_template_logo(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb)', 'execute') then
    raise exception 'The logo checkpoint must not be callable by authenticated clients.';
  end if;
  select business into strict fixture_business from public.site_templates where id = 'showcase' and is_active;
  update public.ai_limits set extra_credits = 50 where account_id = fixture_account;
  if not found then raise exception 'The TEST fixture has no limits.'; end if;
  perform set_config('request.jwt.claim.sub', client_id::text, true);
  generation := public.begin_ai_template_build(client_id, fixture_account, 'TEST-model');
  result := public.create_ai_template_site(fixture_account, generation, 'showcase',
    'TEST-PHASE2-Logo', 'test-phase2-logo', 'UTC', fixture_business);
  fixture_site_id := (result->>'siteId')::uuid;
  perform public.complete_ai_template_checkpoints(client_id, generation);
  select coalesce(draft_theme, theme, '{}'::jsonb), draft_header into strict initial_theme, initial_header
    from public.sites where id = fixture_site_id;
  if initial_header is null or jsonb_typeof(initial_header->'logo') is distinct from 'object' then
    raise exception 'The TEST template needs a draft header with a logo.';
  end if;
  logo_path := fixture_site_id::text || '/TEST-logo.png';
  logo_url := 'https://example.test/storage/v1/object/public/site-assets/' || logo_path;
  target_header := jsonb_set(jsonb_set(initial_header, '{logo,mode}', '"image"'::jsonb, true),
    '{logo,image}', to_jsonb(logo_url), true);
  select count(*) into version_count from public.site_draft_versions where site_id = fixture_site_id;
  begin
    perform public.checkpoint_ai_template_logo(gen_random_uuid(), fixture_account, fixture_site_id, generation,
      logo_path, logo_url, 'TEST logo', initial_theme, initial_header, target_header);
    raise exception 'An unauthorized user was accepted.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.checkpoint_ai_template_logo(client_id, fixture_account, fixture_site_id, generation,
      logo_path, logo_url, 'TEST logo', initial_theme, initial_header, target_header);
    raise exception 'A missing upload was accepted.';
  exception when invalid_parameter_value then null;
  end;
  insert into storage.objects(bucket_id, name) values ('site-assets', logo_path);
  edited_header := jsonb_set(jsonb_set(initial_header, '{logo,mode}', '"image"'::jsonb, true),
    '{logo,image}', '"https://example.test/TEST-existing.png"'::jsonb, true);
  update public.sites set draft_header = edited_header where id = fixture_site_id;
  begin
    perform public.checkpoint_ai_template_logo(client_id, fixture_account, fixture_site_id, generation,
      logo_path, logo_url, 'TEST logo', initial_theme, edited_header, target_header);
    raise exception 'A newer logo was overwritten.';
  exception when serialization_failure then null;
  end;
  update public.sites set draft_header = initial_header where id = fixture_site_id;
  begin
    perform public.checkpoint_ai_template_logo(client_id, fixture_account, fixture_site_id, generation,
      logo_path, logo_url, 'TEST logo', '{}'::jsonb, initial_header, target_header);
    raise exception 'A stale theme was accepted.';
  exception when serialization_failure then null;
  end;
  perform public.checkpoint_ai_template_logo(client_id, fixture_account, fixture_site_id, generation,
    logo_path, logo_url, 'TEST logo', initial_theme, initial_header, target_header);
  if not exists (select 1 from public.sites where id = fixture_site_id and draft_header = target_header
      and draft_theme->>'logoUrl' = logo_url and draft_theme->>'logoAlt' = 'TEST logo'
      and theme = initial_theme and published_header is null)
    or (select count(*) from public.site_draft_versions where site_id = fixture_site_id) <> version_count + 1
    or not exists (select 1 from public.site_draft_versions where site_id = fixture_site_id
      and header = initial_header and theme = initial_theme and header_captured)
    or exists (select 1 from public.pages where site_id = fixture_site_id and published_data is not null) then
    raise exception 'Logo application failed to preserve the published state and reversible draft snapshot.';
  end if;
end;
$$;

rollback;
