-- REVIEW ONLY. Obtain separate approval before cleanup.
-- Delete test uploads through the Storage API first; this script never deletes storage metadata.
begin;
set local sitomax.test_owner_id = '00000000-0000-0000-0000-000000000000';
set local sitomax.test_admin_id = '00000000-0000-0000-0000-000000000000';
set local sitomax.test_owner_email = 'REPLACE-OWNER-EMAIL';
set local sitomax.test_admin_email = 'REPLACE-ADMIN-EMAIL';

do $$
declare
  owner_id uuid := current_setting('sitomax.test_owner_id')::uuid;
  admin_id uuid := current_setting('sitomax.test_admin_id')::uuid;
  owner_email text := lower(current_setting('sitomax.test_owner_email'));
  admin_email text := lower(current_setting('sitomax.test_admin_email'));
  fixture record;
  fixture_ids constant uuid[] := array[
    '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000002',
    '63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000004',
    '63000000-0000-4000-8000-000000000005', '63000000-0000-4000-8000-000000000006'
  ]::uuid[];
begin
  if owner_id = admin_id or owner_id = '00000000-0000-0000-0000-000000000000'
    or admin_id = '00000000-0000-0000-0000-000000000000'
    or owner_email = 'replace-owner-email' or admin_email = 'replace-admin-email'
    or owner_email = admin_email then
    raise exception 'Set two distinct dedicated TEST user IDs and emails before cleanup.';
  end if;
  if (select count(*) from (values
      (owner_id, owner_email),
      (admin_id, admin_email)
    ) as expected(id, email)
    join auth.users u on u.id = expected.id and lower(u.email) = expected.email
    join public.profiles p on p.id = expected.id and lower(p.email) = expected.email
  ) <> 2 then
    raise exception 'Both dedicated TEST users must have the expected Auth and profile emails.';
  end if;
  if exists (
    select 1 from public.account_members
    where user_id in (owner_id, admin_id) and not (account_id = any(fixture_ids))
  ) then raise exception 'A TEST user belongs to a non-fixture account; review manually.'; end if;

  for fixture in select * from (values
    ('63000000-0000-4000-8000-000000000001'::uuid, 'TEST-PHASE1-Showcase A'),
    ('63000000-0000-4000-8000-000000000002'::uuid, 'TEST-PHASE1-Showcase B'),
    ('63000000-0000-4000-8000-000000000003'::uuid, 'TEST-PHASE1-Clarity A'),
    ('63000000-0000-4000-8000-000000000004'::uuid, 'TEST-PHASE1-Clarity B'),
    ('63000000-0000-4000-8000-000000000005'::uuid, 'TEST-PHASE1-Studio A'),
    ('63000000-0000-4000-8000-000000000006'::uuid, 'TEST-PHASE1-Studio B')
  ) as fixtures(id, name) loop
    if exists (select 1 from public.accounts where id = fixture.id
      and (name <> fixture.name or is_internal)) then
      raise exception 'A fixture account no longer has its expected identity.';
    end if;
    if exists (select 1 from public.account_members
      where account_id = fixture.id and (user_id <> owner_id or role <> 'owner')) then
      raise exception 'A fixture account contains unexpected members.';
    end if;
  end loop;
  if exists (
    select 1 from public.sites where account_id = any(fixture_ids)
      and (name is null or name not like 'TEST-%' or subdomain not like 'test-%'
        or template_key is null or template_key not in (
          'test-phase1-showcase', 'test-phase1-clarity', 'test-phase1-studio'))
  ) then raise exception 'A fixture account contains a site without all TEST markers.'; end if;
  if exists (
    select 1 from public.sites
    where template_key in ('test-phase1-showcase', 'test-phase1-clarity', 'test-phase1-studio')
      and not (account_id = any(fixture_ids))
  ) then raise exception 'A test template is referenced outside the fixture accounts.'; end if;
  if exists (
    select 1 from storage.objects o join public.sites s
      on split_part(o.name, '/', 1) = s.id::text
    where o.bucket_id = 'site-assets' and s.account_id = any(fixture_ids)
  ) then raise exception 'Remove the fixture sites'' uploads through the Storage API before cleanup.'; end if;
  if exists (
    select 1 from public.site_templates copied
    left join public.site_templates source on copied.id = 'test-phase1-' || source.id
      and source.id in ('showcase', 'clarity', 'studio')
    where copied.id in ('test-phase1-showcase', 'test-phase1-clarity', 'test-phase1-studio')
      and (source.id is null or copied.name is distinct from 'TEST-' || source.name
        or copied.description is distinct from source.description
        or copied.best_for is distinct from source.best_for
        or copied.preview_image is distinct from source.preview_image
        or copied.theme is distinct from source.theme
        or copied.business is distinct from source.business
        or copied.pages is distinct from source.pages
        or copied.is_active is distinct from true)
  ) then raise exception 'A test template differs from its master; review manually.'; end if;

  delete from public.accounts where id = any(fixture_ids);
  delete from public.site_templates
    where id in ('test-phase1-showcase', 'test-phase1-clarity', 'test-phase1-studio');
  update public.profiles set is_super_admin = false where id = admin_id;
end;
$$;
commit;
