-- REVIEW ONLY. Do not execute without explicit approval.
-- Creates six isolated accounts and does not change either user's privileges.
begin;

do $$
declare
  client_id uuid;
  agency_id uuid;
  fixture record;
begin
  if (select count(*) from auth.users u join public.profiles p on p.id = u.id
      where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com')
        and lower(p.email) = lower(u.email)) <> 2 then
    raise exception 'Both existing test users must have matching Auth and profile emails.';
  end if;
  if (select count(*) from auth.users u join public.profiles p on p.id = u.id
      where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com')
        and lower(p.email) = lower(u.email) and p.is_super_admin) <> 1 then
    raise exception 'Exactly one test user must already be a super admin. No privileges were changed.';
  end if;
  select p.id into strict client_id from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com')
      and lower(p.email) = lower(u.email) and not p.is_super_admin;
  select p.id into strict agency_id from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com')
      and lower(p.email) = lower(u.email) and p.is_super_admin;
  if client_id = agency_id then raise exception 'The two test users must be distinct.'; end if;
  if (select count(*) from public.site_templates where id in ('showcase', 'clarity', 'studio') and is_active) <> 3 then
    raise exception 'The three active master templates must already exist.';
  end if;
  if (select count(*) from public.site_plans where plan_key in ('starter', 'growth', 'premium')) <> 3 then
    raise exception 'The three site plans must already exist.';
  end if;

  for fixture in select * from (values
    ('64000000-0000-4000-8000-000000000001'::uuid, 'TEST-PHASE2-Showcase-Client', 'starter'),
    ('64000000-0000-4000-8000-000000000002'::uuid, 'TEST-PHASE2-Showcase-Agency', 'starter'),
    ('64000000-0000-4000-8000-000000000003'::uuid, 'TEST-PHASE2-Clarity-Client', 'growth'),
    ('64000000-0000-4000-8000-000000000004'::uuid, 'TEST-PHASE2-Clarity-Agency', 'growth'),
    ('64000000-0000-4000-8000-000000000005'::uuid, 'TEST-PHASE2-Studio-Client', 'premium'),
    ('64000000-0000-4000-8000-000000000006'::uuid, 'TEST-PHASE2-Studio-Agency', 'premium')
  ) as fixtures(id, name, plan_key) loop
    if exists (select 1 from public.accounts where id = fixture.id or name = fixture.name) then
      raise exception 'A Phase 2 fixture account ID or name already exists; review it before proceeding.';
    end if;
    insert into public.accounts(id, name, site_plan_key) values (fixture.id, fixture.name, fixture.plan_key);
    insert into public.account_members(account_id, user_id, role) values (fixture.id, client_id, 'owner');
  end loop;
end;
$$;
commit;
