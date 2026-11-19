begin;

alter table public.sites
  add column draft_header jsonb,
  add column published_header jsonb,
  add constraint draft_header_contract check (draft_header is null or
    (jsonb_typeof(draft_header) = 'object' and draft_header->'version' is not distinct from '1'::jsonb)),
  add constraint published_header_contract check (published_header is null or
    (jsonb_typeof(published_header) = 'object' and published_header->'version' is not distinct from '1'::jsonb));
-- Header writes use the permission-checked RPC below, not broader column grants.
alter table public.page_versions add column header jsonb;
alter table public.page_versions drop constraint page_versions_kind_check;
alter table public.page_versions add constraint page_versions_kind_check
  check (kind in ('published', 'ai_edit', 'header_edit', 'header_migration'));

create function public.header_from_navigation(p_props jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'version', 1,
    'logo', jsonb_build_object('text', left(coalesce(p_props->>'businessName', ''), 100),
      'href', coalesce(nullif(p_props->'brandLink', 'null'::jsonb), '"/"'::jsonb)),
    'menu', jsonb_build_object('source', 'pages'),
    'cta', jsonb_build_object('text', left(coalesce(p_props->>'buttonText', ''), 80),
      'href', coalesce(nullif(p_props->'buttonLink', 'null'::jsonb), '""'::jsonb)),
    'desktop', jsonb_build_object('layout', 'right', 'color',
      case when p_props->>'variant' = 'dark' then '#17202b' else '#ffffff' end,
      'textColor', case when p_props->>'variant' = 'dark' then '#ffffff' else '#17202b' end)
  );
$$;
revoke all on function public.header_from_navigation(jsonb) from public, anon, authenticated;

create function public.without_navigation(p_data jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(p_data->'content') = 'array'
    then jsonb_set(p_data, '{content}', coalesce(
      (select jsonb_agg(item order by ord) from jsonb_array_elements(p_data->'content') with ordinality as blocks(item, ord)
        where item->>'type' is distinct from 'Navigation'), '[]'::jsonb))
    else p_data end;
$$;
revoke all on function public.without_navigation(jsonb) from public, anon, authenticated;

-- Prefer Home, then page order/id. Draft and live sources are chosen separately.
update public.sites s set
  draft_header = (select public.header_from_navigation((block->'props') || jsonb_build_object('businessName',
      coalesce(nullif(s.business->>'businessName', ''), nullif(block#>>'{props,businessName}', '[Business name]'), s.name, '')))
    from public.pages p cross join lateral jsonb_array_elements(
      case when jsonb_typeof(p.draft_data->'content') = 'array' then p.draft_data->'content' else '[]'::jsonb end
    ) with ordinality as blocks(block, ord)
    where p.site_id = s.id and block->>'type' = 'Navigation'
    order by (p.slug = '') desc, p.sort_order, p.id, ord limit 1),
  published_header = (select public.header_from_navigation((block->'props') || jsonb_build_object('businessName',
      coalesce(nullif(s.business->>'businessName', ''), nullif(block#>>'{props,businessName}', '[Business name]'), s.name, '')))
    from public.pages p cross join lateral jsonb_array_elements(
      case when jsonb_typeof(p.published_data->'content') = 'array' then p.published_data->'content' else '[]'::jsonb end
    ) with ordinality as blocks(block, ord)
    where p.site_id = s.id and block->>'type' = 'Navigation'
    order by (p.slug = '') desc, p.sort_order, p.id, ord limit 1);

-- Snapshot untouched drafts before removing anything. Existing published history
-- is left intact; history can restore its original Navigation in compatibility mode.
insert into public.page_versions(page_id, data, kind, theme, header)
  select p.id, p.draft_data, 'header_migration', coalesce(s.draft_theme, s.theme),
    (select public.header_from_navigation((item->'props') || jsonb_build_object('businessName',
      coalesce(nullif(s.business->>'businessName', ''), nullif(item#>>'{props,businessName}', '[Business name]'), s.name, '')))
      from jsonb_array_elements(p.draft_data->'content') item where item->>'type' = 'Navigation' limit 1)
  from public.pages p join public.sites s on s.id = p.site_id
  where p.draft_data is distinct from public.without_navigation(p.draft_data);

alter table public.pages disable trigger capture_page_version;
alter table public.pages disable trigger publish_pending_site_theme;
update public.pages set draft_data = public.without_navigation(draft_data),
  published_data = public.without_navigation(published_data)
where draft_data is distinct from public.without_navigation(draft_data)
  or published_data is distinct from public.without_navigation(published_data);
alter table public.pages enable trigger capture_page_version;
alter table public.pages enable trigger publish_pending_site_theme;

-- Legacy templates and both AI generators still submit Navigation. Extract it
-- transactionally at the database boundary, including non-editor save paths.
create function public.extract_global_header()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare draft_nav jsonb; live_nav jsonb;
begin
  select item->'props' into draft_nav from jsonb_array_elements(
    case when jsonb_typeof(new.draft_data->'content') = 'array' then new.draft_data->'content' else '[]'::jsonb end
  ) item where item->>'type' = 'Navigation' limit 1;
  select item->'props' into live_nav from jsonb_array_elements(
    case when jsonb_typeof(new.published_data->'content') = 'array' then new.published_data->'content' else '[]'::jsonb end
  ) item where item->>'type' = 'Navigation' limit 1;
  if new.draft_data#>>'{root,props,__legacyNavigation}' = 'true' then draft_nav := null; end if;
  if new.published_data#>>'{root,props,__legacyNavigation}' = 'true' then live_nav := null; end if;
  if draft_nav is not null or live_nav is not null then
    update public.sites set
      draft_header = coalesce(draft_header, public.header_from_navigation(coalesce(draft_nav, live_nav) ||
        jsonb_build_object('businessName', coalesce(nullif(business->>'businessName', ''),
          nullif(coalesce(draft_nav, live_nav)->>'businessName', '[Business name]'), name, '')))),
      published_header = case when live_nav is not null
        then coalesce(published_header, public.header_from_navigation(live_nav || jsonb_build_object('businessName',
          coalesce(nullif(business->>'businessName', ''), nullif(live_nav->>'businessName', '[Business name]'), name, '')))) else published_header end
    where id = new.site_id;
    if new.draft_data#>>'{root,props,__legacyNavigation}' is distinct from 'true' then
      new.draft_data := public.without_navigation(new.draft_data);
    end if;
    if new.published_data#>>'{root,props,__legacyNavigation}' is distinct from 'true' then
      new.published_data := public.without_navigation(new.published_data);
    end if;
  end if;
  new.draft_data := new.draft_data #- '{root,props,__editorHeader}' #- '{root,props,__expectedHeader}';
  new.published_data := new.published_data #- '{root,props,__editorHeader}' #- '{root,props,__expectedHeader}';
  return new;
end;
$$;
revoke all on function public.extract_global_header() from public, anon, authenticated;
create trigger extract_global_header before insert or update of draft_data, published_data on public.pages
for each row execute function public.extract_global_header();

create function public.publish_pending_site_header()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.published_data is not null then
    update public.sites set published_header = draft_header where id = new.site_id;
  end if;
  return new;
end;
$$;
revoke all on function public.publish_pending_site_header() from public, anon, authenticated;
create trigger publish_pending_site_header after insert or update of published_data on public.pages
for each row execute function public.publish_pending_site_header();

create or replace function public.capture_page_version()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.published_data is null then return new; end if;
  insert into public.page_versions(page_id, data, published_at, theme, header)
    select new.id, new.published_data,
      greatest(clock_timestamp(), coalesce((select max(published_at) + interval '1 microsecond'
        from public.page_versions where page_id = new.id), '-infinity'::timestamptz)),
      coalesce(s.draft_theme, s.theme), s.draft_header from public.sites s where s.id = new.site_id;
  delete from public.page_versions where page_id = new.id and id not in
    (select id from public.page_versions where page_id = new.id order by published_at desc limit 20);
  return new;
end;
$$;

create function public.save_page_with_header(
  p_page_id uuid, p_data jsonb, p_header jsonb, p_expected_header jsonb,
  p_publish boolean default false, p_title text default null, p_seo jsonb default null,
  p_snapshot boolean default false, p_theme jsonb default null, p_expected_theme jsonb default null
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare target_site uuid; site public.sites%rowtype; header_changed boolean;
begin
  select p.site_id into target_site from public.pages p join public.sites s on s.id = p.site_id
    where p.id = p_page_id and (public.is_super_admin() or public.is_account_member(s.account_id));
  if auth.uid() is null or target_site is null then
    raise exception 'Page unavailable.' using errcode = '42501';
  end if;
  select * into strict site from public.sites where id = target_site for update;
  perform 1 from public.pages where id = p_page_id and site_id = target_site for update;
  if not found then raise exception 'Page unavailable.' using errcode = '42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data->'content') is distinct from 'array'
    or (p_header is not null and (jsonb_typeof(p_header) is distinct from 'object' or p_header->'version' is distinct from '1'::jsonb)) then
    raise exception 'Invalid draft or header.' using errcode = '22023';
  end if;
  header_changed := p_header is distinct from site.draft_header;
  if header_changed and p_expected_header is distinct from site.draft_header then
    raise exception 'The site header changed in another editor. Reload before saving.' using errcode = '40001';
  end if;
  if p_theme is not null then
    if p_expected_theme is distinct from coalesce(site.draft_theme, site.theme, '{}'::jsonb) then
      raise exception 'The site theme changed in another editor. Reload before saving.' using errcode = '40001';
    end if;
    update public.sites set draft_theme = p_theme where id = target_site;
  end if;
  update public.sites set draft_header = p_header where id = target_site;
  update public.pages set draft_data = p_data,
    title = case when p_publish then coalesce(p_title, title) else title end,
    seo = case when p_publish then coalesce(p_seo, seo) else seo end
    where id = p_page_id;
  if p_publish then
    update public.pages set published_data = p_data, published_at = clock_timestamp() where id = p_page_id;
  elsif p_snapshot or header_changed then
    insert into public.page_versions(page_id, data, kind, theme, header)
      values (p_page_id, p_data, case when p_snapshot then 'ai_edit' else 'header_edit' end,
        coalesce(p_theme, site.draft_theme, site.theme), p_header);
    delete from public.page_versions where page_id = p_page_id and id not in
      (select id from public.page_versions where page_id = p_page_id order by published_at desc limit 20);
  end if;
end;
$$;
revoke all on function public.save_page_with_header(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,boolean,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_page_with_header(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,boolean,jsonb,jsonb)
  to authenticated;

commit;
