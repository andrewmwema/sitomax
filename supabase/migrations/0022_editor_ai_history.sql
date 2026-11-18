alter table public.page_versions
  add column kind text not null default 'published' check (kind in ('published', 'ai_edit')),
  add column theme jsonb;

create function public.save_editor_ai_draft(
  p_page_id uuid, p_data jsonb, p_theme jsonb default null, p_snapshot boolean default false, p_expected_theme jsonb default null
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_site uuid;
  previous_theme jsonb;
begin
  if auth.uid() is null or jsonb_typeof(p_data) is distinct from 'object'
    or jsonb_typeof(p_data->'content') is distinct from 'array'
    or (p_theme is not null and jsonb_typeof(p_theme) <> 'object') then
    return false;
  end if;
  select p.site_id into target_site
    from public.pages p join public.sites s on s.id = p.site_id
    where p.id = p_page_id and (public.is_super_admin() or public.is_account_member(s.account_id))
    for update of p;
  if target_site is null then return false; end if;

  if p_theme is not null then
    select coalesce(draft_theme, theme, '{}'::jsonb) into previous_theme
      from public.sites where id = target_site for update;
    if p_expected_theme is not null and p_expected_theme <> previous_theme then
      raise exception 'The site theme changed in another editor.' using errcode = '40001';
    end if;
    update public.sites set draft_theme = p_theme where id = target_site;
  end if;
  -- The existing embed guard still runs with the caller's auth.uid().
  update public.pages set draft_data = p_data where id = p_page_id;
  if p_snapshot then
    insert into public.page_versions(page_id, data, kind, theme, published_at)
      select p_page_id, p_data, 'ai_edit', p_theme,
        greatest(clock_timestamp(), coalesce(max(published_at) + interval '1 microsecond', '-infinity'::timestamptz))
      from public.page_versions where page_id = p_page_id;
    delete from public.page_versions where page_id = p_page_id and id not in (
      select id from public.page_versions where page_id = p_page_id order by published_at desc, id desc limit 20
    );
  end if;
  return true;
end;
$$;
revoke all on function public.save_editor_ai_draft(uuid, jsonb, jsonb, boolean, jsonb) from public, anon;
grant execute on function public.save_editor_ai_draft(uuid, jsonb, jsonb, boolean, jsonb) to authenticated;
