begin;

create function public.checkpoint_ai_template_logo(
  p_user_id uuid, p_account_id uuid, p_site_id uuid, p_generation_id uuid,
  p_path text, p_url text, p_alt text, p_expected_theme jsonb,
  p_expected_header jsonb, p_header jsonb
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  parent public.ai_requests%rowtype;
  site public.sites%rowtype;
  base_theme jsonb;
  original public.site_draft_versions%rowtype;
  started_at timestamptz;
begin
  if p_user_id is null or p_account_id is null or p_site_id is null or p_generation_id is null
    or p_path is null or p_path !~ ('^' || p_site_id::text || '/[A-Za-z0-9_-]+\.(jpg|png|gif|webp|avif)$')
    or p_url is null or length(p_url) > 2000 or p_url !~ '^https://[^[:space:]]+$'
    or p_alt is null or length(p_alt) > 500
    or jsonb_typeof(p_header) is distinct from 'object'
    or p_header->'version' is distinct from '1'::jsonb
    or p_header#>>'{logo,mode}' is distinct from 'image'
    or p_header#>>'{logo,image}' is distinct from p_url then
    raise exception 'Invalid logo details.' using errcode = '22023';
  end if;
  select r.* into parent from public.ai_requests r
    join public.ai_template_builds b on b.generation_id = r.id
    where r.id = p_generation_id and r.user_id = p_user_id and r.account_id = p_account_id
      and r.site_id = p_site_id and r.is_generation and r.generation_id is null
      and r.status <> 'failed' for update of r;
  if not found or (not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
    and not exists (select 1 from public.account_members where account_id = p_account_id
      and user_id = p_user_id and role = 'owner')) then
    raise exception 'This build is unavailable.' using errcode = '42501';
  end if;
  if parent.checkpoint_open or exists (select 1 from public.ai_requests
    where generation_id = parent.id and status = 'pending') then
    raise exception 'The build is still running or needs reconciliation.' using errcode = 'P0001';
  end if;
  select * into site from public.sites where id = p_site_id and account_id = p_account_id for update;
  if not found then raise exception 'This site is unavailable.' using errcode = '42501'; end if;
  base_theme := coalesce(site.draft_theme, site.theme, '{}'::jsonb);
  select b.started_at into started_at from public.ai_template_builds b where b.generation_id = parent.id;
  select v.* into original from public.site_draft_versions v
    where v.site_id = site.id and v.created_at <= started_at order by v.created_at, v.id limit 1;
  if not found or not original.header_captured
    or coalesce(site.draft_header#>>'{logo,mode}', 'text') is distinct from coalesce(original.header#>>'{logo,mode}', 'text')
    or coalesce(site.draft_header#>>'{logo,image}', '') is distinct from coalesce(original.header#>>'{logo,image}', '')
    or base_theme->>'logoUrl' is distinct from original.theme->>'logoUrl'
    or base_theme->>'logoAlt' is distinct from original.theme->>'logoAlt' then
    raise exception 'The site logo changed. No logo was applied.' using errcode = '40001';
  end if;
  if base_theme is distinct from p_expected_theme or site.draft_header is distinct from p_expected_header then
    raise exception 'The site theme or header changed. No logo was applied.' using errcode = '40001';
  end if;
  if jsonb_typeof(base_theme) is distinct from 'object'
    or not exists (select 1 from storage.objects where bucket_id = 'site-assets' and name = p_path) then
    raise exception 'The uploaded logo is unavailable.' using errcode = '22023';
  end if;
  perform 1 from public.pages where site_id = site.id order by id for update;
  insert into public.site_draft_versions(site_id, pages, theme)
    select site.id, coalesce(jsonb_agg(jsonb_build_object('id', id, 'draft_data', draft_data)), '[]'::jsonb), base_theme
    from public.pages where site_id = site.id;
  update public.sites set draft_theme = base_theme || jsonb_build_object('logoUrl', p_url, 'logoAlt', p_alt),
    draft_header = p_header where id = site.id;
end;
$$;

revoke all on function public.checkpoint_ai_template_logo(uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.checkpoint_ai_template_logo(uuid, uuid, uuid, uuid, text, text, text, jsonb, jsonb, jsonb)
  to service_role;

commit;
