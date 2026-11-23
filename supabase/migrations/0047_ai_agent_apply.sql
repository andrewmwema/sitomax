begin;

-- One row per AI agent apply. It is the site's AI history entry: what was
-- applied, who applied or undid it and when. Rows are written only by the
-- security-definer functions below.
create table public.ai_agent_applies (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  run_id uuid references public.ai_agent_runs(id) on delete set null,
  summary text not null check (length(summary) between 1 and 200),
  -- Applied changes and the item keys each one touched: [{id, label, items}].
  changes jsonb not null check (jsonb_typeof(changes) = 'array'),
  applied_by uuid references public.profiles(id) on delete set null,
  applied_by_name text not null,
  applied_at timestamptz not null default clock_timestamp(),
  undone_by uuid references public.profiles(id) on delete set null,
  undone_by_name text,
  undone_at timestamptz,
  undo_result jsonb check (undo_result is null or jsonb_typeof(undo_result) = 'object')
);
create unique index ai_agent_applies_run on public.ai_agent_applies(run_id) where run_id is not null;
create index ai_agent_applies_site_date on public.ai_agent_applies(site_id, applied_at desc);

-- What each apply wrote, per draft surface, so a site-wide undo can restore it.
create table public.ai_agent_apply_items (
  apply_id uuid not null references public.ai_agent_applies(id) on delete cascade,
  item_key text not null,
  kind text not null check (kind in ('theme', 'header', 'page', 'page_created', 'post', 'post_created')),
  target_id uuid,
  label text not null check (length(label) <= 300),
  -- The state to restore, and the state the apply left behind. An item counts
  -- as edited once the stored draft no longer equals "after".
  before jsonb,
  after jsonb,
  outcome text check (outcome in ('undone', 'edited', 'published', 'restricted')),
  primary key (apply_id, item_key)
);

alter table public.ai_agent_applies enable row level security;
alter table public.ai_agent_apply_items enable row level security;
create policy "site members read AI agent applies" on public.ai_agent_applies
  for select to authenticated
  using (exists (
    select 1 from public.sites s where s.id = site_id
      and (public.is_super_admin() or public.is_account_member(s.account_id))
  ));
create policy "site members read AI agent apply items" on public.ai_agent_apply_items
  for select to authenticated
  using (exists (
    select 1 from public.ai_agent_applies a join public.sites s on s.id = a.site_id
    where a.id = apply_id and (public.is_super_admin() or public.is_account_member(s.account_id))
  ));
revoke all on public.ai_agent_applies, public.ai_agent_apply_items from anon, authenticated;
grant select on public.ai_agent_applies, public.ai_agent_apply_items to authenticated;
grant all on public.ai_agent_applies, public.ai_agent_apply_items to service_role;

-- Writes the kept changes of one agent run to drafts in a single transaction.
-- Every item carries the value or token the caller planned against, so a
-- concurrent edit aborts the whole apply instead of being overwritten.
-- Published content is never written.
create function public.apply_ai_agent_changes(p_run_id uuid, p_summary text, p_changes jsonb, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  actor_name text;
  site public.sites%rowtype;
  new_apply uuid;
  item jsonb;
  item_kind text;
  target uuid;
  page public.pages%rowtype;
  post public.posts%rowtype;
  settings jsonb;
  fields jsonb;
  before_state jsonb;
  after_state jsonb;
begin
  if actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  -- Threads are private, so only the person who ran the agent can apply its changes.
  select s.* into site from public.ai_agent_runs r
    join public.ai_agent_threads t on t.id = r.thread_id
    join public.sites s on s.id = t.site_id
    where r.id = p_run_id and t.user_id = actor and r.status in ('completed', 'stopped', 'failed')
      and (public.is_super_admin() or public.is_account_member(s.account_id))
    for update of s;
  if not found then raise exception 'These AI changes are unavailable.' using errcode = '42501'; end if;
  if exists (select 1 from public.ai_agent_applies where run_id = p_run_id) then
    raise exception 'These AI changes were already applied.' using errcode = 'P0001';
  end if;
  if p_summary is null or length(btrim(p_summary)) not between 1 and 200
    or jsonb_typeof(p_changes) is distinct from 'array' or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'Invalid AI changes.' using errcode = '22023';
  end if;
  perform 1 from public.pages where site_id = site.id order by id for update;

  select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), '')) into actor_name
    from public.profiles p where p.id = actor;
  insert into public.ai_agent_applies(site_id, run_id, summary, changes, applied_by, applied_by_name)
    values (site.id, p_run_id, btrim(p_summary), p_changes, actor, coalesce(actor_name, 'Team member'))
    returning id into new_apply;

  for item in select value from jsonb_array_elements(p_items) loop
    item_kind := item->>'kind';
    target := (item->>'target_id')::uuid;
    before_state := null; after_state := null;

    if item_kind = 'theme' then
      if jsonb_typeof(item->'after') is distinct from 'object' then
        raise exception 'Invalid AI changes.' using errcode = '22023';
      end if;
      if coalesce(site.draft_theme, site.theme, '{}'::jsonb) is distinct from item->'expected' then
        raise exception 'The site theme changed in another editor.' using errcode = '40001';
      end if;
      before_state := jsonb_build_object('draft_theme', site.draft_theme);
      after_state := item->'after';
      update public.sites set draft_theme = after_state where id = site.id;

    elsif item_kind = 'header' then
      if jsonb_typeof(item->'after') is distinct from 'object' or item->'after'->'version' is distinct from '1'::jsonb then
        raise exception 'Invalid AI changes.' using errcode = '22023';
      end if;
      if site.draft_header is distinct from nullif(item->'expected', 'null'::jsonb) then
        raise exception 'The site header changed in another editor.' using errcode = '40001';
      end if;
      before_state := jsonb_build_object('draft_header', site.draft_header);
      after_state := item->'after';
      update public.sites set draft_header = after_state where id = site.id;

    elsif item_kind in ('page', 'page_created') then
      settings := nullif(item->'settings', 'null'::jsonb);
      if target is null or jsonb_typeof(item->'draft_data') is distinct from 'object'
        or jsonb_typeof(item->'draft_data'->'content') is distinct from 'array'
        or (settings is not null and jsonb_typeof(settings) <> 'object') then
        raise exception 'Invalid AI changes.' using errcode = '22023';
      end if;
      if item_kind = 'page' then
        select * into page from public.pages where id = target and site_id = site.id;
        if not found or page.draft_version::text is distinct from item->>'expected_version' then
          raise exception 'A page changed in another editor.' using errcode = '40001';
        end if;
        -- Titles, menu labels and SEO are live once a page is published, so
        -- they are only written for pages that never were.
        if page.published_data is not null or page.published_at is not null then settings := null; end if;
        before_state := jsonb_build_object('draft_data', page.draft_data);
        if settings is not null then
          before_state := before_state || jsonb_build_object('settings', jsonb_build_object(
            'title', page.title, 'nav_label', page.nav_label, 'hide_from_menu', page.hide_from_menu, 'seo', page.seo));
        end if;
        update public.pages set
          draft_data = item->'draft_data',
          title = case when settings is null then title else settings->>'title' end,
          nav_label = case when settings is null then nav_label else coalesce(settings->>'nav_label', nav_label) end,
          hide_from_menu = case when settings is null then hide_from_menu
            else coalesce((settings->>'hide_from_menu')::boolean, hide_from_menu) end,
          seo = case when settings is null then seo else coalesce(nullif(settings->'seo', 'null'::jsonb), seo) end
          where id = target returning * into page;
      else
        if settings is null or nullif(settings->>'slug', '') is null then
          raise exception 'Invalid AI changes.' using errcode = '22023';
        end if;
        insert into public.pages(id, site_id, slug, title, nav_label, hide_from_menu, seo, draft_data, sort_order)
          values (target, site.id, settings->>'slug', settings->>'title', settings->>'nav_label',
            coalesce((settings->>'hide_from_menu')::boolean, false),
            coalesce(nullif(settings->'seo', 'null'::jsonb), '{}'::jsonb), item->'draft_data',
            coalesce((settings->>'sort_order')::integer, 0))
          returning * into page;
      end if;
      -- Read back what the write triggers stored, so later comparisons are exact.
      after_state := jsonb_build_object('draft_data', page.draft_data);
      if settings is not null then
        after_state := after_state || jsonb_build_object('settings', jsonb_build_object(
          'title', page.title, 'nav_label', page.nav_label, 'hide_from_menu', page.hide_from_menu, 'seo', page.seo));
      end if;

    elsif item_kind in ('post', 'post_created') then
      fields := item->'fields';
      if target is null or jsonb_typeof(fields) is distinct from 'object' then
        raise exception 'Invalid AI changes.' using errcode = '22023';
      end if;
      if item_kind = 'post' then
        select * into post from public.posts where id = target and site_id = site.id for update;
        -- Only unpublished drafts are editable here; anything else is live or scheduled.
        if not found or post.status <> 'draft'
          or post.updated_at is distinct from (item->>'expected_updated_at')::timestamptz then
          raise exception 'A blog post changed in another editor.' using errcode = '40001';
        end if;
        before_state := jsonb_build_object('fields', jsonb_build_object(
          'title', post.title, 'subtitle', post.subtitle, 'excerpt', post.excerpt, 'slug', post.slug,
          'draft_content', post.draft_content, 'seo_title', post.seo_title,
          'seo_description', post.seo_description, 'cover_alt', post.cover_alt));
        update public.posts set
          title = fields->>'title', subtitle = coalesce(fields->>'subtitle', ''),
          excerpt = coalesce(fields->>'excerpt', ''), slug = fields->>'slug',
          draft_content = fields->'draft_content', seo_title = coalesce(fields->>'seo_title', ''),
          seo_description = coalesce(fields->>'seo_description', ''), cover_alt = coalesce(fields->>'cover_alt', '')
          where id = target returning * into post;
      else
        insert into public.posts(id, site_id, title, subtitle, excerpt, slug, draft_content,
            seo_title, seo_description, cover_alt)
          values (target, site.id, fields->>'title', coalesce(fields->>'subtitle', ''),
            coalesce(fields->>'excerpt', ''), fields->>'slug', fields->'draft_content',
            coalesce(fields->>'seo_title', ''), coalesce(fields->>'seo_description', ''),
            coalesce(fields->>'cover_alt', ''))
          returning * into post;
      end if;
      after_state := jsonb_build_object('fields', jsonb_build_object(
        'title', post.title, 'subtitle', post.subtitle, 'excerpt', post.excerpt, 'slug', post.slug,
        'draft_content', post.draft_content, 'seo_title', post.seo_title,
        'seo_description', post.seo_description, 'cover_alt', post.cover_alt));

    else
      raise exception 'Invalid AI changes.' using errcode = '22023';
    end if;

    insert into public.ai_agent_apply_items(apply_id, item_key, kind, target_id, label, before, after)
      values (new_apply, item->>'key', item_kind, target, left(coalesce(item->>'label', ''), 300),
        before_state, after_state);
  end loop;

  -- Page history keeps the applied draft of every touched page.
  insert into public.page_versions(page_id, data, kind, theme, header)
    select p.id, p.draft_data, 'ai_edit', coalesce(s.draft_theme, s.theme), s.draft_header
    from public.ai_agent_apply_items i
      join public.pages p on p.id = i.target_id
      join public.sites s on s.id = p.site_id
    where i.apply_id = new_apply and i.kind in ('page', 'page_created');
  delete from public.page_versions v where v.id in (
    select ranked.id from (
      select pv.id, row_number() over (partition by pv.page_id order by pv.published_at desc, pv.id desc) as position
      from public.page_versions pv
      where pv.page_id in (select i.target_id from public.ai_agent_apply_items i
        where i.apply_id = new_apply and i.kind in ('page', 'page_created'))
    ) ranked where ranked.position > 20
  );

  -- Snapshots are only needed while an undo is possible; the history row stays.
  delete from public.ai_agent_apply_items i using public.ai_agent_applies a
    where a.id = i.apply_id and a.site_id = site.id
      and a.applied_at < clock_timestamp() - interval '30 days';
  return new_apply;
end;
$$;
revoke all on function public.apply_ai_agent_changes(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.apply_ai_agent_changes(uuid, text, jsonb, jsonb) to authenticated;

-- Whether one applied item can still be restored:
--   ready     the draft still equals what the apply wrote
--   edited    changed since the apply, so restoring would lose that work
--   published a later publish included it; use the published version history
--   gone      the page or post no longer exists
create function public.ai_agent_apply_item_state(p_item public.ai_agent_apply_items, p_applied_at timestamptz)
returns text language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  site public.sites%rowtype;
  page public.pages%rowtype;
  post public.posts%rowtype;
begin
  if p_item.kind in ('theme', 'header') then
    select s.* into site from public.ai_agent_applies a join public.sites s on s.id = a.site_id
      where a.id = p_item.apply_id;
    if p_item.kind = 'theme' then
      if site.draft_theme is not distinct from p_item.after then return 'ready'; end if;
      if site.draft_theme is null and site.theme is not distinct from p_item.after then return 'published'; end if;
      return 'edited';
    end if;
    if site.draft_header is distinct from p_item.after then return 'edited'; end if;
    -- There is no header publish timestamp; a live header equal to the applied one means it went live.
    if site.published_header is not distinct from p_item.after then return 'published'; end if;
    return 'ready';
  end if;

  if p_item.kind in ('page', 'page_created') then
    select * into page from public.pages where id = p_item.target_id;
    if not found then return 'gone'; end if;
    if p_item.kind = 'page_created' and (page.published_data is not null or page.published_at is not null) then
      return 'published';
    end if;
    if page.published_at > p_applied_at then return 'published'; end if;
    -- Compared by value, not by version token: undoing a later apply restores
    -- this apply's draft under a new token, and it must stay undoable.
    if page.draft_data is distinct from p_item.after->'draft_data' then return 'edited'; end if;
    if p_item.after ? 'settings' and p_item.after->'settings' is distinct from jsonb_build_object(
      'title', page.title, 'nav_label', page.nav_label, 'hide_from_menu', page.hide_from_menu, 'seo', page.seo) then
      return 'edited';
    end if;
    return 'ready';
  end if;

  select * into post from public.posts where id = p_item.target_id;
  if not found then return 'gone'; end if;
  if post.status <> 'draft' or post.published_at > p_applied_at
    or (p_item.kind = 'post_created' and post.published_content is not null) then
    return 'published';
  end if;
  if p_item.after->'fields' is distinct from jsonb_build_object(
    'title', post.title, 'subtitle', post.subtitle, 'excerpt', post.excerpt, 'slug', post.slug,
    'draft_content', post.draft_content, 'seo_title', post.seo_title,
    'seo_description', post.seo_description, 'cover_alt', post.cover_alt) then
    return 'edited';
  end if;
  return 'ready';
end;
$$;
revoke all on function public.ai_agent_apply_item_state(public.ai_agent_apply_items, timestamptz)
  from public, anon, authenticated;

-- Site-wide undo of one apply, in a single transaction. Any site member may
-- run it. Items edited or published since the apply are skipped and reported,
-- never overwritten. Pages and posts the apply created are deleted only when
-- they were never published and are unedited. Published content is not written.
create function public.undo_ai_agent_apply(p_apply_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  actor_name text;
  applied public.ai_agent_applies%rowtype;
  item public.ai_agent_apply_items%rowtype;
  state text;
  result jsonb;
begin
  if actor is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select a.* into applied from public.ai_agent_applies a join public.sites s on s.id = a.site_id
    where a.id = p_apply_id and (public.is_super_admin() or public.is_account_member(s.account_id))
    for update of a, s;
  if not found then raise exception 'These AI changes are unavailable.' using errcode = '42501'; end if;
  if applied.undone_at is not null then
    raise exception 'These AI changes were already undone.' using errcode = 'P0001';
  end if;
  if applied.applied_at < clock_timestamp() - interval '30 days' then
    raise exception 'Undo is available for 30 days after AI changes are applied.' using errcode = 'P0001';
  end if;
  perform 1 from public.pages where site_id = applied.site_id order by id for update;
  perform 1 from public.posts where site_id = applied.site_id and id in (
    select i.target_id from public.ai_agent_apply_items i where i.apply_id = applied.id) order by id for update;

  for item in select * from public.ai_agent_apply_items i where i.apply_id = applied.id order by i.item_key loop
    state := public.ai_agent_apply_item_state(item, applied.applied_at);
    if state = 'ready' then
      begin
        if item.kind = 'theme' then
          update public.sites set draft_theme = nullif(item.before->'draft_theme', 'null'::jsonb) where id = applied.site_id;
        elsif item.kind = 'header' then
          update public.sites set draft_header = nullif(item.before->'draft_header', 'null'::jsonb) where id = applied.site_id;
        elsif item.kind = 'page' then
          update public.pages set
            draft_data = item.before->'draft_data',
            title = case when item.before ? 'settings' then item.before->'settings'->>'title' else title end,
            nav_label = case when item.before ? 'settings' then item.before->'settings'->>'nav_label' else nav_label end,
            hide_from_menu = case when item.before ? 'settings'
              then (item.before->'settings'->>'hide_from_menu')::boolean else hide_from_menu end,
            seo = case when item.before ? 'settings' then item.before->'settings'->'seo' else seo end
            where id = item.target_id;
        elsif item.kind = 'page_created' then
          delete from public.pages where id = item.target_id;
        elsif item.kind = 'post' then
          update public.posts set
            title = item.before->'fields'->>'title', subtitle = item.before->'fields'->>'subtitle',
            excerpt = item.before->'fields'->>'excerpt', slug = item.before->'fields'->>'slug',
            draft_content = item.before->'fields'->'draft_content',
            seo_title = item.before->'fields'->>'seo_title',
            seo_description = item.before->'fields'->>'seo_description',
            cover_alt = item.before->'fields'->>'cover_alt'
            where id = item.target_id;
        else
          delete from public.posts where id = item.target_id;
        end if;
        state := 'undone';
      exception
        when insufficient_privilege then
          -- Restoring agency-only embed code needs the agency; leave this item as it is.
          state := 'restricted';
        when unique_violation then
          -- The previous page or post URL has been taken since the apply.
          state := 'edited';
      end;
    elsif state = 'gone' then
      -- A created page or post that is already gone needs no undo.
      state := case when item.kind in ('page_created', 'post_created') then 'undone' else 'edited' end;
    end if;
    update public.ai_agent_apply_items set outcome = state
      where apply_id = applied.id and item_key = item.item_key;
  end loop;

  select jsonb_build_object(
    'undone', count(*) filter (where not c.skipped),
    'skipped', count(*) filter (where c.skipped)
  ) into result from (
    select exists (
      select 1 from jsonb_array_elements_text(change.value->'items') touched(item_key)
        join public.ai_agent_apply_items i on i.apply_id = applied.id and i.item_key = touched.item_key
      where i.outcome <> 'undone'
    ) as skipped
    from jsonb_array_elements(applied.changes) change
  ) c;
  result := result || jsonb_build_object(
    'undone_items', coalesce((select jsonb_agg(i.item_key order by i.item_key) from public.ai_agent_apply_items i
      where i.apply_id = applied.id and i.outcome = 'undone'), '[]'::jsonb),
    'skipped_items', coalesce((select jsonb_agg(jsonb_build_object(
        'key', i.item_key, 'kind', i.kind, 'target_id', i.target_id, 'label', i.label, 'reason', i.outcome)
        order by i.item_key)
      from public.ai_agent_apply_items i where i.apply_id = applied.id and i.outcome <> 'undone'), '[]'::jsonb));

  select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), '')) into actor_name
    from public.profiles p where p.id = actor;
  update public.ai_agent_applies set
    undone_by = actor, undone_by_name = coalesce(actor_name, 'Team member'),
    undone_at = clock_timestamp(), undo_result = result
    where id = applied.id;
  return result;
end;
$$;
revoke all on function public.undo_ai_agent_apply(uuid) from public, anon;
grant execute on function public.undo_ai_agent_apply(uuid) to authenticated;

-- The site's AI history: the latest applies, who made and undid them, and
-- whether an undo is still possible (30 days, and something left to restore).
-- Pass a run or apply ID to look up that one entry.
create function public.list_ai_agent_applies(p_site_id uuid, p_run_id uuid default null, p_apply_id uuid default null)
returns table (
  id uuid, run_id uuid, summary text, change_count integer, applied_by_name text, applied_at timestamptz,
  undone_by_name text, undone_at timestamptz, undo_result jsonb, can_undo boolean
) language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, a.run_id, a.summary, jsonb_array_length(a.changes), a.applied_by_name, a.applied_at,
    a.undone_by_name, a.undone_at, a.undo_result,
    a.undone_at is null and a.applied_at >= clock_timestamp() - interval '30 days' and exists (
      select 1 from public.ai_agent_apply_items i
      where i.apply_id = a.id and public.ai_agent_apply_item_state(i, a.applied_at) = 'ready')
  from public.ai_agent_applies a join public.sites s on s.id = a.site_id
  where a.site_id = p_site_id and auth.uid() is not null
    and (p_run_id is null or a.run_id = p_run_id) and (p_apply_id is null or a.id = p_apply_id)
    and (public.is_super_admin() or public.is_account_member(s.account_id))
  order by a.applied_at desc
  limit 30;
$$;
revoke all on function public.list_ai_agent_applies(uuid, uuid, uuid) from public, anon;
grant execute on function public.list_ai_agent_applies(uuid, uuid, uuid) to authenticated;

commit;
