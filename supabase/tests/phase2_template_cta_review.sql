-- REVIEW ONLY. Obtain separate approval before running, after 0054-0056 and
-- the Phase 2 fixtures. This rolls back all TEST-account writes; no AI calls.
begin;

do $$
declare
  fixture_account constant uuid := '64000000-0000-4000-8000-000000000001';
  client_id uuid;
  generation_id uuid;
  fixture_site uuid;
  site public.sites%rowtype;
  pages jsonb;
  business jsonb;
  original_cta text;
  actual_header jsonb;
  sample record;
begin
  select p.id into strict client_id from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) in ('support@sitomax.com', 'hello@sitomax.com')
      and lower(p.email) = lower(u.email) and not p.is_super_admin;
  if not exists (select 1 from public.accounts a
    join public.account_members m on m.account_id = a.id and m.user_id = client_id and m.role = 'owner'
    where a.id = fixture_account and a.name = 'TEST-PHASE2-Showcase-Client'
      and a.site_plan_key = 'starter' and not a.is_internal)
    or exists (select 1 from public.sites s where s.account_id = fixture_account)
    or exists (select 1 from public.ai_requests r where r.account_id = fixture_account) then
    raise exception 'The TEST fixture must exist and have no sites or AI requests.';
  end if;
  perform set_config('request.jwt.claim.sub', client_id::text, true);

  for sample in select * from (values
    (null::text, null::text), ('call', 'Call us'), ('book', 'Book now'),
    ('buy', 'Shop now'), ('inquire', 'Get in touch')
  ) as cases(action, expected) loop
    begin
      update public.ai_limits set extra_credits = 50 where ai_limits.account_id = fixture_account;
      if not found then raise exception 'The TEST fixture has no limits.'; end if;
      generation_id := public.begin_ai_template_build(client_id, fixture_account, 'TEST-model');
      perform public.select_ai_template(client_id, fixture_account, generation_id, 'showcase');
      fixture_site := public.create_site_from_template(fixture_account, 'showcase', 'TEST-PHASE2-CTA', 'test-phase2-cta', 'UTC');
      select * into strict site from public.sites where id = fixture_site;
      if site.draft_header is null or site.draft_header#>>'{cta,text}' is null then
        raise exception 'The Showcase fixture must have a template header CTA.';
      end if;
      original_cta := site.draft_header#>>'{cta,text}';
      business := site.business - 'primaryAction';
      if sample.action is not null then business := jsonb_set(business, '{primaryAction}', to_jsonb(sample.action)); end if;
      select jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'draft', p.draft_data))
        into pages from public.pages p where p.site_id = fixture_site;
      perform public.start_ai_template_checkpoints(client_id, generation_id, fixture_site, business,
        site.business, site.draft_header, pages);
      select draft_header into strict actual_header from public.sites where id = fixture_site;
      if actual_header#>>'{cta,text}' is distinct from coalesce(sample.expected, original_cta)
        or actual_header#>'{cta,href}' is distinct from site.draft_header#>'{cta,href}' then
        raise exception 'Incorrect template CTA for action %.', coalesce(sample.action, '(absent)');
      end if;
      raise sqlstate 'P1234' using message = 'Rollback this CTA case.';
    exception when sqlstate 'P1234' then null;
    end;
  end loop;
end;
$$;

rollback;
