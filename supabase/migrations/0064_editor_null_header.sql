begin;

-- SQL NULL means the caller is not editing the shared header. A non-null
-- header still requires its expected baseline when it actually changes.
create or replace function public.save_page_with_header(
  p_page_id uuid, p_data jsonb, p_header jsonb, p_expected_header jsonb,
  p_publish boolean default false, p_title text default null, p_seo jsonb default null,
  p_snapshot boolean default false, p_theme jsonb default null, p_expected_theme jsonb default null
) returns uuid language plpgsql security definer
set search_path = public, pg_temp set lock_timeout = '3s' set statement_timeout = '10s' as $$
declare
  site public.sites%rowtype;
  page public.pages%rowtype;
  clean_data jsonb;
  expected text;
  replacement text;
  header_changed boolean;
begin
  if auth.uid() is null then raise exception 'Page unavailable.' using errcode = '42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data->'content') is distinct from 'array'
    or (p_header is not null and (jsonb_typeof(p_header) is distinct from 'object'
      or p_header->'version' is distinct from '1'::jsonb)) then
    raise exception 'Invalid draft or header.' using errcode = '22023';
  end if;

  select s.* into site from public.sites s join public.pages p on p.site_id = s.id
    where p.id = p_page_id and (public.is_super_admin() or public.is_account_member(s.account_id));
  if not found then raise exception 'Page unavailable.' using errcode = '42501'; end if;
  header_changed := p_header is not null and p_header is distinct from site.draft_header;
  if header_changed and p_expected_header is distinct from site.draft_header then
    raise exception 'The site header changed in another editor. Reload before saving.' using errcode = '40001';
  end if;
  if p_theme is not null and p_expected_theme is distinct from coalesce(site.draft_theme, site.theme, '{}'::jsonb) then
    raise exception 'The site theme changed in another editor. Reload before saving.' using errcode = '40001';
  end if;
  if header_changed or (p_theme is not null and p_theme is distinct from site.draft_theme) then
    update public.sites s set draft_header = coalesce(p_header, s.draft_header),
      draft_theme = case when p_theme is null then s.draft_theme else p_theme end
      where s.id = site.id and s.account_id = site.account_id
        and (public.is_super_admin() or public.is_account_member(s.account_id))
        and (p_header is null or s.draft_header is not distinct from site.draft_header)
        and (p_theme is null or (s.draft_theme is not distinct from site.draft_theme
          and s.theme is not distinct from site.theme))
        and ((p_header is not null and s.draft_header is distinct from p_header)
          or (p_theme is not null and s.draft_theme is distinct from p_theme));
    if not found then
      raise exception 'The site header or theme changed in another editor. Reload before saving.' using errcode = '40001';
    end if;
  end if;

  select p.* into page from public.pages p join public.sites s on s.id = p.site_id
    where p.id = p_page_id and p.site_id = site.id
      and (public.is_super_admin() or public.is_account_member(s.account_id))
    for update of p;
  if not found then raise exception 'Page unavailable.' using errcode = '42501'; end if;
  expected := p_data#>>'{root,props,__expectedPageVersion}';
  replacement := p_data#>>'{root,props,__nextPageVersion}';
  if expected is not null then
    if expected::uuid is distinct from page.draft_version then
      raise exception 'This page changed in another editor. Reload before saving.' using errcode = '40001';
    end if;
    if replacement is null then raise exception 'A replacement page version is required.' using errcode = '22023'; end if;
    perform replacement::uuid;
  end if;
  clean_data := p_data #- '{root,props,__expectedPageVersion}' #- '{root,props,__nextPageVersion}';
  if clean_data is distinct from page.draft_data then
    update public.pages set draft_data = p_data where id = page.id returning draft_version into page.draft_version;
  end if;
  if p_publish then
    update public.pages set published_data = p_data, published_at = clock_timestamp(),
      title = coalesce(p_title, title), seo = coalesce(p_seo, seo) where id = page.id
      returning draft_version into page.draft_version;
  elsif p_snapshot or header_changed then
    insert into public.page_versions(page_id, data, kind, theme, header)
      select page.id, p_data, case when p_snapshot then 'ai_edit' else 'header_edit' end,
        coalesce(p_theme, s.draft_theme, s.theme), s.draft_header
      from public.sites s where s.id = site.id;
    delete from public.page_versions where page_id = page.id and id not in
      (select id from public.page_versions where page_id = page.id order by published_at desc limit 20);
  end if;
  return page.draft_version;
end;
$$;

notify pgrst, 'reload schema';
commit;
