-- Run only against an isolated test database with every migration applied.
-- Tests run as the database owner and roll back every fixture.
begin;
do $$
#variable_conflict use_variable
declare
  owner_id uuid := '11000000-0000-4000-8000-000000000001';
  editor_id uuid := '11000000-0000-4000-8000-000000000002';
  stranger_id uuid := '11000000-0000-4000-8000-000000000003';
  admin_id uuid := '11000000-0000-4000-8000-000000000004';
  account_id uuid := '21000000-0000-4000-8000-000000000001';
  other_account uuid := '21000000-0000-4000-8000-000000000002';
  site_id uuid := '31000000-0000-4000-8000-000000000001';
  home_id uuid := '41000000-0000-4000-8000-000000000001';
  about_id uuid := '41000000-0000-4000-8000-000000000002';
  promo_id uuid := '41000000-0000-4000-8000-000000000003';
  faq_id uuid := '41000000-0000-4000-8000-000000000004';
  team_id uuid := '41000000-0000-4000-8000-000000000005';
  post_id uuid := '51000000-0000-4000-8000-000000000001';
  new_post_id uuid := '51000000-0000-4000-8000-000000000002';
  thread_id uuid := '61000000-0000-4000-8000-000000000001';
  run_id uuid := '71000000-0000-4000-8000-000000000001';
  stale_run uuid := '71000000-0000-4000-8000-000000000002';
  old_run uuid := '71000000-0000-4000-8000-000000000003';
  later_run uuid := '71000000-0000-4000-8000-000000000004';
  home_draft jsonb := '{"root":{"props":{"title":"Home"}},"content":[{"type":"Hero","props":{"id":"hero","title":"Welcome"}}]}';
  home_live jsonb := '{"root":{"props":{"title":"Home"}},"content":[{"type":"Hero","props":{"id":"hero","title":"Live"}}]}';
  about_draft jsonb := '{"root":{"props":{}},"content":[{"type":"Text","props":{"id":"about","title":"About"}}]}';
  promo_draft jsonb := '{"root":{"props":{}},"content":[{"type":"Embed","props":{"id":"embed","code":"<p>Agency embed</p>"}}]}';
  ai_draft jsonb := '{"root":{"props":{"title":"Home"}},"content":[{"type":"Hero","props":{"id":"hero","title":"Premium"}}]}';
  empty_draft jsonb := '{"root":{"props":{}},"content":[]}';
  header jsonb := '{"version":1,"logo":{"text":"AI"}}';
  home_version uuid;
  about_version uuid;
  promo_version uuid;
  post_token text;
  apply_id uuid;
  old_apply uuid;
  later_apply uuid;
  result jsonb;
  items jsonb;
  changes jsonb;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (owner_id, 'owner@agent.test', '{}'), (editor_id, 'editor@agent.test', '{}'),
    (stranger_id, 'stranger@agent.test', '{}'), (admin_id, 'agency@agent.test', '{}');
  update public.profiles set is_super_admin = true where id = admin_id;
  update public.profiles set full_name = 'Olive Owner' where id = owner_id;
  insert into public.accounts(id, name) values (account_id, 'Agent test'), (other_account, 'Other agent test');
  insert into public.account_members values
    (account_id, owner_id, 'owner'), (account_id, editor_id, 'editor'), (other_account, stranger_id, 'owner');
  insert into public.sites(id, account_id, subdomain, theme) values (site_id, account_id, 'agent-apply-test', '{"style":"classic"}');
  insert into public.pages(id, site_id, slug, title, draft_data, published_data, published_at, sort_order) values
    (home_id, site_id, '', 'Home', home_draft, home_live, clock_timestamp() - interval '1 day', 0);
  insert into public.pages(id, site_id, slug, title, draft_data, sort_order) values
    (about_id, site_id, 'about', 'About', about_draft, 1), (promo_id, site_id, 'promo', 'Promo', promo_draft, 2);
  insert into public.posts(id, site_id, title, slug) values (post_id, site_id, 'Old post', 'old-post');
  insert into public.ai_agent_threads(id, site_id, user_id, title) values (thread_id, site_id, owner_id, 'Make the site premium');
  insert into public.ai_agent_runs(id, thread_id, status) values
    (run_id, thread_id, 'completed'), (stale_run, thread_id, 'completed'), (old_run, thread_id, 'completed'),
    (later_run, thread_id, 'failed');
  select draft_version into home_version from public.pages where id = home_id;
  select draft_version into about_version from public.pages where id = about_id;
  select draft_version into promo_version from public.pages where id = promo_id;
  select updated_at::text into post_token from public.posts where id = post_id;

  items := jsonb_build_array(
    jsonb_build_object('key', 'theme', 'kind', 'theme', 'label', 'Site theme',
      'expected', '{"style":"classic"}'::jsonb, 'after', '{"style":"modern"}'::jsonb),
    jsonb_build_object('key', 'header', 'kind', 'header', 'label', 'Site header', 'expected', null, 'after', header),
    jsonb_build_object('key', 'page:' || home_id, 'kind', 'page', 'target_id', home_id, 'label', 'Home',
      'expected_version', home_version, 'draft_data', ai_draft,
      'settings', '{"title":"AI title","nav_label":"AI","hide_from_menu":true,"seo":{"title":"AI"}}'::jsonb),
    jsonb_build_object('key', 'page:' || about_id, 'kind', 'page', 'target_id', about_id, 'label', 'About',
      'expected_version', about_version, 'draft_data', ai_draft,
      'settings', '{"title":"Our story","nav_label":"Story","hide_from_menu":false,"seo":{}}'::jsonb),
    jsonb_build_object('key', 'page:' || promo_id, 'kind', 'page', 'target_id', promo_id, 'label', 'Promo',
      'expected_version', promo_version, 'draft_data', empty_draft),
    jsonb_build_object('key', 'page:' || faq_id, 'kind', 'page_created', 'target_id', faq_id, 'label', 'FAQ',
      'draft_data', empty_draft, 'settings', '{"slug":"faq","title":"FAQ","nav_label":"FAQ","sort_order":3}'::jsonb),
    jsonb_build_object('key', 'page:' || team_id, 'kind', 'page_created', 'target_id', team_id, 'label', 'Team',
      'draft_data', empty_draft, 'settings', '{"slug":"team","title":"Team","nav_label":"Team","sort_order":4}'::jsonb),
    jsonb_build_object('key', 'post:' || post_id, 'kind', 'post', 'target_id', post_id, 'label', 'Old post',
      'expected_updated_at', post_token, 'fields', jsonb_build_object('title', 'Better post', 'slug', 'better-post',
        'draft_content', '{"version":1,"blocks":[]}'::jsonb)),
    jsonb_build_object('key', 'post:' || new_post_id, 'kind', 'post_created', 'target_id', new_post_id, 'label', 'New post',
      'fields', jsonb_build_object('title', 'New post', 'slug', 'new-post', 'draft_content', '{"version":1,"blocks":[]}'::jsonb))
  );
  changes := jsonb_build_array(
    jsonb_build_object('id', 'theme', 'label', 'Update site theme', 'items', jsonb_build_array('theme')),
    jsonb_build_object('id', 'header', 'label', 'Update site header', 'items', jsonb_build_array('header')),
    jsonb_build_object('id', 'home', 'label', 'Update Hero', 'items', jsonb_build_array('page:' || home_id)),
    jsonb_build_object('id', 'about', 'label', 'Update About', 'items', jsonb_build_array('page:' || about_id)),
    jsonb_build_object('id', 'promo', 'label', 'Delete Embed', 'items', jsonb_build_array('page:' || promo_id)),
    jsonb_build_object('id', 'faq', 'label', 'Create FAQ', 'items', jsonb_build_array('page:' || faq_id)),
    jsonb_build_object('id', 'team', 'label', 'Create Team', 'items', jsonb_build_array('page:' || team_id)),
    jsonb_build_object('id', 'post', 'label', 'Update post', 'items', jsonb_build_array('post:' || post_id)),
    jsonb_build_object('id', 'new-post', 'label', 'Draft post', 'items', jsonb_build_array('post:' || new_post_id)),
    jsonb_build_object('id', 'footer', 'label', 'Update footer',
      'items', jsonb_build_array('page:' || home_id, 'page:' || about_id))
  );

  -- Apply access: threads are private, and other accounts see nothing.
  perform set_config('request.jwt.claim.sub', stranger_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.apply_ai_agent_changes(run_id, 'Premium', changes, items);
    raise exception 'Expected apply denial for another account';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.apply_ai_agent_changes(run_id, 'Premium', changes, items);
    raise exception 'Expected apply denial for another member''s thread';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.ai_agent_applies(site_id, summary, changes, applied_by_name) values (site_id, 'Forged', '[]', 'Editor');
    raise exception 'Expected direct write denial';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- A stale token aborts the whole apply: the theme written first is rolled back.
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.apply_ai_agent_changes(stale_run, 'Stale', '[]', jsonb_build_array(items->0,
      jsonb_build_object('key', 'page:' || home_id, 'kind', 'page', 'target_id', home_id, 'label', 'Home',
        'expected_version', gen_random_uuid(), 'draft_data', ai_draft)));
    raise exception 'Expected conflict';
  exception when serialization_failure then null;
  end;
  execute 'reset role';
  assert (select draft_theme from public.sites where id = site_id) is null, 'A conflicting apply must write nothing';
  assert (select count(*) from public.ai_agent_applies) = 0, 'A conflicting apply must not be recorded';

  execute 'set local role authenticated';
  apply_id := public.apply_ai_agent_changes(run_id, 'Make the site premium', changes, items);
  begin
    perform public.apply_ai_agent_changes(run_id, 'Again', changes, items);
    raise exception 'Expected a single apply per run';
  exception when raise_exception then assert sqlerrm like '%already applied%';
  end;
  execute 'reset role';

  assert (select draft_theme->>'style' from public.sites where id = site_id) = 'modern';
  assert (select theme->>'style' from public.sites where id = site_id) = 'classic', 'Apply must not change the live theme';
  assert (select draft_header from public.sites where id = site_id) = header;
  assert (select published_header from public.sites where id = site_id) is null, 'Apply must not publish the header';
  assert (select draft_data from public.pages where id = home_id) = ai_draft;
  assert (select published_data from public.pages where id = home_id) = home_live, 'Apply must not change published pages';
  assert (select title || '/' || nav_label || '/' || hide_from_menu from public.pages where id = home_id) = 'Home/Home/false',
    'Live settings of a published page must not change';
  assert (select title || '/' || nav_label from public.pages where id = about_id) = 'Our story/Story',
    'Settings of a never-published page are part of its draft';
  assert (select count(*) from public.pages where id in (faq_id, team_id) and published_data is null) = 2;
  assert (select title || '/' || slug from public.posts where id = post_id) = 'Better post/better-post';
  assert (select status from public.posts where id = new_post_id) = 'draft';
  assert (select count(*) from public.page_versions v where v.kind = 'ai_edit'
    and v.page_id in (home_id, about_id, promo_id, faq_id, team_id)) = 5, 'Every touched page gets a history snapshot';
  assert (select applied_by = owner_id and applied_by_name = 'Olive Owner' and undone_at is null
    from public.ai_agent_applies where id = apply_id), 'The apply records who applied it';
  assert (select count(*) from public.ai_agent_apply_items i where i.apply_id = apply_id) = 9;

  -- History visibility follows site membership.
  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  execute 'set local role authenticated';
  assert (select count(*) from public.list_ai_agent_applies(site_id) where can_undo) = 1, 'Members see the undoable apply';
  assert (select id from public.list_ai_agent_applies(site_id, run_id)) = apply_id
    and (select count(*) from public.list_ai_agent_applies(site_id, stale_run)) = 0, 'An apply can be looked up by its run';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', stranger_id::text, true);
  execute 'set local role authenticated';
  assert (select count(*) from public.list_ai_agent_applies(site_id)) = 0, 'History cannot cross accounts';
  assert (select count(*) from public.ai_agent_applies) = 0 and (select count(*) from public.ai_agent_apply_items) = 0,
    'RLS hides applies from other accounts';
  begin
    perform public.undo_ai_agent_apply(apply_id);
    raise exception 'Expected undo denial for another account';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  -- Work done after the apply: About and Team were edited, the header and the new post went live.
  update public.pages set draft_data = about_draft where id = about_id;
  update public.pages set draft_data = about_draft where id = team_id;
  update public.sites set published_header = draft_header where id = site_id;
  update public.posts set status = 'published', published_content = draft_content, published_at = clock_timestamp()
    where id = new_post_id;

  -- An unexpected failure part-way through rolls back the items already restored.
  create function pg_temp.fail_faq_delete() returns trigger language plpgsql as $fn$
  begin
    raise exception 'Simulated failure';
  end;
  $fn$;
  create trigger fail_faq_delete before delete on public.pages
    for each row when (old.slug = 'faq') execute function pg_temp.fail_faq_delete();
  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.undo_ai_agent_apply(apply_id);
    raise exception 'Expected the simulated failure';
  exception when raise_exception then assert sqlerrm = 'Simulated failure';
  end;
  execute 'reset role';
  drop trigger fail_faq_delete on public.pages;
  assert (select draft_data from public.pages where id = home_id) = ai_draft, 'A failed undo must roll back restored pages';
  assert (select count(*) from public.pages where id = faq_id) = 1, 'A failed undo must not delete created pages';
  assert (select undone_at is null from public.ai_agent_applies where id = apply_id);
  assert (select count(*) from public.ai_agent_apply_items i where i.apply_id = apply_id and i.outcome is not null) = 0;

  -- Any member can undo, here the editor rather than the owner who applied.
  execute 'set local role authenticated';
  result := public.undo_ai_agent_apply(apply_id);
  begin
    perform public.undo_ai_agent_apply(apply_id);
    raise exception 'Expected a single undo';
  exception when raise_exception then assert sqlerrm like '%already undone%';
  end;
  execute 'reset role';

  assert (result->>'undone')::int = 4 and (result->>'skipped')::int = 6,
    format('Expected 4 undone and 6 skipped changes, got %s', result);
  assert (select draft_theme from public.sites where id = site_id) is null, 'An untouched theme is restored';
  assert (select draft_data from public.pages where id = home_id) = home_draft, 'An untouched page is restored';
  assert (select published_data from public.pages where id = home_id) = home_live, 'Undo must not change published pages';
  assert (select count(*) from public.pages where id = faq_id) = 0, 'An unedited, unpublished created page is deleted';
  assert (select title || '/' || slug from public.posts where id = post_id) = 'Old post/old-post', 'An untouched post is restored';
  assert (select draft_data from public.pages where id = about_id) = about_draft
    and (select title from public.pages where id = about_id) = 'Our story', 'A page edited since is left alone';
  assert (select count(*) from public.pages where id = team_id) = 1, 'A created page edited since is kept';
  assert (select draft_header from public.sites where id = site_id) = header, 'A published header is left alone';
  assert (select status from public.posts where id = new_post_id) = 'published', 'A published post is kept';
  assert (select draft_data from public.pages where id = promo_id) = empty_draft, 'Agency-only embeds are not restored by members';
  assert (select jsonb_object_agg(entry->>'key', entry->>'reason') from jsonb_array_elements(result->'skipped_items') entry)
    = jsonb_build_object('header', 'published', 'page:' || about_id, 'edited', 'page:' || team_id, 'edited',
      'page:' || promo_id, 'restricted', 'post:' || new_post_id, 'published'), 'Skipped items are reported with a reason';
  assert (select undone_by = editor_id and undone_at is not null and undo_result = result
    from public.ai_agent_applies where id = apply_id), 'The undo records who undid it';
  assert not (select can_undo from public.list_ai_agent_applies(site_id) where id = apply_id), 'An undone apply cannot be undone again';

  -- Undo expires after 30 days.
  select draft_version into home_version from public.pages where id = home_id;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  old_apply := public.apply_ai_agent_changes(old_run, 'Older change',
    jsonb_build_array(jsonb_build_object('id', 'home', 'label', 'Update Hero', 'items', jsonb_build_array('page:' || home_id))),
    jsonb_build_array(jsonb_build_object('key', 'page:' || home_id, 'kind', 'page', 'target_id', home_id, 'label', 'Home',
      'expected_version', home_version, 'draft_data', ai_draft)));
  assert (select can_undo from public.list_ai_agent_applies(site_id) where id = old_apply);

  -- A later apply on the same page blocks the earlier undo only until it is undone itself.
  select draft_version into home_version from public.pages where id = home_id;
  later_apply := public.apply_ai_agent_changes(later_run, 'Later change',
    jsonb_build_array(jsonb_build_object('id', 'home', 'label', 'Clear Home', 'items', jsonb_build_array('page:' || home_id))),
    jsonb_build_array(jsonb_build_object('key', 'page:' || home_id, 'kind', 'page', 'target_id', home_id, 'label', 'Home',
      'expected_version', home_version, 'draft_data', empty_draft)));
  assert not (select can_undo from public.list_ai_agent_applies(site_id) where id = old_apply),
    'An apply cannot be undone underneath a later one';
  result := public.undo_ai_agent_apply(later_apply);
  assert (result->>'undone')::int = 1 and (select draft_data from public.pages where id = home_id) = ai_draft;
  assert (select can_undo from public.list_ai_agent_applies(site_id) where id = old_apply),
    'Undoing the later apply makes the earlier one undoable again';
  execute 'reset role';
  update public.ai_agent_applies set applied_at = applied_at - interval '31 days' where id = old_apply;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  assert (select not can_undo from public.list_ai_agent_applies(site_id) where id = old_apply), 'The agency sees expired applies';
  begin
    perform public.undo_ai_agent_apply(old_apply);
    raise exception 'Expected expiry';
  exception when raise_exception then assert sqlerrm like '%30 days%';
  end;
  execute 'reset role';
  assert (select draft_data from public.pages where id = home_id) = ai_draft, 'An expired undo changes nothing';

  raise notice 'PASS: transactional apply and site-wide undo, skip rules, live content untouched, access control and expiry';
end;
$$;
rollback;
