-- REVIEW ONLY. Do not run until this seed is explicitly approved.
-- These two manually created users are dedicated to Phase 1 testing.
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
begin
  if owner_id = admin_id or owner_id = '00000000-0000-0000-0000-000000000000'
    or admin_id = '00000000-0000-0000-0000-000000000000'
    or owner_email = 'replace-owner-email' or admin_email = 'replace-admin-email'
    or owner_email = admin_email then
    raise exception 'Set two distinct dedicated TEST user IDs and emails before running this seed.';
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
    where user_id in (owner_id, admin_id)
      and account_id not in (
        '63000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000002',
        '63000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000004',
        '63000000-0000-4000-8000-000000000005', '63000000-0000-4000-8000-000000000006'
      )
  ) then raise exception 'TEST users must not be members of non-fixture accounts.'; end if;

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
      raise exception 'A fixture account ID is already in use.';
    end if;
    if exists (select 1 from public.account_members
      where account_id = fixture.id and (user_id <> owner_id or role <> 'owner')) then
      raise exception 'A fixture account contains unexpected members.';
    end if;
    insert into public.accounts(id, name) values (fixture.id, fixture.name)
      on conflict (id) do nothing;
    insert into public.account_members(account_id, user_id, role)
      values (fixture.id, owner_id, 'owner') on conflict (account_id, user_id) do nothing;
  end loop;

  if (select count(*) from public.site_templates
      where id in ('showcase', 'clarity', 'studio') and is_active) <> 3 then
    raise exception 'The three active master templates must already exist.';
  end if;
  insert into public.site_templates (
    id, name, description, best_for, preview_image, theme, business, pages, is_active
  )
  select 'test-phase1-' || id, 'TEST-' || name, description, best_for,
    preview_image, theme, business, pages, true
  from public.site_templates where id in ('showcase', 'clarity', 'studio')
  on conflict (id) do nothing;
  if exists (
    select 1 from public.site_templates source
    left join public.site_templates copied on copied.id = 'test-phase1-' || source.id
    where source.id in ('showcase', 'clarity', 'studio')
      and (copied.id is null or copied.name is distinct from 'TEST-' || source.name
        or copied.description is distinct from source.description
        or copied.best_for is distinct from source.best_for
        or copied.preview_image is distinct from source.preview_image
        or copied.theme is distinct from source.theme
        or copied.business is distinct from source.business
        or copied.pages is distinct from source.pages
        or copied.is_active is distinct from true)
  ) then raise exception 'A test template already exists with different content; no rows were overwritten.'; end if;

  update public.profiles set is_super_admin = true where id = admin_id;
end;
$$;
commit;
