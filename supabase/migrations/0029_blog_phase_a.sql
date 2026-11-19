begin;

alter table public.sites
  add column timezone text not null default 'UTC'
    check (length(timezone) between 1 and 64);

create function public.update_blog_site_timezone(p_site_id uuid, p_timezone text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if length(p_timezone) not between 1 and 64 or not exists (
    select 1 from pg_timezone_names where name = p_timezone
  ) then
    raise exception 'A valid site timezone is required';
  end if;
  update public.sites
    set timezone = p_timezone
    where id = p_site_id
      and (public.is_super_admin() or public.is_account_member(account_id));
  if not found then
    raise exception 'You do not have permission to update this site timezone';
  end if;
end;
$$;
revoke all on function public.update_blog_site_timezone(uuid, text) from public, anon;
grant execute on function public.update_blog_site_timezone(uuid, text) to authenticated;

create function public.create_template_site(
  p_account_id uuid, p_name text, p_subdomain text, p_template_key text,
  p_theme jsonb, p_pages jsonb, p_timezone text
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  site_id uuid;
begin
  if jsonb_typeof(p_pages) is distinct from 'array' or jsonb_array_length(p_pages) <> 4 then
    raise exception 'A template must contain four pages';
  end if;
  if length(p_timezone) not between 1 and 64 then
    raise exception 'A valid site timezone is required';
  end if;
  insert into public.sites(account_id, name, subdomain, template_key, theme, timezone)
    values (p_account_id, p_name, p_subdomain, p_template_key, p_theme, p_timezone)
    returning id into site_id;
  insert into public.pages(site_id, title, slug, sort_order, draft_data, published_data, published_at, seo)
    select site_id, p.value->>'title', p.value->>'slug', (p.ordinality - 1)::integer,
      p.value->'data', p.value->'data', now(),
      jsonb_build_object('description', coalesce(p.value->'data'->'root'->'props'->>'description', ''))
    from jsonb_array_elements(p_pages) with ordinality as p(value, ordinality);
  return site_id;
end;
$$;
revoke all on function public.create_template_site(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_template_site(uuid, text, text, text, jsonb, jsonb, text) to service_role;

create table public.blog_authors (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  bio text not null default '' check (length(bio) <= 2000),
  photo text not null default '' check (length(photo) <= 2048),
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (site_id, user_id),
  unique (site_id, id)
);

create table public.post_categories (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  slug text not null check (length(slug) between 1 and 200 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check (length(description) <= 1000),
  created_at timestamptz not null default now(),
  unique (site_id, slug),
  unique (site_id, id)
);

create table public.post_tags (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null check (length(slug) between 1 and 160 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  unique (site_id, slug),
  unique (site_id, id)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  subtitle text not null default '' check (length(subtitle) <= 300),
  slug text not null check (length(slug) between 1 and 1000 and
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$'),
  excerpt text not null default '' check (length(excerpt) <= 500),
  draft_content jsonb not null default '{"version":1,"blocks":[]}'::jsonb
    check (jsonb_typeof(draft_content) = 'object' and draft_content->'version' = '1'::jsonb),
  published_content jsonb
    check (published_content is null or
      (jsonb_typeof(published_content) = 'object' and published_content->'version' = '1'::jsonb)),
  cover_image text not null default '' check (length(cover_image) <= 2048),
  cover_alt text not null default '' check (length(cover_alt) <= 500),
  thumbnail_image text not null default '' check (length(thumbnail_image) <= 2048),
  thumbnail_alt text not null default '' check (length(thumbnail_alt) <= 500),
  author_id uuid,
  category_id uuid,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  publish_at timestamptz,
  published_at timestamptz,
  has_unpublished_changes boolean not null default false,
  featured boolean not null default false,
  layout_override text check (layout_override is null or layout_override in ('classic', 'wide', 'minimal')),
  seo_title text not null default '' check (length(seo_title) <= 200),
  seo_description text not null default '' check (length(seo_description) <= 500),
  canonical_url text not null default '' check (length(canonical_url) <= 2048),
  noindex boolean not null default false,
  reading_minutes integer not null default 1 check (reading_minutes between 1 and 999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug),
  unique (site_id, id),
  foreign key (site_id, author_id) references public.blog_authors(site_id, id) on delete set null (author_id),
  foreign key (site_id, category_id) references public.post_categories(site_id, id) on delete set null (category_id)
);
create index posts_site_status_updated_idx on public.posts(site_id, status, updated_at desc);
create index posts_site_published_idx on public.posts(site_id, published_at desc)
  where status = 'published' and published_content is not null;

create table public.post_tag_links (
  site_id uuid not null references public.sites(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id uuid not null references public.post_tags(id) on delete cascade,
  primary key (post_id, tag_id),
  foreign key (site_id, post_id) references public.posts(site_id, id) on delete cascade,
  foreign key (site_id, tag_id) references public.post_tags(site_id, id) on delete cascade
);

create table public.post_redirects (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  from_slug text not null check (length(from_slug) between 1 and 1000 and
    from_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$'),
  to_post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (site_id, from_slug),
  foreign key (site_id, to_post_id) references public.posts(site_id, id) on delete cascade
);

create table public.blog_settings (
  site_id uuid primary key references public.sites(id) on delete cascade,
  blog_path text not null default '/blog' check (length(blog_path) between 1 and 200 and
    blog_path ~ '^(/[a-z0-9]+(-[a-z0-9]+)*)+$'),
  posts_per_page integer not null default 10 check (posts_per_page between 1 and 100),
  index_layout text not null default 'grid' check (index_layout in ('grid', 'list', 'magazine')),
  default_post_layout text not null default 'classic' check (default_post_layout in ('classic', 'wide', 'minimal')),
  show_author boolean not null default true,
  show_date boolean not null default true,
  show_reading_time boolean not null default true,
  show_share_links boolean not null default true,
  cta_text text not null default '' check (length(cta_text) <= 300),
  cta_button_text text not null default '' check (length(cta_button_text) <= 80),
  cta_link text not null default '' check (length(cta_link) <= 2048),
  updated_at timestamptz not null default now()
);

create table public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  draft_content jsonb not null,
  created_at timestamptz not null default now()
);
create index post_versions_post_created_idx on public.post_versions(post_id, created_at desc);

create function public.touch_blog_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_blog_updated_at() from public, anon, authenticated;

create trigger touch_posts_updated_at before update on public.posts
for each row execute function public.touch_blog_updated_at();
create trigger touch_blog_settings_updated_at before update on public.blog_settings
for each row execute function public.touch_blog_updated_at();

create function public.blog_slug_redirect()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.status = 'published' and old.published_content is not null and old.slug is distinct from new.slug then
    insert into public.post_redirects(site_id, from_slug, to_post_id)
      values (old.site_id, old.slug, old.id)
      on conflict (site_id, from_slug) do update set to_post_id = excluded.to_post_id;
  end if;
  return new;
end;
$$;
revoke all on function public.blog_slug_redirect() from public, anon, authenticated;
create trigger blog_slug_redirect_after_update after update of slug on public.posts
for each row execute function public.blog_slug_redirect();

create function public.capture_post_version()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.draft_content is distinct from new.draft_content then
    insert into public.post_versions(post_id, draft_content) values (old.id, old.draft_content);
    delete from public.post_versions where post_id = old.id and id not in
      (select id from public.post_versions where post_id = old.id order by created_at desc, id desc limit 20);
  end if;
  return new;
end;
$$;
revoke all on function public.capture_post_version() from public, anon, authenticated;
create trigger capture_post_version_before_update before update of draft_content on public.posts
for each row execute function public.capture_post_version();

alter table public.blog_authors enable row level security;
alter table public.post_categories enable row level security;
alter table public.post_tags enable row level security;
alter table public.posts enable row level security;
alter table public.post_tag_links enable row level security;
alter table public.post_redirects enable row level security;
alter table public.blog_settings enable row level security;
alter table public.post_versions enable row level security;

create policy "site members manage blog authors" on public.blog_authors for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)))
  with check (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)));
create policy "site members manage post categories" on public.post_categories for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)))
  with check (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)));
create policy "site members manage post tags" on public.post_tags for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)))
  with check (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)));
create policy "site members manage posts" on public.posts for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)))
  with check (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)));
create policy "site members manage post tag links" on public.post_tag_links for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)))
  with check (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)));
create policy "site members manage post redirects" on public.post_redirects for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)))
  with check (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)));
create policy "site members manage blog settings" on public.blog_settings for all to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)))
  with check (public.is_super_admin() or exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)));
create policy "site members read post versions" on public.post_versions for select to authenticated
  using (public.is_super_admin() or exists (
    select 1 from public.posts p join public.sites s on s.id = p.site_id
    where p.id = post_id and public.is_account_member(s.account_id)));

revoke all on public.blog_authors, public.post_categories, public.post_tags, public.posts,
  public.post_tag_links, public.post_redirects, public.blog_settings, public.post_versions
  from anon, authenticated;
grant select, insert, update, delete on public.blog_authors, public.post_categories, public.post_tags,
  public.posts, public.post_tag_links, public.post_redirects, public.blog_settings to authenticated;
grant select on public.post_versions to authenticated;
revoke all on public.blog_authors, public.post_categories, public.post_tags, public.posts,
  public.post_tag_links, public.post_redirects, public.blog_settings, public.post_versions from anon;

commit;
