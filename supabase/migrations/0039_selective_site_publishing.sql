begin;

alter table public.blog_settings add column draft_settings jsonb
  check (draft_settings is null or jsonb_typeof(draft_settings) = 'object');

-- Blog defaults are staged through a validating RPC and become public only
-- when the site publisher explicitly promotes them.
revoke insert, update on public.blog_settings from authenticated;
revoke execute on function public.update_blog_site_timezone(uuid, text) from authenticated;

create or replace function public.publish_pending_site_theme()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.published_data is not null
    and current_setting('sitomax.publish_site_theme', true) = 'true' then
    update public.sites set theme = draft_theme, draft_theme = null
      where id = new.site_id and draft_theme is not null;
  end if;
  return new;
end;
$$;

create or replace function public.publish_pending_site_header()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.published_data is not null
    and current_setting('sitomax.publish_site_header', true) = 'true' then
    update public.sites set published_header = draft_header where id = new.site_id;
  end if;
  return new;
end;
$$;

create or replace function public.capture_page_version()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.published_data is null then return new; end if;
  insert into public.page_versions(page_id, data, published_at, theme, header)
    select new.id, new.published_data,
      greatest(clock_timestamp(), coalesce((select max(published_at) + interval '1 microsecond'
        from public.page_versions where page_id = new.id), '-infinity'::timestamptz)),
      coalesce(s.theme, '{}'::jsonb), s.published_header from public.sites s where s.id = new.site_id;
  delete from public.page_versions where page_id = new.id and id not in
    (select id from public.page_versions where page_id = new.id order by published_at desc limit 20);
  return new;
end;
$$;

create function public.save_draft_blog_settings(p_site_id uuid, p_settings jsonb)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cta_link text;
  blog_path text;
  post_count text;
  timezone_name text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.sites s where s.id = p_site_id
      and (public.is_super_admin() or public.is_account_member(s.account_id))
  ) then
    raise exception 'Site unavailable.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_settings) is distinct from 'object' then
    raise exception 'Invalid blog settings.' using errcode = '22023';
  end if;

  blog_path := p_settings->>'blog_path';
  post_count := p_settings->>'posts_per_page';
  timezone_name := p_settings->>'timezone';
  cta_link := p_settings->>'cta_link';
  if blog_path is null or length(blog_path) > 200
    or blog_path !~ '^(/[a-z0-9]+(-[a-z0-9]+)*)+$'
    or p_settings->>'index_layout' is null or p_settings->>'index_layout' not in ('grid', 'list', 'magazine')
    or p_settings->>'default_post_layout' is null
    or p_settings->>'default_post_layout' not in ('classic', 'wide', 'minimal')
    or jsonb_typeof(p_settings->'show_author') is distinct from 'boolean'
    or jsonb_typeof(p_settings->'show_date') is distinct from 'boolean'
    or jsonb_typeof(p_settings->'show_reading_time') is distinct from 'boolean'
    or jsonb_typeof(p_settings->'show_share_links') is distinct from 'boolean'
    or jsonb_typeof(p_settings->'show_in_menu') is distinct from 'boolean'
    or jsonb_typeof(p_settings->'noindex_tags') is distinct from 'boolean'
    or length(coalesce(p_settings->>'cta_text', '')) > 300
    or length(coalesce(p_settings->>'cta_button_text', '')) > 80
    or cta_link is null or length(cta_link) > 2048
    or (cta_link <> '' and cta_link !~* '^(https?://|mailto:|tel:)[^[:space:]]+$'
      and (left(cta_link, 1) <> '/' or left(cta_link, 2) = '//'))
    or timezone_name is null or not exists (select 1 from pg_timezone_names where name = timezone_name) then
    raise exception 'Invalid blog settings.' using errcode = '22023';
  end if;
  if post_count is null or post_count !~ '^[0-9]{1,3}$' then
    raise exception 'Invalid blog settings.' using errcode = '22023';
  end if;
  if post_count::integer not between 1 and 100 then
    raise exception 'Invalid blog settings.' using errcode = '22023';
  end if;

  insert into public.blog_settings(site_id, draft_settings)
    values (p_site_id, p_settings)
    on conflict (site_id) do update set draft_settings = excluded.draft_settings;
  return true;
end;
$$;
revoke all on function public.save_draft_blog_settings(uuid, jsonb) from public, anon;
grant execute on function public.save_draft_blog_settings(uuid, jsonb) to authenticated;

create function public.publish_site_changes(
  p_site_id uuid,
  p_page_ids uuid[],
  p_publish_header boolean,
  p_expected_header jsonb,
  p_publish_theme boolean,
  p_expected_theme jsonb,
  p_publish_blog_settings boolean,
  p_expected_blog_settings jsonb
) returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  site public.sites%rowtype;
  blog_draft jsonb;
  page_count bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_publish_header is null or p_publish_theme is null or p_publish_blog_settings is null then
    raise exception 'Invalid publishing selection.' using errcode = '22023';
  end if;
  select s.* into site from public.sites s
    where s.id = p_site_id and (public.is_super_admin() or public.is_account_member(s.account_id))
    for update;
  if not found then raise exception 'Site unavailable.' using errcode = '42501'; end if;

  if exists (
    select page_id from unnest(coalesce(p_page_ids, '{}'::uuid[])) as selected(page_id)
    group by page_id having page_id is null or count(*) > 1
  ) then
    raise exception 'Invalid page selection.' using errcode = '22023';
  end if;
  perform 1 from public.pages p
    where p.site_id = p_site_id and p.id = any(coalesce(p_page_ids, '{}'::uuid[]))
    for update;
  get diagnostics page_count = row_count;
  if page_count <> cardinality(coalesce(p_page_ids, '{}'::uuid[])) then
    raise exception 'A selected page is unavailable.' using errcode = '42501';
  end if;

  if p_publish_header then
    if site.draft_header is null or site.draft_header is distinct from p_expected_header then
      raise exception 'The site header changed in another editor. Reload before publishing.' using errcode = '40001';
    end if;
  end if;
  if p_publish_theme then
    if site.draft_theme is null or site.draft_theme is distinct from p_expected_theme then
      raise exception 'The site theme changed in another editor. Reload before publishing.' using errcode = '40001';
    end if;
  end if;
  if p_publish_blog_settings then
    select b.draft_settings into blog_draft from public.blog_settings b
      where b.site_id = p_site_id for update;
    if blog_draft is null or blog_draft is distinct from p_expected_blog_settings then
      raise exception 'Blog settings changed in another editor. Reload before publishing.' using errcode = '40001';
    end if;
  end if;
  if cardinality(coalesce(p_page_ids, '{}'::uuid[])) = 0
    and not p_publish_header and not p_publish_theme and not p_publish_blog_settings then
    raise exception 'Select at least one change to publish.' using errcode = '22023';
  end if;

  perform set_config('sitomax.publish_site_header', 'false', true);
  perform set_config('sitomax.publish_site_theme', 'false', true);

  if p_publish_header then
    update public.sites set published_header = draft_header where id = p_site_id;
  end if;
  if p_publish_theme then
    update public.sites set theme = draft_theme, draft_theme = null where id = p_site_id;
  end if;
  if p_publish_blog_settings then
    update public.blog_settings set
      blog_path = blog_draft->>'blog_path',
      posts_per_page = (blog_draft->>'posts_per_page')::integer,
      index_layout = blog_draft->>'index_layout',
      default_post_layout = blog_draft->>'default_post_layout',
      show_author = (blog_draft->>'show_author')::boolean,
      show_date = (blog_draft->>'show_date')::boolean,
      show_reading_time = (blog_draft->>'show_reading_time')::boolean,
      show_share_links = (blog_draft->>'show_share_links')::boolean,
      show_in_menu = (blog_draft->>'show_in_menu')::boolean,
      noindex_tags = (blog_draft->>'noindex_tags')::boolean,
      cta_text = coalesce(blog_draft->>'cta_text', ''),
      cta_button_text = coalesce(blog_draft->>'cta_button_text', ''),
      cta_link = coalesce(blog_draft->>'cta_link', ''),
      draft_settings = null
    where site_id = p_site_id;
    update public.sites set timezone = blog_draft->>'timezone' where id = p_site_id;
  end if;

  if cardinality(coalesce(p_page_ids, '{}'::uuid[])) > 0 then
    update public.pages p set
      published_data = p.draft_data,
      published_at = clock_timestamp(),
      title = coalesce(nullif(p.draft_data#>>'{root,props,title}', ''), p.title),
      seo = case
        when p.draft_data#>'{root,props,seoTitle}' is not null
          or p.draft_data#>'{root,props,title}' is not null
          or p.draft_data#>'{root,props,description}' is not null
          or p.draft_data#>'{root,props,socialImage}' is not null
          or p.draft_data#>'{root,props,indexing}' is not null
        then coalesce(p.seo, '{}'::jsonb)
          || case when p.draft_data#>'{root,props,seoTitle}' is not null
                    or p.draft_data#>'{root,props,title}' is not null
             then jsonb_build_object('title', coalesce(p.draft_data#>>'{root,props,seoTitle}',
               p.draft_data#>>'{root,props,title}')) else '{}'::jsonb end
          || case when p.draft_data#>'{root,props,description}' is not null
             then jsonb_build_object('description', p.draft_data#>>'{root,props,description}') else '{}'::jsonb end
          || case when p.draft_data#>'{root,props,socialImage}' is not null
             then jsonb_build_object('image', p.draft_data#>>'{root,props,socialImage}') else '{}'::jsonb end
          || case when p.draft_data#>'{root,props,indexing}' is not null
             then jsonb_build_object('noindex', case p.draft_data#>>'{root,props,indexing}'
               when 'inherit' then null else to_jsonb(p.draft_data#>>'{root,props,indexing}' = 'noindex') end)
             else '{}'::jsonb end
        else p.seo
      end
    where p.site_id = p_site_id and p.id = any(coalesce(p_page_ids, '{}'::uuid[]));
  end if;

  return true;
end;
$$;
revoke all on function public.publish_site_changes(uuid, uuid[], boolean, jsonb, boolean, jsonb, boolean, jsonb)
  from public, anon;
grant execute on function public.publish_site_changes(uuid, uuid[], boolean, jsonb, boolean, jsonb, boolean, jsonb)
  to authenticated;

commit;
