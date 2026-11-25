-- REVIEW ONLY. Obtain separate approval before cleanup.
-- Remove every fixture-site upload through the Storage API first.
-- Deleting these accounts also deletes their test AI usage and cost records.
begin;

do $$
declare
  fixture record;
  fixture_ids constant uuid[] := array[
    '64000000-0000-4000-8000-000000000001', '64000000-0000-4000-8000-000000000002',
    '64000000-0000-4000-8000-000000000003', '64000000-0000-4000-8000-000000000004',
    '64000000-0000-4000-8000-000000000005', '64000000-0000-4000-8000-000000000006',
    '64000000-0000-4000-8000-000000000007', '64000000-0000-4000-8000-000000000008'
  ]::uuid[];
  test_users uuid[];
begin
  select array_agg(p.id) into test_users from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com') and lower(p.email) = lower(u.email);
  if coalesce(cardinality(test_users), 0) <> 2 then
    raise exception 'Both existing test users must have matching Auth and profile emails.';
  end if;
  for fixture in select * from (values
    ('64000000-0000-4000-8000-000000000001'::uuid, 'TEST-PHASE2-Showcase-Client'),
    ('64000000-0000-4000-8000-000000000002'::uuid, 'TEST-PHASE2-Showcase-Agency'),
    ('64000000-0000-4000-8000-000000000003'::uuid, 'TEST-PHASE2-Clarity-Client'),
    ('64000000-0000-4000-8000-000000000004'::uuid, 'TEST-PHASE2-Clarity-Agency'),
    ('64000000-0000-4000-8000-000000000005'::uuid, 'TEST-PHASE2-Studio-Client'),
    ('64000000-0000-4000-8000-000000000006'::uuid, 'TEST-PHASE2-Studio-Agency'),
    ('64000000-0000-4000-8000-000000000007'::uuid, 'TEST-PHASE2-Mode2-Client'),
    ('64000000-0000-4000-8000-000000000008'::uuid, 'TEST-PHASE2-Mode2-Agency')
  ) as fixtures(id, name) loop
    if exists (select 1 from public.accounts where id = fixture.id and (name <> fixture.name or is_internal)) then
      raise exception 'A fixture account no longer has its expected identity.';
    end if;
  end loop;
  if exists (select 1 from public.account_members
    where account_id = any(fixture_ids) and (not (user_id = any(test_users)) or role <> 'owner')) then
    raise exception 'A fixture account contains an unexpected member.';
  end if;
  if exists (select 1 from public.sites where account_id = any(fixture_ids)
    and (name is null or name not like 'TEST-%' or subdomain not like 'test-%'
      or custom_domain is not null or domain_verified
      or template_key is null or template_key not in ('showcase', 'clarity', 'studio'))) then
    raise exception 'A fixture account contains a site without all expected TEST markers.';
  end if;
  if exists (select 1 from storage.objects o join public.sites s on split_part(o.name, '/', 1) = s.id::text
    where o.bucket_id = 'site-assets' and s.account_id = any(fixture_ids)) then
    raise exception 'Remove fixture-site uploads through the Storage API before cleanup.';
  end if;
  delete from public.accounts where id = any(fixture_ids);
end;
$$;
commit;
