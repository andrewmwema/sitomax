-- Run against an isolated database with all migrations applied. Fixtures roll back.
begin;
do $$
<<test>>
declare
  owner_id uuid := '11800000-0000-4000-8000-000000000001';
  stranger_id uuid := '11800000-0000-4000-8000-000000000002';
  account_id uuid := '21800000-0000-4000-8000-000000000001';
  site_id uuid := '31800000-0000-4000-8000-000000000001';
  page_id uuid := '41800000-0000-4000-8000-000000000001';
  header jsonb := '{"version":1,"logo":{"text":"Original"}}';
  new_header jsonb := '{"version":1,"logo":{"text":"New"}}';
  theme jsonb := '{"style":"classic"}';
  body jsonb := '{"root":{"props":{}},"content":[]}';
  input jsonb;
  version uuid;
  result uuid;
  site_tuple tid;
  page_tuple tid;
  backup_id uuid;
  history_count bigint;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (owner_id, 'contention-owner@example.test', '{}'), (stranger_id, 'contention-stranger@example.test', '{}');
  insert into public.accounts(id, name) values (account_id, 'Contention test');
  insert into public.account_members values (account_id, owner_id, 'owner');
  insert into public.sites(id, account_id, subdomain, theme, draft_theme, draft_header)
    values (site_id, account_id, 'editor-contention-test', theme, theme, header);
  insert into public.pages(id, site_id, slug, title, draft_data)
    values (page_id, site_id, '', 'Home', body);
  select draft_version, ctid into version, page_tuple from public.pages where id = page_id;
  select ctid into site_tuple from public.sites where id = site_id;
  input := jsonb_set(jsonb_set(body, '{root,props,__expectedPageVersion}', to_jsonb(version::text), true),
    '{root,props,__nextPageVersion}', to_jsonb(gen_random_uuid()::text), true);

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  result := public.save_page_with_header(page_id, input, header, header, false, null, null, false, theme, theme);
  if result is distinct from version then raise exception 'No-op returned a new version'; end if;
  result := public.save_editor_ai_draft(page_id, input, theme, false, theme);
  if result is distinct from version then raise exception 'AI no-op returned a new version'; end if;
  execute 'reset role';
  if (select ctid from public.pages where id = page_id) is distinct from page_tuple
    or (select ctid from public.sites where id = site_id) is distinct from site_tuple then
    raise exception 'No-op wrote a page or site tuple';
  end if;

  execute 'set local role authenticated';
  -- A missing baseline is valid when the supplied header is unchanged.
  result := public.save_page_with_header(page_id, input, header, null);
  if result is distinct from version then raise exception 'Null baseline no-op changed the version'; end if;
  result := public.save_page_with_header(page_id, input, null, null);
  if result is distinct from version then raise exception 'Null header no-op changed the version'; end if;
  result := public.save_page_with_header(page_id, input, null, header);
  if result is distinct from version then raise exception 'Null header with baseline changed the version'; end if;
  execute 'reset role';
  if (select ctid from public.pages where id = page_id) is distinct from page_tuple
    or (select ctid from public.sites where id = site_id) is distinct from site_tuple then
    raise exception 'Null header or baseline no-op wrote a tuple';
  end if;

  execute 'set local role authenticated';
  begin
    perform public.save_page_with_header(page_id,
      jsonb_set(input, '{root,props,__expectedPageVersion}', to_jsonb(gen_random_uuid()::text)),
      header, header);
    raise exception 'Expected stale page conflict';
  exception when serialization_failure then null; end;
  begin
    perform public.save_page_with_header(page_id,
      jsonb_set(input, '{root,props,__expectedPageVersion}', to_jsonb(gen_random_uuid()::text)),
      new_header, header);
    raise exception 'Expected stale page conflict after header update';
  exception when serialization_failure then null; end;
  if (select draft_header from public.sites where id = site_id) is distinct from header then
    raise exception 'Stale page save did not roll back its header update';
  end if;
  begin
    perform public.save_editor_ai_draft(page_id,
      jsonb_set(input, '{root,props,__expectedPageVersion}', to_jsonb(gen_random_uuid()::text)));
    raise exception 'Expected stale AI page conflict';
  exception when serialization_failure then null; end;
  begin
    perform public.save_page_with_header(page_id, input, new_header, null);
    raise exception 'Expected header conflict';
  exception when serialization_failure then null; end;
  begin
    perform public.save_page_with_header(page_id, input, header, header, false, null, null, false,
      '{"style":"new"}', '{"style":"stale"}');
    raise exception 'Expected theme conflict';
  exception when serialization_failure then null; end;

  -- A real body edit uses the requested token, but leaves the site untouched.
  input := jsonb_set(input, '{content}', '[{"type":"Text","props":{"text":"Edited"}}]');
  result := public.save_page_with_header(page_id, input, header, header);
  if result is distinct from (input#>>'{root,props,__nextPageVersion}')::uuid then
    raise exception 'Changed draft did not return the stored replacement version';
  end if;
  execute 'reset role';
  if (select ctid from public.sites where id = site_id) is distinct from site_tuple then
    raise exception 'Body-only edit wrote a site tuple';
  end if;
  if (select draft_data#>'{root,props,__expectedPageVersion}' from public.pages where id = page_id) is not null
    or (select draft_data#>'{root,props,__nextPageVersion}' from public.pages where id = page_id) is not null
    or (select draft_version from public.pages where id = page_id) is distinct from result then
    raise exception 'Version token persisted in draft';
  end if;

  select ctid into page_tuple from public.pages where id = page_id;
  input := jsonb_set(input, '{root,props,__expectedPageVersion}', to_jsonb(result::text));
  execute 'set local role authenticated';
  result := public.save_page_with_header(page_id, input, new_header, header);
  execute 'reset role';
  if (select draft_header from public.sites where id = site_id) is distinct from new_header
    or (select ctid from public.sites where id = site_id) is not distinct from site_tuple
    or (select ctid from public.pages where id = page_id) is distinct from page_tuple then
    raise exception 'Header-only save did not update just the site';
  end if;
  if not exists (select 1 from public.page_versions pv where pv.page_id = test.page_id
    and pv.kind = 'header_edit' and pv.header = new_header) then
    raise exception 'Header edit history missing';
  end if;
  header := new_header;
  select ctid into site_tuple from public.sites where id = site_id;
  execute 'set local role authenticated';
  input := jsonb_set(input, '{content}', '[{"type":"Text","props":{"text":"Null header body edit"}}]');
  input := jsonb_set(input, '{root,props,__nextPageVersion}', to_jsonb(gen_random_uuid()::text));
  result := public.save_page_with_header(page_id, input, null, null);
  execute 'reset role';
  if (select draft_header from public.sites where id = site_id) is distinct from header
    or (select ctid from public.sites where id = site_id) is distinct from site_tuple
    or result is distinct from (input#>>'{root,props,__nextPageVersion}')::uuid then
    raise exception 'Null header body save changed the site or lost its page version';
  end if;
  input := jsonb_set(input, '{root,props,__expectedPageVersion}', to_jsonb(result::text));
  execute 'set local role authenticated';
  result := public.save_page_with_header(page_id, input, null, null, false, null, null, true,
    '{"style":"modern"}', theme);
  execute 'reset role';
  if (select draft_header from public.sites where id = site_id) is distinct from header
    or (select draft_theme from public.sites where id = site_id) is distinct from '{"style":"modern"}'::jsonb
    or not exists (select 1 from public.page_versions pv where pv.page_id = test.page_id
      and pv.kind = 'ai_edit' and pv.header = test.header and pv.theme = '{"style":"modern"}'::jsonb) then
    raise exception 'Null header theme/snapshot save lost the header';
  end if;
  theme := '{"style":"modern"}';

  select ctid into site_tuple from public.sites where id = site_id;
  select ctid into page_tuple from public.pages where id = page_id;
  execute 'set local role authenticated';
  result := public.save_page_with_header(page_id, input, header, null);
  execute 'reset role';
  if (select ctid from public.pages where id = page_id) is distinct from page_tuple
    or (select ctid from public.sites where id = site_id) is distinct from site_tuple then
    raise exception 'Repeat save after version-token write was not a no-op';
  end if;

  -- An intentional snapshot remains available even when the body is unchanged.
  input := jsonb_set(input, '{root,props,__expectedPageVersion}', to_jsonb(result::text));
  execute 'set local role authenticated';
  if public.save_editor_ai_draft(page_id, input, null, true) is distinct from result then
    raise exception 'Snapshot no-op returned a new version';
  end if;
  execute 'reset role';
  if not exists (select 1 from public.page_versions pv where pv.page_id = test.page_id and pv.kind = 'ai_edit') then
    raise exception 'Requested AI snapshot was not saved';
  end if;

  update public.sites set published_header = header where id = site_id;
  select ctid into site_tuple from public.sites where id = site_id;
  execute 'set local role authenticated';
  perform public.publish_site_changes(site_id, '{}'::uuid[], true, header, false, null, false, null);
  execute 'reset role';
  if (select ctid from public.sites where id = site_id) is distinct from site_tuple then
    raise exception 'Publishing an unchanged header wrote the site tuple';
  end if;

  insert into public.site_draft_versions(site_id, pages, theme)
    select test.site_id, jsonb_agg(jsonb_build_object('id', p.id, 'draft_data', p.draft_data)), test.theme
      from public.pages p where p.id = test.page_id returning id into backup_id;
  select count(*) into history_count from public.site_draft_versions v where v.site_id = test.site_id;
  execute 'set local role authenticated';
  perform public.restore_ai_draft_version(site_id, backup_id);
  execute 'reset role';
  if (select ctid from public.sites where id = site_id) is distinct from site_tuple then
    raise exception 'Restoring the same header and theme wrote the site tuple';
  end if;
  if (select count(*) from public.site_draft_versions v where v.site_id = test.site_id) <> history_count + 1 then
    raise exception 'Restore did not preserve undo history';
  end if;

  perform set_config('request.jwt.claim.sub', stranger_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.save_page_with_header(page_id, input, header, header);
    raise exception 'Expected permission denial';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_editor_ai_draft(page_id, input);
    raise exception 'AI save allowed another account';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end;
$$;
rollback;
