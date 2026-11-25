-- REVIEW ONLY. Obtain separate approval before running, after 0058 and the
-- Phase 2 fixtures. This rolls back all TEST-account writes; no AI calls.
begin;

do $$
declare
  fixture_account constant uuid := '64000000-0000-4000-8000-000000000001';
  client_id uuid;
  fixture_site uuid;
  fixture_page uuid;
  old_published jsonb;
  baseline constant jsonb := '{"root":{"props":{"title":"TEST-Empty"}},"content":[]}'::jsonb;
  generated constant jsonb := '{"root":{"props":{"title":"TEST-Empty"}},"content":[{"type":"Section","props":{"id":"TEST-section"}}]}'::jsonb;
  version_count integer;
begin
  select p.id into strict client_id from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com')
      and lower(p.email) = lower(u.email) and not p.is_super_admin;
  if not exists (select 1 from public.accounts a
    join public.account_members m on m.account_id = a.id and m.user_id = client_id and m.role = 'owner'
    where a.id = fixture_account and a.name = 'TEST-PHASE2-Showcase-Client' and not a.is_internal)
    or exists (select 1 from public.sites where account_id = fixture_account) then
    raise exception 'The TEST fixture must exist and have no sites.';
  end if;
  perform set_config('request.jwt.claim.sub', client_id::text, true);
  fixture_site := public.create_site_from_template(fixture_account, 'showcase',
    'TEST-PHASE2-Empty-History', 'test-phase2-empty-history', 'UTC');
  select id, published_data into strict fixture_page, old_published
    from public.pages where site_id = fixture_site and sort_order = 0;
  update public.pages set draft_data = baseline where id = fixture_page;
  select count(*) into version_count from public.page_versions where page_id = fixture_page;
  perform public.save_ai_empty_page(fixture_page, baseline, generated);
  if not exists (select 1 from public.pages where id = fixture_page and draft_data = generated
      and published_data is not distinct from old_published)
    or (select count(*) from public.page_versions where page_id = fixture_page) <> version_count + 2
    or not exists (select 1 from public.page_versions where page_id = fixture_page and kind = 'ai_edit' and data = baseline)
    or not exists (select 1 from public.page_versions where page_id = fixture_page and kind = 'ai_edit' and data = generated) then
    raise exception 'The AI save did not preserve the old and new drafts without changing published content.';
  end if;

  begin
    perform public.save_ai_empty_page(fixture_page, baseline, generated);
    raise exception 'A changed draft was accepted.';
  exception when serialization_failure then null;
  end;
  if (select count(*) from public.page_versions where page_id = fixture_page) <> version_count + 2 then
    raise exception 'A conflicting save created history.';
  end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.save_ai_empty_page(fixture_page, baseline, generated);
    raise exception 'An unauthorized user was accepted.';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
