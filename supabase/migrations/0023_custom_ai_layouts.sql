create function public.apply_generated_drafts_selected(p_site_id uuid, p_theme jsonb, p_pages jsonb, p_backup boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  backup_id uuid;
  page jsonb;
  home_id uuid;
  page_id uuid;
  page_ids uuid[] := '{}';
  previous_theme jsonb;
begin
  select coalesce(draft_theme, theme) into strict previous_theme
    from public.sites where id = p_site_id for update;
  perform 1 from public.pages where site_id = p_site_id order by id for update;
  if jsonb_typeof(p_pages) is distinct from 'array' then
    raise exception 'Invalid generated pages.';
  end if;
  if jsonb_array_length(p_pages) not between 1 and 4
    or (select count(distinct value->>'slug') from jsonb_array_elements(p_pages)) <> jsonb_array_length(p_pages)
    or not exists (select 1 from jsonb_array_elements(p_pages) where value->>'slug' = '')
    or exists (select 1 from jsonb_array_elements(p_pages) where value->>'slug' not in ('', 'about', 'services', 'contact')
      or jsonb_typeof(value->'data'->'content') is distinct from 'array') then
    raise exception 'Invalid generated pages.';
  end if;
  if p_backup then
    insert into public.site_draft_versions(site_id, pages, theme)
      select p_site_id, coalesce(jsonb_agg(jsonb_build_object('id', id, 'draft_data', draft_data)), '[]'), previous_theme
      from public.pages where site_id = p_site_id returning id into backup_id;
  end if;
  for page in select value from jsonb_array_elements(p_pages) loop
    insert into public.pages(site_id, slug, title, draft_data, sort_order)
      values (p_site_id, page->>'slug', page->>'title', page->'data',
        case page->>'slug' when '' then 0 when 'about' then 1 when 'services' then 2 else 3 end)
      on conflict (site_id, slug) do update set draft_data = excluded.draft_data
      returning id into page_id;
    page_ids := array_append(page_ids, page_id);
    if page->>'slug' = '' then home_id := page_id; end if;
  end loop;
  update public.sites set draft_theme = p_theme where id = p_site_id;
  if backup_id is not null then
    update public.site_draft_versions set generated_page_ids = page_ids where id = backup_id;
  end if;
  return home_id;
end;
$$;
revoke all on function public.apply_generated_drafts_selected(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.apply_generated_drafts_selected(uuid, jsonb, jsonb, boolean) to service_role;

create or replace function public.replace_ai_site_drafts_with_business(
  p_site_id uuid, p_theme jsonb, p_pages jsonb, p_business jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare home_id uuid;
begin
  if not exists (select 1 from public.sites where id = p_site_id
    and (public.is_super_admin() or public.is_account_owner(account_id))) then
    raise exception 'Account owner access required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_business) is distinct from 'object' then
    raise exception 'Invalid business information.';
  end if;
  home_id := public.apply_generated_drafts_selected(p_site_id, p_theme, p_pages, true);
  update public.sites set business = p_business where id = p_site_id;
  return home_id;
end;
$$;
revoke all on function public.replace_ai_site_drafts_with_business(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.replace_ai_site_drafts_with_business(uuid, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.create_ai_site_with_business(
  p_account_id uuid, p_name text, p_subdomain text, p_theme jsonb, p_pages jsonb,
  p_business jsonb, p_site_id uuid default gen_random_uuid()
) returns table(site_id uuid, page_id uuid)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare new_site uuid; home_id uuid;
begin
  if jsonb_typeof(p_business) is distinct from 'object' then
    raise exception 'Invalid business information.';
  end if;
  insert into public.sites(id, account_id, name, subdomain, template_key)
    values (p_site_id, p_account_id, p_name, p_subdomain, 'ai')
    returning id into new_site;
  home_id := public.apply_generated_drafts_selected(new_site, p_theme, p_pages, false);
  update public.sites set business = p_business where id = new_site;
  return query select new_site, home_id;
end;
$$;
revoke all on function public.create_ai_site_with_business(uuid, text, text, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_ai_site_with_business(uuid, text, text, jsonb, jsonb, jsonb, uuid) to service_role;
