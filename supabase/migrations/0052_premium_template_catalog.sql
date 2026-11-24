begin;

create table public.site_plans (
  plan_key text primary key check (plan_key ~ '^[a-z0-9][a-z0-9_-]{0,49}$'),
  site_limit integer not null check (site_limit >= 0),
  created_at timestamptz not null default now()
);

alter table public.site_plans enable row level security;
create policy "super admins manage site plans" on public.site_plans
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

insert into public.site_plans (plan_key, site_limit)
values ('starter', 1)
on conflict (plan_key) do nothing;

alter table public.accounts
  add column site_plan_key text not null default 'starter'
  references public.site_plans (plan_key);

create table public.site_templates (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,49}$'),
  name text not null check (length(trim(name)) between 1 and 100),
  description text not null check (length(trim(description)) between 1 and 300),
  best_for text[] not null default '{}',
  preview_image text not null,
  theme jsonb not null check (jsonb_typeof(theme) = 'object'),
  business jsonb not null check (jsonb_typeof(business) = 'object'),
  pages jsonb not null check (
    case when jsonb_typeof(pages) = 'array'
      then jsonb_array_length(pages) between 1 and 12
      else false
    end
  ),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.site_templates enable row level security;
create policy "authenticated users read site templates" on public.site_templates
  for select to authenticated using (true);
create policy "super admins manage site templates" on public.site_templates
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'template-assets',
  'template-assets',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "public read template assets" on storage.objects
  for select using (bucket_id = 'template-assets');
create policy "super admins upload template assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'template-assets' and public.is_super_admin());
create policy "super admins update template assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'template-assets' and public.is_super_admin())
  with check (bucket_id = 'template-assets' and public.is_super_admin());
create policy "super admins delete template assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'template-assets' and public.is_super_admin());

create or replace function public.create_template_site(
  p_account_id uuid,
  p_name text,
  p_subdomain text,
  p_template_key text,
  p_theme jsonb,
  p_pages jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  site_id uuid;
begin
  if jsonb_typeof(p_pages) is distinct from 'array'
    or jsonb_array_length(p_pages) not between 1 and 12 then
    raise exception 'A template must contain between one and twelve pages.';
  end if;
  insert into public.sites(account_id, name, subdomain, template_key, theme)
    values (p_account_id, p_name, p_subdomain, p_template_key, p_theme)
    returning id into site_id;
  insert into public.pages(site_id, title, slug, sort_order, draft_data, published_data, published_at, seo)
    select site_id, p.value->>'title', p.value->>'slug', (p.ordinality - 1)::integer,
      p.value->'data', p.value->'data', now(),
      jsonb_build_object('description', coalesce(p.value->'data'->'root'->'props'->>'description', ''))
    from jsonb_array_elements(p_pages) with ordinality as p(value, ordinality);
  return site_id;
end;
$$;

create function public.create_site_from_template(
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
  master public.site_templates%rowtype;
  new_site_id uuid;
  page jsonb;
  page_count integer;
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
    or p_subdomain = any(array[
      'app', 'www', 'api', 'admin', 'mail', 'email', 'smtp', 'help', 'support',
      'docs', 'blog', 'status', 'dashboard', 'login', 'auth', 'cdn', 'static',
      'assets', 'billing', 'dev', 'staging', 'test', 'ns1', 'ns2'
    ])
    or p_timezone is null or not exists (
      select 1 from pg_timezone_names where name = p_timezone
    ) then
    raise exception 'Invalid site details.' using errcode = '22023';
  end if;

  is_admin := public.is_super_admin();
  select a.is_internal, a.site_plan_key
    into account_internal, account_plan
    from public.accounts a
    where a.id = p_account_id;
  if not found or account_internal then
    raise exception 'Choose a client account.' using errcode = '22023';
  end if;
  if not is_admin and not exists (
    select 1 from public.account_members m
      where m.account_id = p_account_id and m.user_id = actor_id and m.role = 'owner'
  ) then
    raise exception 'You can create sites only for an account you own.' using errcode = '42501';
  end if;

  select t.* into master
    from public.site_templates t
    where t.id = p_template_id and t.is_active;
  if not found then
    raise exception 'This design is no longer available.' using errcode = '22023';
  end if;
  page_count := jsonb_array_length(master.pages);
  if page_count not between 1 and 12 then
    raise exception 'This design has an invalid page count.' using errcode = '22023';
  end if;

  if not is_admin then
    perform pg_advisory_xact_lock(hashtextextended('site-copy:' || p_account_id::text, 0));
    select p.site_limit into limit_for_plan
      from public.site_plans p
      where p.plan_key = account_plan;
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
    select item.value
      from jsonb_array_elements(master.pages) with ordinality as item(value, ordinality)
      order by item.ordinality
  loop
    page_slug := page->>'slug';
    if jsonb_typeof(page) is distinct from 'object'
      or jsonb_typeof(page->'data') is distinct from 'object'
      or jsonb_typeof(page->'data'->'content') is distinct from 'array'
      or jsonb_typeof(page->'data'->'root') is distinct from 'object'
      or page->>'title' is null
      or page_slug is null
      or (page_slug <> '' and page_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$') then
      raise exception 'This design contains an invalid page.' using errcode = '22023';
    end if;
    insert into public.pages(
      site_id, title, slug, nav_label, sort_order, draft_data, seo
    )
    values (
      new_site_id,
      page->>'title',
      page_slug,
      coalesce(nullif(page->>'nav_label', ''), page->>'title'),
      page_index,
      page->'data',
      jsonb_build_object('description', coalesce(page->'data'->'root'->'props'->>'description', ''))
    );
    page_index := page_index + 1;
  end loop;

  return new_site_id;
end;
$$;

revoke all on function public.create_site_from_template(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.create_site_from_template(uuid, text, text, text, text)
  to authenticated;

commit;
