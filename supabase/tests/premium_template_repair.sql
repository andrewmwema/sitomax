-- Run only against an isolated database with all migrations applied.
begin;
do $$
#variable_conflict use_variable
declare
  owner_id uuid := 'b1000000-0000-4000-8000-000000000001';
  editor_id uuid := 'b1000000-0000-4000-8000-000000000002';
  admin_id uuid := 'b1000000-0000-4000-8000-000000000003';
  account_id uuid := 'b2000000-0000-4000-8000-000000000001';
  other_account uuid := 'b2000000-0000-4000-8000-000000000002';
  first_site uuid;
  second_site uuid;
  single_site uuid;
  home_id uuid;
  single_page jsonb := '[{"title":"Home","slug":"","data":{"root":{"props":{}},"content":[]}}]';
  twelve_pages jsonb;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (owner_id, 'test-owner@premium.invalid', '{}'),
    (editor_id, 'test-editor@premium.invalid', '{}'),
    (admin_id, 'test-admin@premium.invalid', '{}');
  update public.profiles set is_super_admin = true where id = admin_id;
  insert into public.accounts(id, name) values
    (account_id, 'TEST-Premium owner'), (other_account, 'TEST-Premium other');
  insert into public.account_members values (account_id, owner_id, 'owner'), (account_id, editor_id, 'editor');

  select jsonb_agg(jsonb_build_object(
    'title', 'Page ' || n, 'slug', case when n = 0 then '' else 'page-' || n end,
    'data', '{"root":{"props":{}},"content":[]}'::jsonb
  ) order by n) into twelve_pages from generate_series(0, 11) as n;
  insert into public.site_templates(id, name, description, preview_image, theme, business, pages)
    values ('test-one', 'TEST-One', 'Test', 'https://example.invalid/test', '{}', '{}', single_page),
      ('test-twelve', 'TEST-Twelve', 'Test', 'https://example.invalid/test', '{}', '{}', twelve_pages);
  if (select count(*) from public.site_plans where plan_key in ('starter', 'growth', 'premium') and site_limit = 1) <> 3 then
    raise exception 'Expected the default plans to allow one site each';
  end if;

  begin
    insert into public.site_templates(id, name, description, preview_image, theme, business, pages)
      values ('test-zero', 'TEST-Zero', 'Test', 'https://example.invalid/test', '{}', '{}', '[]');
    raise exception 'Expected zero pages to be rejected';
  exception when check_violation then null;
  end;
  begin
    insert into public.site_templates(id, name, description, preview_image, theme, business, pages)
      values ('test-thirteen', 'TEST-Thirteen', 'Test', 'https://example.invalid/test', '{}', '{}', twelve_pages || single_page);
    raise exception 'Expected thirteen pages to be rejected';
  exception when check_violation then null;
  end;

  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.site_templates where id like 'test-%') <> 2 then
    raise exception 'Authenticated editor cannot read masters';
  end if;
  begin
    insert into public.site_templates(id, name, description, preview_image, theme, business, pages)
      values ('test-forged', 'TEST-Forged', 'Test', 'https://example.invalid/test', '{}', '{}', single_page);
    raise exception 'Expected editor catalog write denial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_site_from_template(account_id, 'test-one', 'TEST-Editor', 'test-editor-premium', 'UTC');
    raise exception 'Expected editor site creation denial';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects(bucket_id, name) values ('template-assets', 'TEST-forged');
    raise exception 'Expected editor asset write denial';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  begin
    update public.site_creation_settings set marketing_subdomain = 'changed';
    if found then raise exception 'Expected settings write denial'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_site_from_template(account_id, 'test-one', 'TEST-Reserved', 'app', 'UTC');
    raise exception 'Expected platform subdomain denial';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_site_from_template(account_id, 'test-one', 'TEST-Reserved', 'sitomax', 'UTC');
    raise exception 'Expected marketing subdomain denial';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.create_site_from_template(other_account, 'test-one', 'TEST-Foreign', 'test-foreign-premium', 'UTC');
    raise exception 'Expected foreign account denial';
  exception when insufficient_privilege then null;
  end;
  first_site := public.create_site_from_template(account_id, 'test-twelve', 'TEST-First', 'test-first-premium', 'UTC');
  if (select count(*) from public.pages where site_id = first_site) <> 12 then
    raise exception 'Expected all twelve pages';
  end if;
  if exists (select 1 from public.pages where site_id = first_site and (published_data is not null or published_at is not null)) then
    raise exception 'Template copies must start unpublished';
  end if;
  if (select slug from public.pages where site_id = first_site and sort_order = 0) <> '' then
    raise exception 'Home must remain the first page';
  end if;
  if exists (
    select 1 from public.pages where site_id = first_site
      and sort_order > 0 and slug <> 'page-' || sort_order
  ) then raise exception 'Page order must match the master'; end if;
  begin
    perform public.create_site_from_template(account_id, 'test-one', 'TEST-Over limit', 'test-over-premium', 'UTC');
    raise exception 'Expected site limit error';
  exception when raise_exception then
    if sqlerrm <> 'SITE_LIMIT_REACHED' then raise; end if;
  end;
  execute 'reset role';
  insert into public.account_members values (other_account, owner_id, 'owner');
  update public.accounts set site_plan_key = 'growth' where id = other_account;
  update public.site_creation_settings set marketing_subdomain = 'test-market';

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.create_site_from_template(other_account, 'test-one', 'TEST-Reserved', 'test-market', 'UTC');
    raise exception 'Expected configured marketing subdomain denial';
  exception when invalid_parameter_value then null;
  end;
  single_site := public.create_site_from_template(other_account, 'test-one', 'TEST-Single', 'test-single-premium', 'UTC');
  if (select count(*) from public.pages where site_id = single_site) <> 1 then
    raise exception 'A one-page design should create one page';
  end if;
  begin
    perform public.create_site_from_template(other_account, 'test-one', 'TEST-Over growth limit', 'test-over-growth', 'UTC');
    raise exception 'Expected growth site limit error';
  exception when raise_exception then
    if sqlerrm <> 'SITE_LIMIT_REACHED' then raise; end if;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  second_site := public.create_site_from_template(account_id, 'test-twelve', 'TEST-Second', 'test-second-premium', 'UTC');
  if (select count(*) from public.pages where site_id = second_site) <> 12 then
    raise exception 'Admin copy should not be limited';
  end if;
  select id into home_id from public.pages where site_id = first_site and slug = '';
  update public.pages set draft_data = jsonb_set(draft_data, '{root,props,title}', '"changed"') where id = home_id;
  if exists (
    select 1 from public.pages where site_id = second_site and draft_data#>>'{root,props,title}' = 'changed'
  ) or (select pages from public.site_templates where id = 'test-twelve')->0->'data'#>>'{root,props,title}' = 'changed' then
    raise exception 'Editing a copy changed another copy or the master';
  end if;
  execute 'reset role';
end;
$$;
rollback;
