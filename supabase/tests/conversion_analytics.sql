begin;

do $$
declare
  owner_id uuid := gen_random_uuid();
  editor_id uuid := gen_random_uuid();
  account_id uuid := gen_random_uuid();
  site_id uuid := gen_random_uuid();
  other_account_id uuid := gen_random_uuid();
  other_site_id uuid := gen_random_uuid();
  report jsonb;
  visible_events integer;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (owner_id, 'conversion-owner@example.test', '{}'),
    (editor_id, 'conversion-editor@example.test', '{}');
  insert into public.accounts(id, name) values
    (account_id, 'Conversion analytics'),
    (other_account_id, 'Other analytics');
  insert into public.account_members values
    (account_id, owner_id, 'owner'),
    (account_id, editor_id, 'editor');
  insert into public.sites(id, account_id, subdomain) values
    (site_id, account_id, 'conversion-analytics-test'),
    (other_site_id, other_account_id, 'other-conversion-analytics-test');
  insert into public.conversion_events(site_id, event_type, path) values
    (site_id, 'cta_click', '/contact'),
    (other_site_id, 'cta_click', '/private');

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  set local role authenticated;
  report := public.site_analytics(site_id, 7);
  assert report -> 'cta_clicks' = '1'::jsonb, 'The report counts only this site''s CTA clicks';
  select count(*) into visible_events from public.conversion_events;
  assert visible_events = 1, 'Owners can read their site events only';

  begin
    insert into public.conversion_events(site_id, event_type, path)
    values (site_id, 'cta_click', '/contact');
    raise exception 'Authenticated users must not write conversion events';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', editor_id::text, true);
  begin
    perform public.site_analytics(site_id, 7);
    raise exception 'Editors must not read conversion reports';
  exception when insufficient_privilege then null;
  end;
  reset role;

  assert not has_table_privilege('anon', 'public.conversion_events', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.conversion_events', 'INSERT');
  assert has_table_privilege('service_role', 'public.conversion_events', 'INSERT');
end;
$$;

rollback;
