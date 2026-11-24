begin;

-- Keep this value synchronized with the platform's MARKETING_SITE_SUBDOMAIN.
create table public.site_creation_settings (
  singleton boolean primary key default true check (singleton),
  marketing_subdomain text not null check (
    length(marketing_subdomain) between 1 and 63
    and marketing_subdomain ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);
alter table public.site_creation_settings enable row level security;
create policy "super admins manage site creation settings" on public.site_creation_settings
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
revoke all on public.site_creation_settings from public, anon, authenticated;
grant select, insert, update, delete on public.site_creation_settings to authenticated;
grant all on public.site_creation_settings to service_role;
insert into public.site_creation_settings (singleton, marketing_subdomain)
values (true, 'sitomax');

insert into public.site_plans (plan_key, site_limit)
values ('growth', 1), ('premium', 1)
on conflict (plan_key) do nothing;

create or replace function public.create_site_from_template(
  p_account_id uuid,
  p_template_id text,
  p_site_name text,
  p_subdomain text,
  p_timezone text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  is_admin boolean;
  account_internal boolean;
  account_plan text;
  limit_for_plan integer;
  marketing_subdomain text;
  master public.site_templates%rowtype;
  new_site_id uuid;
  page jsonb;
  page_index integer := 0;
  page_slug text;
begin
  if actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_account_id is null or p_template_id is null
    or p_site_name is null or length(trim(p_site_name)) not between 1 and 100
    or p_subdomain is null or length(p_subdomain) > 63
    or p_subdomain !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_timezone is null or not exists (
      select 1 from pg_timezone_names where name = p_timezone
    ) then
    raise exception 'Invalid site details.' using errcode = '22023';
  end if;

  select s.marketing_subdomain into marketing_subdomain
    from public.site_creation_settings s where s.singleton;
  if not found then
    raise exception 'Site creation settings are not configured.' using errcode = '22023';
  end if;
  if p_subdomain = marketing_subdomain or p_subdomain = any(array[
    'app', 'www', 'api', 'admin', 'mail', 'email', 'smtp', 'help', 'support',
    'docs', 'blog', 'status', 'dashboard', 'login', 'auth', 'cdn', 'static',
    'assets', 'billing', 'dev', 'staging', 'test', 'ns1', 'ns2'
  ]) then
    raise exception 'This subdomain is reserved.' using errcode = '22023';
  end if;

  is_admin := public.is_super_admin();
  if not is_admin and not exists (
    select 1 from public.account_members m
      where m.account_id = p_account_id and m.user_id = actor_id and m.role = 'owner'
  ) then
    raise exception 'You can create sites only for an account you own.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('site-copy:' || p_account_id::text, 0));
  select a.is_internal, a.site_plan_key into account_internal, account_plan
    from public.accounts a where a.id = p_account_id;
  if not found or account_internal then
    raise exception 'Choose a client account.' using errcode = '22023';
  end if;

  select t.* into master from public.site_templates t
    where t.id = p_template_id and t.is_active;
  if not found then
    raise exception 'This design is no longer available.' using errcode = '22023';
  end if;
  if jsonb_typeof(master.pages) is distinct from 'array'
    or jsonb_array_length(master.pages) not between 1 and 12
    or master.pages->0->>'slug' is distinct from '' then
    raise exception 'This design has an invalid page list.' using errcode = '22023';
  end if;

  if not is_admin then
    select p.site_limit into limit_for_plan
      from public.site_plans p where p.plan_key = account_plan;
    if limit_for_plan is null then
      raise exception 'The account site plan is not configured.' using errcode = '22023';
    end if;
    if (select count(*) from public.sites s where s.account_id = p_account_id) >= limit_for_plan then
      raise exception 'SITE_LIMIT_REACHED' using errcode = 'P0001';
    end if;
  end if;

  insert into public.sites(account_id, name, subdomain, template_key, theme, business, timezone)
    values (p_account_id, trim(p_site_name), p_subdomain, master.id, master.theme, master.business, p_timezone)
    returning id into new_site_id;

  for page in
    select item.value from jsonb_array_elements(master.pages) with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    page_slug := page->>'slug';
    if jsonb_typeof(page) is distinct from 'object'
      or jsonb_typeof(page->'data') is distinct from 'object'
      or jsonb_typeof(page->'data'->'content') is distinct from 'array'
      or jsonb_typeof(page->'data'->'root') is distinct from 'object'
      or page->>'title' is null or length(trim(page->>'title')) not between 1 and 100
      or page_slug is null or length(page_slug) > 200
      or (page_slug <> '' and page_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$') then
      raise exception 'This design contains an invalid page.' using errcode = '22023';
    end if;
    insert into public.pages(site_id, title, slug, nav_label, sort_order, draft_data, seo)
    values (
      new_site_id, page->>'title', page_slug,
      coalesce(nullif(page->>'nav_label', ''), page->>'title'), page_index, page->'data',
      jsonb_build_object('description', coalesce(page->'data'->'root'->'props'->>'description', ''))
    );
    page_index := page_index + 1;
  end loop;

  return new_site_id;
end;
$$;

revoke all on function public.create_site_from_template(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_site_from_template(uuid, text, text, text, text) to authenticated;

commit;
