-- Run only against an isolated test database with migrations through 0020.
begin;
do $$
declare
  admin_id uuid := '20000000-0000-4000-8000-000000000001';
  editor_id uuid := '20000000-0000-4000-8000-000000000002';
  stranger_id uuid := '20000000-0000-4000-8000-000000000003';
  account_id uuid := '21000000-0000-4000-8000-000000000001';
  future_site_id uuid := '22000000-0000-4000-8000-000000000001';
  generated jsonb;
  result record;
  n int;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (admin_id, 'photo-agency@example.test', '{}'), (editor_id, 'photo-editor@example.test', '{}'),
    (stranger_id, 'photo-stranger@example.test', '{}');
  update public.profiles set is_super_admin = true where id = admin_id;
  insert into public.accounts(id, name) values (account_id, 'Photo test');
  insert into public.account_members values (account_id, editor_id, 'editor');
  perform set_config('request.jwt.claim.sub', stranger_id::text, true);
  execute 'set local role authenticated';
  begin
    perform public.consume_photo_search(account_id);
    raise exception 'Expected account access denial';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  execute 'set local role authenticated';
  for n in 1..100 loop
    assert public.consume_photo_search(account_id), 'Editors can search within the allowance';
  end loop;
  assert not public.consume_photo_search(account_id), 'The 101st call must be denied';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  execute 'set local role authenticated';
  assert not public.consume_photo_search(account_id), 'The limit is global, not per user';
  begin
    delete from public.photo_search_limits;
    raise exception 'Expected rate-limit mutation denial';
  exception when insufficient_privilege then null;
  end;
  assert public.can_write_site_assets(future_site_id::text || '/pixabay-42.jpg'),
    'Super admins can upload assets before new-site creation';
  execute 'reset role';
  update public.photo_search_limits set created_at = clock_timestamp() - interval '61 seconds';
  execute 'set local role authenticated';
  assert public.consume_photo_search(account_id), 'The rolling limit resets after expiry';
  begin
    perform public.create_ai_site_with_business(
      account_id, 'Forbidden', 'photo-test-forbidden', '{}', '[]', '{}', future_site_id);
    raise exception 'Expected direct creation denial';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  select jsonb_agg(jsonb_build_object('slug', slug, 'title', coalesce(nullif(slug, ''), 'Home'),
    'data', '{"root":{},"content":[]}'::jsonb)) into generated from unnest(array['', 'about', 'services', 'contact']) slug;
  execute 'set local role service_role';
  begin
    perform public.create_ai_site_with_business(
      account_id, 'Invalid', 'photo-test-invalid', '{}', '[]', '{}', future_site_id);
    raise exception 'Expected invalid page rejection';
  exception when raise_exception then
    assert sqlerrm = 'Invalid generated pages.';
  end;
  assert not exists (select 1 from public.sites where id = future_site_id),
    'Invalid generated drafts cannot leave a partial site';
  select * into result from public.create_ai_site_with_business(
    account_id, 'Photo test', 'photo-test-isolated', '{}', generated, '{}', future_site_id);
  assert result.site_id = future_site_id, 'New sites use the asset folder UUID';
  execute 'reset role';
  assert (select count(*) from public.pages where site_id = future_site_id) = 4;
  assert not exists (select 1 from public.pages where site_id = future_site_id and published_data is not null),
    'Imported-photo sites are drafts only';
end;
$$;
rollback;
