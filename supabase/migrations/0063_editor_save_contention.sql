begin;

-- A no-op still checks the page token under a row lock. Return the token
-- actually stored, rather than the unused replacement supplied by the editor.
drop function public.save_page_with_header(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,boolean,jsonb,jsonb);
create function public.save_page_with_header(
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

  -- Read without a row lock. Only acquire one when an actual site value changes.
  select s.* into site from public.sites s join public.pages p on p.site_id = s.id
    where p.id = p_page_id and (public.is_super_admin() or public.is_account_member(s.account_id));
  if not found then raise exception 'Page unavailable.' using errcode = '42501'; end if;
  header_changed := p_header is distinct from site.draft_header;
  if header_changed and p_expected_header is distinct from site.draft_header then
    raise exception 'The site header changed in another editor. Reload before saving.' using errcode = '40001';
  end if;
  if p_theme is not null and p_expected_theme is distinct from coalesce(site.draft_theme, site.theme, '{}'::jsonb) then
    raise exception 'The site theme changed in another editor. Reload before saving.' using errcode = '40001';
  end if;
  if header_changed or (p_theme is not null and p_theme is distinct from site.draft_theme) then
    update public.sites s set draft_header = p_header,
      draft_theme = case when p_theme is null then s.draft_theme else p_theme end
      where s.id = site.id and s.account_id = site.account_id
        and (public.is_super_admin() or public.is_account_member(s.account_id))
        and s.draft_header is not distinct from site.draft_header
        and (p_theme is null or (s.draft_theme is not distinct from site.draft_theme
          and s.theme is not distinct from site.theme))
        and (s.draft_header is distinct from p_header
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
      values (page.id, p_data, case when p_snapshot then 'ai_edit' else 'header_edit' end,
        coalesce(p_theme, site.draft_theme, site.theme), p_header);
    delete from public.page_versions where page_id = page.id and id not in
      (select id from public.page_versions where page_id = page.id order by published_at desc limit 20);
  end if;
  return page.draft_version;
end;
$$;
revoke all on function public.save_page_with_header(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,boolean,jsonb,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_page_with_header(uuid,jsonb,jsonb,jsonb,boolean,text,jsonb,boolean,jsonb,jsonb)
  to authenticated;

drop function public.save_editor_ai_draft(uuid,jsonb,jsonb,boolean,jsonb);
create function public.save_editor_ai_draft(
  p_page_id uuid, p_data jsonb, p_theme jsonb default null, p_snapshot boolean default false, p_expected_theme jsonb default null
) returns uuid language plpgsql security definer
set search_path = public, pg_temp set lock_timeout = '3s' set statement_timeout = '10s' as $$
declare
  site public.sites%rowtype;
  page public.pages%rowtype;
  clean_data jsonb;
  expected text;
  replacement text;
begin
  if auth.uid() is null then raise exception 'Page unavailable.' using errcode = '42501'; end if;
  if jsonb_typeof(p_data) is distinct from 'object'
    or jsonb_typeof(p_data->'content') is distinct from 'array'
    or (p_theme is not null and jsonb_typeof(p_theme) <> 'object') then
    raise exception 'Invalid draft or theme.' using errcode = '22023';
  end if;
  select s.* into site from public.sites s join public.pages p on p.site_id = s.id
    where p.id = p_page_id and (public.is_super_admin() or public.is_account_member(s.account_id));
  if not found then raise exception 'Page unavailable.' using errcode = '42501'; end if;
  if p_theme is not null then
    if p_expected_theme is not null and p_expected_theme is distinct from coalesce(site.draft_theme, site.theme, '{}'::jsonb) then
      raise exception 'The site theme changed in another editor.' using errcode = '40001';
    end if;
    if p_theme is distinct from site.draft_theme then
      update public.sites s set draft_theme = p_theme where s.id = site.id and s.account_id = site.account_id
        and (public.is_super_admin() or public.is_account_member(s.account_id))
        and s.draft_theme is not distinct from site.draft_theme and s.theme is not distinct from site.theme
        and s.draft_theme is distinct from p_theme;
      if not found then raise exception 'The site theme changed in another editor.' using errcode = '40001'; end if;
    end if;
  end if;
  select p.* into page from public.pages p join public.sites s on s.id = p.site_id
    where p.id = p_page_id and p.site_id = site.id
      and (public.is_super_admin() or public.is_account_member(s.account_id)) for update of p;
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
  if p_snapshot then
    insert into public.page_versions(page_id, data, kind, theme, published_at)
      select page.id, p_data, 'ai_edit', p_theme,
        greatest(clock_timestamp(), coalesce(max(published_at) + interval '1 microsecond', '-infinity'::timestamptz))
      from public.page_versions where page_id = page.id;
    delete from public.page_versions where page_id = page.id and id not in (
      select id from public.page_versions where page_id = page.id order by published_at desc, id desc limit 20
    );
  end if;
  return page.draft_version;
end;
$$;
revoke all on function public.save_editor_ai_draft(uuid,jsonb,jsonb,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.save_editor_ai_draft(uuid,jsonb,jsonb,boolean,jsonb) to authenticated;

-- This trigger previously locked a site on every legacy Navigation page write,
-- even after both relevant headers had already been populated.
create or replace function public.extract_global_header()
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
    where id = new.site_id and (draft_header is null or (live_nav is not null and published_header is null));
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

create or replace function public.publish_pending_site_header()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.published_data is not null and current_setting('sitomax.publish_site_header', true) = 'true' then
    update public.sites set published_header = draft_header
      where id = new.site_id and published_header is distinct from draft_header;
  end if;
  return new;
end;
$$;

-- Preserve the RPC's success result for an already-saved theme.
create or replace function public.save_site_draft_theme(p_site_id uuid, p_theme jsonb)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(p_theme) is distinct from 'object' then raise exception 'Invalid theme.'; end if;
  update public.sites set draft_theme = p_theme
    where id = p_site_id and draft_theme is not null and draft_theme is distinct from p_theme
      and (public.is_super_admin() or public.is_account_member(account_id));
  if found then return true; end if;
  return exists (select 1 from public.sites where id = p_site_id and draft_theme = p_theme
    and (public.is_super_admin() or public.is_account_member(account_id)));
end;
$$;

-- Retain the legacy timezone RPC's permission/error contract even for a no-op.
-- Its execute privilege remains revoked from authenticated by migration 0039.
create or replace function public.update_blog_site_timezone(p_site_id uuid, p_timezone text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if length(p_timezone) not between 1 and 64 or not exists (
    select 1 from pg_timezone_names where name = p_timezone
  ) then
    raise exception 'A valid site timezone is required';
  end if;
  update public.sites set timezone = p_timezone
    where id = p_site_id and timezone is distinct from p_timezone
      and (public.is_super_admin() or public.is_account_member(account_id));
  if not found and not exists (
    select 1 from public.sites where id = p_site_id and timezone = p_timezone
      and (public.is_super_admin() or public.is_account_member(account_id))
  ) then
    raise exception 'You do not have permission to update this site timezone';
  end if;
end;
$$;

-- Keep the business CAS check even when the desired value is already stored.
create or replace function public.start_ai_draft_checkpoints(
  p_generation_id uuid, p_user_id uuid, p_site_id uuid, p_name text, p_subdomain text,
  p_theme jsonb, p_pages jsonb, p_business jsonb, p_expected_business jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare parent public.ai_requests%rowtype; existing_business jsonb;
begin
  select * into strict parent from public.ai_requests where id = p_generation_id for update;
  if parent.user_id <> p_user_id or parent.status <> 'pending' or not parent.is_generation
    or parent.generation_id is not null or parent.checkpoint_open
    or (parent.site_id is not null and parent.site_id <> p_site_id)
    or (not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
      and (parent.site_id is null or not exists (select 1 from public.account_members
        where account_id = parent.account_id and user_id = p_user_id and role = 'owner'))) then
    raise exception 'Account owner access required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_pages) is distinct from 'array' or exists (
    select 1 from jsonb_array_elements(p_pages) item
    where jsonb_typeof(item->'retrySpec') is distinct from 'object'
      or (item->'data' is not null and item->'data' <> 'null'::jsonb)
  ) then raise exception 'Invalid generation checkpoints.'; end if;
  update public.ai_requests set checkpoint_open = true where id = parent.id;
  if parent.site_id is null then
    return public.create_selected_ai_site(parent.account_id, p_name, p_subdomain, p_theme,
      p_pages, p_business, p_site_id, parent.id, p_user_id);
  end if;
  select business into existing_business from public.sites
    where id = p_site_id and account_id = parent.account_id for update;
  if not found or existing_business is distinct from p_expected_business then
    raise exception 'Business information changed. Reload and confirm the latest details before building.' using errcode = 'P0001';
  end if;
  update public.sites set business = p_business
    where id = p_site_id and account_id = parent.account_id and business is distinct from p_business;
  return public.apply_selected_ai_pages(p_site_id, p_pages, parent.id, p_user_id);
end;
$$;

create or replace function public.restore_ai_draft_version(p_site_id uuid, p_version_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare backup public.site_draft_versions%rowtype;
begin
  select v.* into strict backup from public.site_draft_versions v
    join public.sites s on s.id = v.site_id
    where v.id = p_version_id and s.id = p_site_id
      and (public.is_super_admin() or public.is_account_owner(s.account_id));
  perform 1 from public.sites where id = backup.site_id for update;
  perform 1 from public.pages where site_id = backup.site_id order by id for update;
  if exists (select 1 from jsonb_array_elements(backup.pages) p
    where not exists (select 1 from public.pages where id = (p->>'id')::uuid and site_id = backup.site_id)) then
    raise exception 'A backed-up page was deleted. Ask your agency to recover this version.';
  end if;
  insert into public.site_draft_versions(site_id, pages, theme)
    select backup.site_id, coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'draft_data', p.draft_data)), '[]'),
      (select coalesce(draft_theme, theme) from public.sites where id = backup.site_id)
    from public.pages p where site_id = backup.site_id;
  update public.pages p set draft_data = b.value->'draft_data',
      ai_pending_build = case when jsonb_typeof(b.value->'ai_pending_build') = 'boolean'
        then (b.value->>'ai_pending_build')::boolean else p.ai_pending_build end
    from jsonb_array_elements(backup.pages) b(value)
    where p.site_id = backup.site_id and p.id = (b.value->>'id')::uuid;
  update public.pages set draft_data = '{"content":[],"root":{}}', ai_pending_build = false
    where site_id = backup.site_id and id = any(backup.generated_page_ids)
      and not exists (select 1 from jsonb_array_elements(backup.pages) p where (p->>'id')::uuid = pages.id);
  update public.sites set draft_theme = backup.theme,
    draft_header = case when backup.header_captured or backup.header is not null
      then backup.header else draft_header end
    where id = backup.site_id and (draft_theme is distinct from backup.theme
      or ((backup.header_captured or backup.header is not null) and draft_header is distinct from backup.header));
end;
$$;

create or replace function public.start_ai_template_checkpoints(
  p_user_id uuid, p_generation_id uuid, p_site_id uuid, p_business jsonb, p_expected_business jsonb,
  p_expected_header jsonb, p_pages jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  parent public.ai_requests%rowtype;
  site public.sites%rowtype;
  selected text;
  page public.pages%rowtype;
  item jsonb;
  draft jsonb;
  retry_id uuid;
  result jsonb := '[]'::jsonb;
  cta_text text;
  new_header jsonb;
begin
  select * into strict parent from public.ai_requests where id = p_generation_id for update;
  select template_id into strict selected from public.ai_template_builds where generation_id = parent.id for update;
  if parent.user_id <> p_user_id or parent.status <> 'pending' or not parent.is_generation
    or parent.generation_id is not null or parent.site_id is not null or parent.checkpoint_open or selected is null
    or (not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
      and not exists (select 1 from public.account_members where account_id = parent.account_id
        and user_id = p_user_id and role = 'owner')) then
    raise exception 'This build is unavailable.' using errcode = '42501';
  end if;
  select * into site from public.sites where id = p_site_id and account_id = parent.account_id for update;
  if not found or site.template_key is distinct from selected or site.business is distinct from p_expected_business
    or site.draft_header is distinct from p_expected_header
    or site.published_header is not null or jsonb_typeof(p_business) is distinct from 'object' then
    raise exception 'The copied site changed. No AI drafts were prepared.' using errcode = '40001';
  end if;
  perform 1 from public.pages where site_id = site.id order by id for update;
  if jsonb_typeof(p_pages) is distinct from 'array' or jsonb_array_length(p_pages) not between 1 and 12
    or jsonb_array_length(p_pages) <> (select count(*) from public.pages where site_id = site.id)
    or exists (select 1 from public.pages where site_id = site.id and published_data is not null)
    or (select count(distinct value->>'id') from jsonb_array_elements(p_pages)) <> jsonb_array_length(p_pages)
    or exists (select 1 from jsonb_array_elements(p_pages) item
      where not exists (select 1 from public.pages p where p.site_id = site.id and p.id::text = item->>'id'
        and p.slug = item->>'slug' and p.draft_data is not distinct from item->'draft')) then
    raise exception 'The copied pages changed. No AI drafts were prepared.' using errcode = '40001';
  end if;

  insert into public.site_draft_versions(site_id, pages, theme, header)
    select site.id, jsonb_agg(jsonb_build_object('id', id, 'draft_data', draft_data)),
      coalesce(site.draft_theme, site.theme), site.draft_header
    from public.pages where site_id = site.id;
  cta_text := case p_business->>'primaryAction'
    when 'call' then 'Call us'
    when 'book' then 'Book now'
    when 'buy' then 'Shop now'
    when 'inquire' then 'Get in touch'
    else null
  end;
  new_header := case when site.draft_header is null then null
    when cta_text is null then jsonb_set(site.draft_header, '{logo,text}', to_jsonb(p_business->>'businessName'), true)
    else jsonb_set(jsonb_set(site.draft_header, '{logo,text}', to_jsonb(p_business->>'businessName'), true),
      '{cta,text}', to_jsonb(cta_text), true) end;
  update public.sites set business = p_business, draft_header = new_header
    where id = site.id and (business is distinct from p_business or draft_header is distinct from new_header);
  update public.ai_requests set site_id = site.id where id = parent.id or generation_id = parent.id;
  update public.ai_requests set checkpoint_open = true where id = parent.id;
  update public.ai_template_builds set started_at = clock_timestamp() where generation_id = parent.id;
  update public.ai_usage set site_id = site.id where request_id in
    (select id from public.ai_requests where generation_id = parent.id);

  for item in select value from jsonb_array_elements(p_pages) loop
    select * into strict page from public.pages where site_id = site.id and id::text = item->>'id';
    select jsonb_set(page.draft_data, '{content}', coalesce(jsonb_agg(
      case when block->>'type' = 'Footer' then
        jsonb_set(block, '{props}', coalesce(block->'props', '{}'::jsonb) || jsonb_build_object(
          'businessName', p_business->>'businessName', 'phone', p_business->>'phone',
          'email', p_business->>'email', 'address', p_business->>'address',
          'hours', p_business->>'openingHours', 'tagline', p_business->>'difference', 'socialLinks', '[]'::jsonb))
      else jsonb_set(block, '{props}', coalesce(block->'props', '{}'::jsonb) ||
        jsonb_build_object('__aiPending', '[Finish the AI build or replace this sample content]')) end
      order by ord), '[]'::jsonb))
      into draft from jsonb_array_elements(page.draft_data->'content') with ordinality as blocks(block, ord);
    update public.pages set draft_data = draft, ai_pending_build = true where id = page.id;
    insert into public.ai_page_retries(generation_id, page_id, expected_draft, sort_order, spec)
      values (parent.id, page.id, draft, page.sort_order,
        jsonb_build_object('build', jsonb_build_object('mode', 'template',
          'page', jsonb_build_object('slug', page.slug, 'title', page.title)), 'business', p_business - 'socialLinks'))
      returning id into retry_id;
    result := result || jsonb_build_array(jsonb_build_object('retryId', retry_id, 'pageId', page.id,
      'slug', page.slug, 'label', coalesce(page.nav_label, page.title), 'draft', draft));
  end loop;
  return result;
end;
$$;

create or replace function public.apply_selected_ai_pages(p_site_id uuid, p_pages jsonb, p_generation_id uuid, p_user_id uuid, p_theme jsonb default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  item jsonb; page public.pages%rowtype; previous_theme jsonb; backup_id uuid;
  page_ids uuid[] := '{}'; result jsonb := '[]'; last_order integer; built boolean; retry_id uuid;
  reservation public.ai_requests%rowtype;
begin
  select * into strict reservation from public.ai_requests where id = p_generation_id for update;
  if reservation.user_id <> p_user_id or reservation.status <> 'pending' or not reservation.is_generation
    or reservation.generation_id is not null or (reservation.site_id is not null and reservation.site_id <> p_site_id)
    or not exists (select 1 from public.sites where id = p_site_id and account_id = reservation.account_id)
    or (not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
      and (reservation.site_id is null or not exists (select 1 from public.account_members
        where account_id = reservation.account_id and user_id = p_user_id and role = 'owner'))) then
    raise exception 'Account owner access required.' using errcode = '42501';
  end if;
  select coalesce(draft_theme, theme) into strict previous_theme from public.sites where id = p_site_id for update;
  perform 1 from public.pages where site_id = p_site_id order by id for update;
  if jsonb_typeof(p_pages) is distinct from 'array' or jsonb_array_length(p_pages) not between 1 and 10
    or (select count(distinct value->>'slug') from jsonb_array_elements(p_pages)) <> jsonb_array_length(p_pages)
    or exists (select 1 from jsonb_array_elements(p_pages) where length(value->>'slug') > 60
      or (value->>'slug' <> '' and value->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
      or value->>'slug' in ('home','api','dashboard','login','signup','auth','invite','editor','forgot-password','set-password','s','_next','robots','sitemap','favicon')) then
    raise exception 'Invalid selected pages.';
  end if;
  insert into public.site_draft_versions(site_id, pages, theme)
    select p_site_id, coalesce(jsonb_agg(jsonb_build_object('id', id, 'draft_data', draft_data)), '[]'), previous_theme
    from public.pages where site_id = p_site_id returning id into backup_id;
  select coalesce(max(sort_order), -1) into last_order from public.pages where site_id = p_site_id;
  for item in select value from jsonb_array_elements(p_pages) loop
    built := coalesce(jsonb_typeof(item->'data') = 'object', false);
    retry_id := null;
    if nullif(btrim(item->>'nav_label'), '') is null or length(item->>'nav_label') > 40
      or (built and (case when jsonb_typeof(item->'data'->'content') = 'array'
        then jsonb_array_length(item->'data'->'content') < 2 else true end
        or nullif(btrim(item#>>'{data,root,props,seoTitle}'), '') is null
        or nullif(btrim(item#>>'{data,root,props,description}'), '') is null)) then
      raise exception 'Invalid generated draft.';
    end if;
    select * into page from public.pages where site_id = p_site_id and slug = item->>'slug';
    if (item->>'expectedId' is null and page.id is not null)
      or (item->>'expectedId' is not null and (page.id is distinct from (item->>'expectedId')::uuid
        or page.draft_data is distinct from item->'expectedDraft')) then
      result := result || jsonb_build_array(jsonb_build_object('slug', item->>'slug', 'pageId', page.id, 'built', false, 'conflict', true));
      continue;
    end if;
    last_order := last_order + 1;
    delete from public.ai_page_retries where page_id = page.id;
    if page.id is null then
      insert into public.pages(site_id, slug, title, nav_label, draft_data, sort_order, ai_pending_build)
        values (p_site_id, item->>'slug', item->>'title', item->>'nav_label', coalesce(nullif(item->'data', 'null'), '{}'), last_order, not built)
        returning * into page;
      page_ids := array_append(page_ids, page.id);
    elsif built then
      update public.pages set draft_data = item->'data', sort_order = last_order, ai_pending_build = false where id = page.id returning * into page;
      page_ids := array_append(page_ids, page.id);
    end if;
    if not built then
      insert into public.ai_page_retries(generation_id, page_id, expected_draft, sort_order, spec)
        values (p_generation_id, page.id, page.draft_data, last_order, item->'retrySpec') returning id into retry_id;
    end if;
    result := result || jsonb_build_array(jsonb_build_object('slug', page.slug, 'pageId', page.id, 'built', built, 'retryId', retry_id));
  end loop;
  update public.site_draft_versions set generated_page_ids = page_ids where id = backup_id;
  if p_theme is not null then
    update public.sites set draft_theme = p_theme where id = p_site_id and draft_theme is distinct from p_theme;
  end if;
  perform public.finish_ai_site_generation(p_generation_id, false, p_site_id);
  return result;
end;
$$;

create or replace function public.publish_site_changes(
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
    update public.sites set published_header = draft_header
      where id = p_site_id and published_header is distinct from draft_header;
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
    update public.sites set timezone = blog_draft->>'timezone'
      where id = p_site_id and timezone is distinct from blog_draft->>'timezone';
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

-- Bounded catalog selection deliberately includes all overloads of the reviewed
-- site writers and their outer entry points. Function-local statement_timeout
-- does not restart the outer statement timer; configure an outer timeout at the
-- API/database role too. lock_timeout bounds each wait inside these functions.
-- None of these functions opens a transaction or catches a timeout. An open or
-- aborted caller transaction may retain earlier locks until rollback/disconnect;
-- configure idle_in_transaction_session_timeout separately.
--
-- AI agent apply/undo retain their original writes and site FOR UPDATE because
-- their CAS checks and reversible item history are coupled to that lock; their
-- waits are bounded below. Legacy generation/copy, logo/color and publishing
-- theme paths also retain their existing writes and locks for checkpoint,
-- creation, history or draft-promotion semantics. No blanket sites trigger
-- suppresses updates: several writers use FOUND as a CAS/result signal.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any (array[
      'save_site_draft_theme', 'extract_global_header', 'publish_pending_site_header', 'publish_pending_site_theme',
      'update_blog_site_timezone', 'publish_site_changes', 'apply_generated_drafts',
      'apply_generated_drafts_selected', 'replace_ai_site_drafts', 'replace_ai_site_drafts_with_business',
      'create_ai_site', 'create_ai_site_with_business', 'apply_selected_ai_pages', 'create_selected_ai_site',
      'save_selected_ai_drafts', 'create_template_site', 'create_site_from_template',
      'start_ai_draft_checkpoints', 'checkpoint_ai_draft', 'restore_site_draft_version', 'restore_ai_draft_version',
      'apply_ai_agent_changes', 'undo_ai_agent_apply', 'start_ai_template_checkpoints',
      'create_ai_template_site', 'create_ai_template_site_with_colors', 'checkpoint_ai_template_logo'
    ])
  loop
    execute format('alter function %s set lock_timeout = %L', f.signature, '3s');
    execute format('alter function %s set statement_timeout = %L', f.signature, '10s');
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
