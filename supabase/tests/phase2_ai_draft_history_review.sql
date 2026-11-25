-- REVIEW ONLY. Obtain separate approval before running, after 0054-0057 and
-- the Phase 2 fixtures. This rolls back all TEST-account writes; no AI calls.
begin;

do $$
declare
  fixture_account constant uuid := '64000000-0000-4000-8000-000000000001';
  client_id uuid;
  fixture_site uuid;
  fixture_page uuid;
  backup_id uuid;
  undo_id uuid;
  initial_draft jsonb;
  initial_published jsonb;
  initial_header jsonb;
  changed_header jsonb;
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
    'TEST-PHASE2-History', 'test-phase2-history', 'UTC');
  select id, draft_data, published_data into strict fixture_page, initial_draft, initial_published
    from public.pages where site_id = fixture_site and sort_order = 0;
  select draft_header into strict initial_header from public.sites where id = fixture_site;
  if initial_header is null then raise exception 'The TEST template needs a draft header.'; end if;
  changed_header := jsonb_set(initial_header, '{logo,text}', '"TEST-Changed"'::jsonb);
  update public.pages set ai_pending_build = true where id = fixture_page;
  insert into public.site_draft_versions(site_id, pages, theme)
    select fixture_site, jsonb_agg(jsonb_build_object('id', id, 'draft_data', draft_data)),
      (select coalesce(draft_theme, theme) from public.sites where id = fixture_site)
    from public.pages where site_id = fixture_site returning id into backup_id;
  update public.sites set draft_header = changed_header where id = fixture_site;
  update public.pages set draft_data = '{"content":[],"root":{}}', ai_pending_build = false where id = fixture_page;
  perform public.restore_ai_draft_version(fixture_site, backup_id);
  if not exists (select 1 from public.pages where id = fixture_page and draft_data = initial_draft
      and published_data is not distinct from initial_published and ai_pending_build)
    or (select draft_header from public.sites where id = fixture_site) is distinct from initial_header then
    raise exception 'Restore did not restore the draft, pending flag and header without changing published data.';
  end if;
  select id into strict undo_id from public.site_draft_versions
    where site_id = fixture_site and id <> backup_id;
  perform public.restore_ai_draft_version(fixture_site, undo_id);
  if not exists (select 1 from public.pages where id = fixture_page
      and draft_data = '{"content":[],"root":{}}'::jsonb and not ai_pending_build
      and published_data is not distinct from initial_published)
    or (select draft_header from public.sites where id = fixture_site) is distinct from changed_header then
    raise exception 'Restoring the pre-restore snapshot did not undo the restore.';
  end if;

  update public.sites set draft_header = null where id = fixture_site;
  insert into public.site_draft_versions(site_id, pages, theme)
    select fixture_site, jsonb_agg(jsonb_build_object('id', id, 'draft_data', draft_data)),
      (select coalesce(draft_theme, theme) from public.sites where id = fixture_site)
    from public.pages where site_id = fixture_site returning id into backup_id;
  update public.sites set draft_header = changed_header where id = fixture_site;
  perform public.restore_ai_draft_version(fixture_site, backup_id);
  if (select draft_header from public.sites where id = fixture_site) is not null then
    raise exception 'A captured null header was not restored.';
  end if;
end;
$$;

rollback;
