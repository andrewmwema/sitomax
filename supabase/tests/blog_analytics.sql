-- Run against an isolated database with migrations through 0033.
begin;

do $$
declare
  owner_id uuid := gen_random_uuid();
  editor_id uuid := gen_random_uuid();
  account uuid := gen_random_uuid();
  other_account uuid := gen_random_uuid();
  site uuid := gen_random_uuid();
  other_site uuid := gen_random_uuid();
  post_id uuid := gen_random_uuid();
  other_post_id uuid := gen_random_uuid();
  report jsonb;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (owner_id, 'blog-analytics-owner@example.test', '{}'),
    (editor_id, 'blog-analytics-editor@example.test', '{}');
  insert into public.accounts(id, name) values (account, 'Blog analytics'), (other_account, 'Other account');
  insert into public.account_members values (account, owner_id, 'owner'), (account, editor_id, 'editor');
  insert into public.sites(id, account_id, subdomain) values
    (site, account, 'blog-analytics-test'), (other_site, other_account, 'blog-analytics-other-test');
  insert into public.posts(id, site_id, slug, title, status, published_content) values
    (post_id, site, 'renamed', 'New draft title', 'published', '{"version":1,"metadata":{"title":"Published title"}}'),
    (other_post_id, other_site, 'other', 'Other post', 'published', '{"version":1}');
  insert into public.page_views(site_id, blog_post_id, path, created_at) values
    (site, post_id, '/blog/old-slug', now()),
    (site, post_id, '/articles/renamed', now()),
    (site, post_id, '/articles/renamed', now() - interval '8 days'),
    (site, null, '/blog', now()),
    (other_site, other_post_id, '/blog/other', now());
  begin
    insert into public.page_views(site_id, blog_post_id) values (site, other_post_id);
    raise exception 'Cross-site attribution must fail';
  exception when foreign_key_violation then null;
  end;
  assert not has_function_privilege('anon', 'public.blog_analytics(uuid, integer)', 'execute');

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  report := public.blog_analytics(site, 7);
  assert report = jsonb_build_object('visits', 2, 'posts',
    jsonb_build_array(jsonb_build_object('id', post_id, 'title', 'Published title', 'visits', 2))),
    'Only attributed visits count and a rename keeps the same history';
  assert public.blog_analytics(site, 30) -> 'visits' = '3'::jsonb, 'The reporting period applies';
  begin
    perform public.blog_analytics(other_site, 30);
    raise exception 'A different account must not have access';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  begin
    perform public.blog_analytics(site, 30);
    raise exception 'Editors must not have analytics access';
  exception when insufficient_privilege then null;
  end;
  reset role;
end;
$$;

rollback;
