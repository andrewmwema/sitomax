begin;

create function public.create_ai_template_site(
  p_account_id uuid, p_generation_id uuid, p_template_id text,
  p_site_name text, p_subdomain text, p_timezone text,
  p_business jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  parent public.ai_requests%rowtype;
  selected text;
  copied_site uuid;
  copied_header jsonb;
  copied_business jsonb;
  copied_pages jsonb;
  checkpoints jsonb;
  editor_page uuid;
  selected_count integer;
begin
  if actor is null or not public.valid_site_business(p_business)
    or p_business = '{}'::jsonb then
    raise exception 'Invalid template build.' using errcode = '22023';
  end if;
  select r.* into parent from public.ai_requests r
    where r.id = p_generation_id for update;
  if not found or parent.user_id is distinct from actor
    or parent.account_id is distinct from p_account_id or parent.status <> 'pending'
    or not parent.is_generation or parent.generation_id is not null
    or parent.site_id is not null or parent.checkpoint_open
    or not (public.is_super_admin() or public.is_account_owner(p_account_id)) then
    raise exception 'This build is unavailable.' using errcode = '42501';
  end if;
  select template_id into selected from public.ai_template_builds
    where generation_id = p_generation_id for update;
  if not found or selected is not null then
    raise exception 'This build is already being created.' using errcode = 'P0001';
  end if;

  selected_count := public.select_ai_template(actor, p_account_id, p_generation_id, p_template_id);
  copied_site := public.create_site_from_template(p_account_id, p_template_id, p_site_name, p_subdomain, p_timezone);
  select business, draft_header into strict copied_business, copied_header from public.sites where id = copied_site;
  select jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'draft', draft_data) order by sort_order, id)
    into copied_pages from public.pages where site_id = copied_site;
  if jsonb_array_length(copied_pages) is distinct from selected_count then
    raise exception 'The selected design changed. No site was created.' using errcode = '40001';
  end if;
  select id into strict editor_page from public.pages where site_id = copied_site and sort_order = 0;
  checkpoints := public.start_ai_template_checkpoints(
    actor, p_generation_id, copied_site, p_business, copied_business, copied_header, copied_pages
  );
  return jsonb_build_object('siteId', copied_site, 'editorPageId', editor_page,
    'pages', (select jsonb_agg(value || jsonb_build_object('title', p.title) order by entry.ordinality)
      from jsonb_array_elements(checkpoints) with ordinality entry(value, ordinality)
      join public.pages p on p.id::text = entry.value->>'pageId' and p.site_id = copied_site));
end;
$$;

revoke all on function public.create_ai_template_site(uuid, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_ai_template_site(uuid, uuid, text, text, text, text, jsonb)
  to authenticated;

commit;
