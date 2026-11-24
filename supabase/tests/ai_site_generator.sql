-- Run only against an isolated test database with every migration applied.
-- Tests run as the database owner and roll back every fixture.
begin;
do $$
#variable_conflict use_variable
declare
  owner_id uuid := '10000000-0000-4000-8000-000000000001';
  editor_id uuid := '10000000-0000-4000-8000-000000000002';
  stranger_id uuid := '10000000-0000-4000-8000-000000000003';
  admin_id uuid := '10000000-0000-4000-8000-000000000004';
  account_id uuid := '20000000-0000-4000-8000-000000000001';
  other_account uuid := '20000000-0000-4000-8000-000000000002';
  site_id uuid := '30000000-0000-4000-8000-000000000001';
  old_page uuid := '40000000-0000-4000-8000-000000000001';
  generation uuid;
  child uuid;
  backup_id uuid;
  created_site uuid;
  home_id uuid;
  original_draft jsonb := '{"root":{},"content":[{"type":"Embed","props":{"code":"<p>Agency-approved embed</p>"}}]}';
  published jsonb := '{"root":{},"content":[]}';
  generated jsonb;
  selected_generated jsonb;
  n int;
begin
  assert public.valid_site_business('{"businessName":"Example","businessType":"Consultant","city":"York","difference":"","tone":"","phone":"","email":"","address":"","openingHours":"","services":[]}'),
    'Business validation remains compatible with existing records';
  assert public.valid_site_business('{"businessName":"Example","businessType":"Consultant","city":"York","difference":"","tone":"","phone":"","email":"","address":"","openingHours":"","services":[],"primaryAction":"book","audiences":["Small businesses"],"description":"Verified business details"}'),
    'Business validation accepts the expanded AI intake';
  assert public.valid_site_business('{"businessName":"Example","businessType":"Consultant","city":"York","difference":"","tone":"","phone":"","email":"","address":"","openingHours":"","services":[],"socialLinks":[{"label":"Photos","url":"https://instagram.com/example"}]}'),
    'Business validation preserves social profiles';
  assert not public.valid_site_business('{"businessName":"Example","businessType":"Consultant","city":"York","difference":"","tone":"","phone":"","email":"","address":"","openingHours":"","services":[],"socialLinks":[{"label":"Photos","url":"https://instagram.com/example","extra":"data"}]}'),
    'Business validation rejects unsupported social profile fields';
  assert not public.valid_site_business('{"businessName":"Example","businessType":"Consultant","city":"York","difference":"","tone":"","phone":"","email":"","address":"","openingHours":"","services":[],"primaryAction":"hack","audiences":[],"description":""}'),
    'Business validation rejects unsupported primary actions';
  insert into auth.users(id, email, raw_user_meta_data) values
    (owner_id, 'owner@example.test', '{}'), (editor_id, 'editor@example.test', '{}'),
    (stranger_id, 'stranger@example.test', '{}'), (admin_id, 'agency@example.test', '{}');
  update public.profiles set is_super_admin = true where id = admin_id;
  insert into public.accounts(id, name) values (account_id, 'Generator test'), (other_account, 'Other test');
  insert into public.account_members values (account_id, owner_id, 'owner'), (account_id, editor_id, 'editor'), (other_account, stranger_id, 'owner');
  update public.ai_limits set extra_credits = 20 where public.ai_limits.account_id = account_id;
  insert into public.sites(id, account_id, subdomain, theme) values (site_id, account_id, 'generator-isolated-test', '{"style":"classic"}');
  insert into public.pages(id, site_id, slug, title, seo, draft_data, published_data, published_at)
    values (old_page, site_id, '', 'Published title', '{"title":"Published SEO"}', original_draft, published, now());
  select jsonb_agg(jsonb_build_object('slug', slug, 'title', coalesce(nullif(slug, ''), 'Home'),
    'data', jsonb_build_object('root', jsonb_build_object('props', jsonb_build_object('title', 'Draft title')), 'content', '[]'::jsonb)))
    into generated from unnest(array['', 'about', 'services', 'contact']) slug;

  execute 'set local role service_role';
  generation := public.begin_ai_site_generation(owner_id, account_id, 'claude-sonnet-5-5', site_id);
  for n in 1..5 loop
    child := public.reserve_ai_generation_call(generation, owner_id, account_id, 'generate_site', 'claude-sonnet-5-5', site_id);
    perform public.finish_ai_request(child, false, 100, 50, 0, 0, 0, 0.001);
  end loop;
  perform public.finish_ai_site_generation(generation, true, site_id);
  execute 'reset role';
  assert (select count(*) from public.ai_usage) = 5, 'Every provider call must be metered';
  assert (select extra_credits from public.ai_limits where public.ai_limits.account_id = account_id) = 20, 'First generation uses included quota once';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  assert (select included_generations from public.ai_account_summaries()) = 1, 'Child calls must not consume monthly quota';
  assert (select site_generations from public.ai_account_summaries()) = 1, 'Usage cards count one site, not five calls';
  execute 'reset role';
  update public.ai_requests set created_at = created_at - interval '2 minutes' where generation_id = generation;

  execute 'set local role service_role';
  generation := public.begin_ai_site_generation(owner_id, account_id, 'claude-sonnet-5-5', site_id);
  assert (select extra_credits from public.ai_limits where public.ai_limits.account_id = account_id) = 10, 'A complete generation reserves exactly ten credits';
  -- Since 0024/0026 a generation's own calls are capped by its call budget, not the rolling limit.
  for n in 1..42 loop
    child := public.reserve_ai_generation_call(generation, owner_id, account_id, 'generate_site', 'claude-sonnet-5-5', site_id);
    perform public.finish_ai_request(child, true);
  end loop;
  begin
    perform public.reserve_ai_generation_call(generation, owner_id, account_id, 'generate_site', 'claude-sonnet-5-5', site_id);
    raise exception 'Expected budget denial';
  exception when raise_exception then
    assert sqlerrm like '%maximum number of AI calls%', 'A curated generation allows exactly 42 calls, including failures';
  end;
  begin
    perform public.reserve_ai_request(owner_id, account_id, 'edit_section', 'claude-haiku-4-5', site_id);
    raise exception 'Expected rate denial';
  exception when raise_exception then
    assert sqlerrm like '%rate limit%', 'Generation calls still count toward the rolling limit for other requests';
  end;
  perform public.finish_ai_site_generation(generation, false);
  perform public.finish_ai_site_generation(generation, false);
  execute 'reset role';
  assert (select extra_credits from public.ai_limits where public.ai_limits.account_id = account_id) = 20, 'All confirmed rejections refund credits idempotently';
  update public.ai_requests set created_at = created_at - interval '2 minutes' where generation_id = generation;

  execute 'set local role service_role';
  generation := public.begin_ai_site_generation(owner_id, account_id, 'claude-sonnet-5-5', site_id);
  child := public.reserve_ai_generation_call(generation, owner_id, account_id, 'generate_site', 'claude-sonnet-5-5', site_id);
  perform public.finish_ai_site_generation(generation, false);
  assert (select status from public.ai_requests where id = generation) = 'pending', 'Unknown billable outcomes stay held';
  begin
    perform public.reserve_ai_generation_call(generation, stranger_id, other_account, 'generate_site', 'claude-sonnet-5-5', site_id);
    raise exception 'Expected denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.begin_ai_site_generation(editor_id, account_id, 'claude-sonnet-5-5', site_id);
    raise exception 'Expected denial';
  exception when insufficient_privilege then null;
  end;
  perform public.finish_ai_request(child, false, 100, 50, 0, 0, 0, 0.001);
  perform public.finish_ai_site_generation(generation, false);
  execute 'reset role';
  assert (select status from public.ai_requests where id = generation) = 'completed', 'Partly billed generations cannot be retried for free';
  assert (select extra_credits from public.ai_limits where public.ai_limits.account_id = account_id) = 10;

  execute 'set local role authenticated';
  home_id := public.replace_ai_site_drafts(site_id, '{"style":"modern"}', generated);
  assert home_id = old_page, 'Existing page IDs must remain stable';
  assert (select published_data from public.pages where id = old_page) = published;
  assert (select title from public.pages where id = old_page) = 'Published title';
  assert (select seo->>'title' from public.pages where id = old_page) = 'Published SEO';
  assert (select theme->>'style' from public.sites where id = site_id) = 'classic', 'Live theme must not change';
  assert (select draft_theme->>'style' from public.sites where id = site_id) = 'modern';
  assert (select count(*) from public.page_versions where page_id = old_page) = 1, 'Generation must not forge published versions';
  select id into backup_id from public.site_draft_versions where public.site_draft_versions.site_id = site_id;
  assert (select pages->0->'draft_data' from public.site_draft_versions where id = backup_id) = original_draft;
  perform public.restore_site_draft_version(backup_id);
  assert (select draft_data from public.pages where id = old_page) = original_draft, 'Owner must be able to restore approved agency embeds too';
  assert (select published_data from public.pages where id = old_page) = published;
  assert (select count(*) from public.site_draft_versions) = 2, 'A restore is itself reversible';
  selected_generated := jsonb_build_array(
    (select value from jsonb_array_elements(generated) where value->>'slug' = ''),
    (select value from jsonb_array_elements(generated) where value->>'slug' = 'about')
  );
  home_id := public.replace_ai_site_drafts_with_business(site_id, '{"style":"classic"}', selected_generated,
    '{"businessName":"Example","businessType":"Consultant","city":"York","difference":"","tone":"","phone":"","email":"","address":"","openingHours":"","services":[],"primaryAction":"book","audiences":["Small businesses"],"description":"Verified business details"}');
  assert home_id = old_page, 'Selected-page generation must preserve the home page ID';
  assert (select business->>'primaryAction' from public.sites where id = site_id) = 'book',
    'Selected-page generation saves the primary action and other intake details';
  assert (select count(*) from public.pages where public.pages.site_id = site_id) = 4,
    'Unselected pages on an existing site must remain intact';
  assert (select p.draft_data->'root'->'props'->>'title' from public.pages p
    where p.site_id = site_id and p.slug = 'about') = 'Draft title';
  assert (select count(*) from public.site_draft_versions where public.site_draft_versions.site_id = site_id) = 3,
    'Selected-page replacement must retain a reversible backup';
  begin
    perform public.replace_ai_site_drafts_with_business(site_id, '{}',
      jsonb_build_array((select value from jsonb_array_elements(generated) where value->>'slug' = 'about')), '{}');
    raise exception 'Expected missing Home rejection';
  exception when raise_exception then
    assert sqlerrm = 'Invalid generated pages.', 'Home remains mandatory for selected-page generation';
  end;
  assert (select count(*) from public.site_draft_versions where public.site_draft_versions.site_id = site_id) = 3,
    'Invalid selected-page requests must not create backups';
  begin
    update public.pages set draft_data = '{"root":{},"content":[{"type":"Embed","props":{"code":"<script>new unapproved code</script>"}}]}' where id = old_page;
    raise exception 'Expected embed denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.replace_ai_site_drafts(site_id, '{}', '[]');
    raise exception 'Expected invalid data denial';
  exception when raise_exception then assert sqlerrm = 'Invalid generated pages.';
  end;
  assert (select count(*) from public.site_draft_versions) = 3, 'Invalid writes must roll back backups and page changes together';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.replace_ai_site_drafts(site_id, '{}', generated);
    raise exception 'Expected owner denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.reserve_ai_request(editor_id, account_id, 'generate_site', 'claude-sonnet-5-5', site_id);
    raise exception 'Expected private RPC denial';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', stranger_id::text, true);
  execute 'set local role authenticated';
  assert (select count(*) from public.site_draft_versions) = 0, 'Backups cannot cross accounts';
  begin
    perform public.restore_site_draft_version(backup_id);
    raise exception 'Expected backup isolation denial';
  exception when no_data_found then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role service_role';
  generation := public.begin_ai_site_generation(admin_id, account_id, 'claude-sonnet-5-5');
  child := public.reserve_ai_generation_call(generation, admin_id, account_id, 'generate_site', 'claude-sonnet-5-5');
  perform public.finish_ai_request(child, false, 100, 50, 0, 0, 0, 0.001);
  select result.site_id, result.page_id into created_site, home_id
    from public.create_ai_site(account_id, 'AI test', 'ai-new-isolated-test', '{"style":"modern"}', generated) result;
  perform public.finish_ai_site_generation(generation, true, created_site);
  assert (select public.ai_usage.site_id from public.ai_usage where request_id = child) = created_site, 'New-site usage must link to the created site';
  assert (select count(*) from public.pages where public.pages.site_id = created_site and published_data is not null) = 0;
  assert (select draft_theme->>'style' from public.sites where id = created_site) = 'modern';
  select result.site_id, result.page_id into created_site, home_id
    from public.create_ai_site_with_business(account_id, 'AI selected test', 'ai-selected-isolated-test',
      '{"style":"modern"}', selected_generated, '{}', '30000000-0000-4000-8000-000000000003') result;
  assert (select count(*) from public.pages where public.pages.site_id = created_site) = 2,
    'New custom-layout sites may create only the selected pages';
  assert (select slug from public.pages where id = home_id) = '';
  update public.pages set published_data = draft_data, published_at = now() where id = home_id;
  assert (select draft_theme->>'style' from public.sites where id = created_site) = 'modern',
    'Since 0039, publishing a page alone leaves the pending theme staged';
  execute 'reset role';
  execute 'set local role authenticated';
  perform public.publish_site_changes(created_site, '{}'::uuid[], false, null, true, '{"style":"modern"}', false, null);
  execute 'reset role';
  assert (select theme->>'style' from public.sites where id = created_site) = 'modern', 'Only explicit publishing applies the pending theme';
  assert (select draft_theme from public.sites where id = created_site) is null;
  raise notice 'PASS: generation credits, call budgets and rate limits, draft-only writes, reversible backups, RLS, embeds and explicit publishing';
end;
$$;
rollback;
