-- A generation reserves quota once; its individual provider calls retain their
-- own rate-limit attempts and usage ledger entries.
alter table public.ai_requests
  add column is_generation boolean not null default false,
  add column generation_id uuid references public.ai_requests(id);
create index ai_requests_generation on public.ai_requests(generation_id);

create or replace function public.reserve_ai_request(p_user_id uuid, p_account_id uuid, p_action text, p_model text, p_site_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  unlimited boolean;
  limits public.ai_limits%rowtype;
  used bigint;
  quota int;
  credits int := 0;
  request_id uuid;
  request_time timestamptz;
  month_start timestamptz;
begin
  select is_super_admin into unlimited from public.profiles where id = p_user_id;
  if unlimited is null or (not unlimited and not exists (
    select 1 from public.account_members where user_id = p_user_id and account_id = p_account_id
  )) then raise exception 'You do not have access to this AI account.' using errcode = '42501'; end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites where id = p_site_id and account_id = p_account_id
  ) then raise exception 'The site does not belong to this account.' using errcode = '42501'; end if;
  if p_action not in ('generate_site', 'edit_section', 'rewrite_text') or p_action is null
    or p_model is null or length(p_model) not between 1 and 100 then
    raise exception 'Invalid AI request.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  select * into strict limits from public.ai_limits where account_id = p_account_id for update;
  request_time := clock_timestamp();
  month_start := date_trunc('month', request_time at time zone 'UTC') at time zone 'UTC';
  if (select count(*) from public.ai_requests where user_id = p_user_id and not is_generation
      and created_at > request_time - interval '1 minute') >= 10 then
    raise exception 'AI rate limit reached. Try again in a minute.' using errcode = 'P0001';
  end if;
  if not unlimited then
    select count(*) into used from public.ai_requests
      where account_id = p_account_id and created_at >= month_start and generation_id is null
      and status in ('pending', 'completed') and credits_used = 0 and not is_unlimited
      and (case when p_action = 'generate_site' then action = 'generate_site' else action <> 'generate_site' end);
    quota := case when p_action = 'generate_site' then limits.monthly_site_generations else limits.monthly_edits end;
    if used >= quota then
      credits := case when p_action = 'generate_site' then 10 else 1 end;
      if limits.extra_credits < credits then
        raise exception 'Monthly AI limit reached. Ask your agency for more credits.' using errcode = 'P0001';
      end if;
      update public.ai_limits set extra_credits = extra_credits - credits where account_id = p_account_id;
    end if;
  end if;
  insert into public.ai_requests(account_id, user_id, site_id, action, model, credits_used, is_unlimited, created_at)
    values (p_account_id, p_user_id, p_site_id, p_action, p_model, credits, unlimited, request_time)
    returning id into request_id;
  return request_id;
end;
$$;

create function public.begin_ai_site_generation(p_user_id uuid, p_account_id uuid, p_model text, p_site_id uuid default null)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare request_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_user_id and is_super_admin) and (
    p_site_id is null or not exists (select 1 from public.account_members
      where user_id = p_user_id and account_id = p_account_id and role = 'owner')
  ) then raise exception 'Only account owners or the agency can generate a site.' using errcode = '42501'; end if;
  request_id := public.reserve_ai_request(p_user_id, p_account_id, 'generate_site', p_model, p_site_id);
  update public.ai_requests set is_generation = true where id = request_id;
  return request_id;
end;
$$;

create function public.reserve_ai_generation_call(
  p_generation_id uuid, p_user_id uuid, p_account_id uuid, p_action text, p_model text, p_site_id uuid default null
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  parent public.ai_requests%rowtype;
  call_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  select * into strict parent from public.ai_requests where id = p_generation_id for update;
  if parent.user_id <> p_user_id or parent.account_id <> p_account_id
    or parent.site_id is distinct from p_site_id or not parent.is_generation or parent.status <> 'pending'
    or p_action <> 'generate_site' or p_model is distinct from parent.model then
    raise exception 'Invalid site-generation reservation.' using errcode = '42501';
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites where id = p_site_id and account_id = p_account_id
  ) then raise exception 'The site does not belong to this account.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
    and not exists (select 1 from public.account_members
      where user_id = p_user_id and account_id = p_account_id and role = 'owner') then
    raise exception 'Account owner access required.' using errcode = '42501';
  end if;
  if (select count(*) from public.ai_requests where user_id = p_user_id and not is_generation
    and created_at > clock_timestamp() - interval '1 minute') >= 10 then
    raise exception 'AI rate limit reached. Try again in a minute.' using errcode = 'P0001';
  end if;
  -- Bound the workflow to a plan + four pages, with one repair each.
  if (select count(*) from public.ai_requests where generation_id = parent.id) >= 10 then
    raise exception 'This generation has reached its maximum number of AI calls.' using errcode = 'P0001';
  end if;
  insert into public.ai_requests(account_id, user_id, site_id, action, model, generation_id, is_unlimited)
    values (parent.account_id, parent.user_id, parent.site_id, 'generate_site', p_model, parent.id, parent.is_unlimited)
    returning id into call_id;
  return call_id;
end;
$$;

create function public.finish_ai_site_generation(p_generation_id uuid, p_success boolean, p_site_id uuid default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare parent public.ai_requests%rowtype;
begin
  select * into strict parent from public.ai_requests where id = p_generation_id for update;
  if not parent.is_generation then raise exception 'Not a site generation.'; end if;
  if parent.status <> 'pending' then return; end if;
  if p_site_id is not null then
    if not exists (select 1 from public.sites where id = p_site_id and account_id = parent.account_id)
      or (parent.site_id is not null and parent.site_id <> p_site_id) then
      raise exception 'The generated site does not belong to this account.' using errcode = '42501';
    end if;
    update public.ai_requests set site_id = p_site_id where id = parent.id or generation_id = parent.id;
    update public.ai_usage set site_id = p_site_id where request_id in (
      select id from public.ai_requests where generation_id = parent.id
    );
  end if;
  -- Unknown provider/accounting outcomes remain held, never refunded.
  if exists (select 1 from public.ai_requests where generation_id = parent.id and status = 'pending') then
    if p_success then raise exception 'Generation has unreconciled AI calls.'; end if;
    return;
  end if;
  if p_success or exists (select 1 from public.ai_requests where generation_id = parent.id and status = 'completed') then
    update public.ai_requests set status = 'completed' where id = parent.id;
  else
    perform public.finish_ai_request(parent.id, true);
  end if;
end;
$$;

revoke all on function public.begin_ai_site_generation(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.reserve_ai_generation_call(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.finish_ai_site_generation(uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.begin_ai_site_generation(uuid, uuid, text, uuid) to service_role;
grant execute on function public.reserve_ai_generation_call(uuid, uuid, uuid, text, text, uuid) to service_role;
grant execute on function public.finish_ai_site_generation(uuid, boolean, uuid) to service_role;

create or replace function public.ai_account_summaries()
returns table (account_id uuid, account_name text, site_generations bigint, edits bigint,
  included_generations bigint, included_edits bigint, pending_requests bigint,
  monthly_site_generations int, monthly_edits int, extra_credits int)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, a.name,
    count(r.id) filter (where r.status = 'completed' and r.action = 'generate_site'),
    count(r.id) filter (where r.status = 'completed' and r.action <> 'generate_site'),
    count(r.id) filter (where r.status <> 'failed' and r.credits_used = 0 and not r.is_unlimited and r.action = 'generate_site'),
    count(r.id) filter (where r.status <> 'failed' and r.credits_used = 0 and not r.is_unlimited and r.action <> 'generate_site'),
    count(r.id) filter (where r.status = 'pending'),
    l.monthly_site_generations, l.monthly_edits, l.extra_credits
  from public.accounts a join public.ai_limits l on l.account_id = a.id
  left join public.ai_requests r on r.account_id = a.id and r.generation_id is null
    and r.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
  where public.is_super_admin() or public.is_account_owner(a.id)
  group by a.id, a.name, l.monthly_site_generations, l.monthly_edits, l.extra_credits;
$$;

-- AI themes remain draft-only too: applying a new palette must not alter a live site.
alter table public.sites add column draft_theme jsonb;
grant update (draft_theme) on public.sites to authenticated;

create table public.site_draft_versions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  pages jsonb not null,
  theme jsonb not null,
  generated_page_ids uuid[] not null default '{}'
);
alter table public.site_draft_versions enable row level security;
create policy "members read site draft backups" on public.site_draft_versions for select to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id
    and (public.is_super_admin() or public.is_account_member(s.account_id))));
revoke all on public.site_draft_versions from anon, authenticated;
grant select on public.site_draft_versions to authenticated;
create index site_draft_versions_date on public.site_draft_versions(site_id, created_at desc);

-- Private transaction helper; the two public entry points below authorize callers.
create function public.apply_generated_drafts(p_site_id uuid, p_theme jsonb, p_pages jsonb, p_backup boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  backup_id uuid;
  page jsonb;
  home_id uuid;
  page_id uuid;
  page_ids uuid[] := '{}';
  previous_theme jsonb;
begin
  select coalesce(draft_theme, theme) into strict previous_theme from public.sites where id = p_site_id for update;
  perform 1 from public.pages where site_id = p_site_id order by id for update;
  if jsonb_typeof(p_pages) is distinct from 'array' or jsonb_array_length(p_pages) <> 4
    or (select count(distinct value->>'slug') from jsonb_array_elements(p_pages)) <> 4
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
revoke all on function public.apply_generated_drafts(uuid, jsonb, jsonb, boolean) from public, anon, authenticated;

create function public.replace_ai_site_drafts(p_site_id uuid, p_theme jsonb, p_pages jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.sites where id = p_site_id
    and (public.is_super_admin() or public.is_account_owner(account_id))) then
    raise exception 'Account owner access required.' using errcode = '42501';
  end if;
  return public.apply_generated_drafts(p_site_id, p_theme, p_pages, true);
end;
$$;
revoke all on function public.replace_ai_site_drafts(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.replace_ai_site_drafts(uuid, jsonb, jsonb) to authenticated;

create function public.create_ai_site(p_account_id uuid, p_name text, p_subdomain text, p_theme jsonb, p_pages jsonb)
returns table(site_id uuid, page_id uuid)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare new_site uuid; home_id uuid;
begin
  insert into public.sites(account_id, name, subdomain, template_key)
    values (p_account_id, p_name, p_subdomain, 'ai') returning id into new_site;
  home_id := public.apply_generated_drafts(new_site, p_theme, p_pages, false);
  return query select new_site, home_id;
end;
$$;
revoke all on function public.create_ai_site(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_generated_drafts(uuid, jsonb, jsonb, boolean) to service_role;
grant execute on function public.create_ai_site(uuid, text, text, jsonb, jsonb) to service_role;

create function public.restore_site_draft_version(p_version_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare backup public.site_draft_versions%rowtype;
begin
  select v.* into strict backup from public.site_draft_versions v join public.sites s on s.id = v.site_id
    where v.id = p_version_id and (public.is_super_admin() or public.is_account_owner(s.account_id));
  perform 1 from public.sites where id = backup.site_id for update;
  perform 1 from public.pages where site_id = backup.site_id order by id for update;
  if exists (select 1 from jsonb_array_elements(backup.pages) p
    where not exists (select 1 from public.pages where id = (p->>'id')::uuid and site_id = backup.site_id)) then
    raise exception 'A backed-up page was deleted. Ask your agency to recover this version.';
  end if;
  -- Save the current drafts too so restoring a backup is itself reversible.
  insert into public.site_draft_versions(site_id, pages, theme)
    select backup.site_id, coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'draft_data', p.draft_data)), '[]'),
      (select coalesce(draft_theme, theme) from public.sites where id = backup.site_id)
    from public.pages p where site_id = backup.site_id;
  update public.pages p set draft_data = b.value->'draft_data'
    from jsonb_array_elements(backup.pages) b(value)
    where p.site_id = backup.site_id and p.id = (b.value->>'id')::uuid;
  -- Keep generated pages, but clear their drafts if they were absent in the backup.
  -- Never delete a page or change a published payload during a restore.
  update public.pages set draft_data = '{"content":[],"root":{}}'
    where site_id = backup.site_id and id = any(backup.generated_page_ids)
      and not exists (select 1 from jsonb_array_elements(backup.pages) p where (p->>'id')::uuid = pages.id);
  update public.sites set draft_theme = backup.theme where id = backup.site_id;
end;
$$;
revoke all on function public.restore_site_draft_version(uuid) from public, anon;
grant execute on function public.restore_site_draft_version(uuid) to authenticated;

-- A backup is a trusted record of previously allowed embed code on this page.
-- Owners can restore it unchanged, but still cannot introduce arbitrary code.
create or replace function public.guard_page_embeds()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then return new; end if;
  if exists (
    select 1 from (
      select code from public.page_embed_codes(new.draft_data)
      union all select code from public.page_embed_codes(new.published_data)
    ) incoming
    where incoming.code is null or (
      incoming.code <> '' and (
        tg_op = 'INSERT' or (
          incoming.code not in (
            select code from public.page_embed_codes(old.draft_data) where code is not null
            union select code from public.page_embed_codes(old.published_data) where code is not null
          ) and incoming.code not in (
            select codes.code from public.site_draft_versions v
            cross join lateral jsonb_array_elements(v.pages) stored
            cross join lateral public.page_embed_codes(stored.value->'draft_data') codes
            where v.site_id = new.site_id and stored.value->>'id' = new.id::text and codes.code is not null
          )
        )
      )
    )
  ) then raise exception 'Only the agency can add or change embed code.' using errcode = '42501'; end if;
  return new;
end;
$$;

create function public.publish_pending_site_theme()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.published_data is not null then
    update public.sites set theme = draft_theme, draft_theme = null
      where id = new.site_id and draft_theme is not null;
  end if;
  return new;
end;
$$;
revoke all on function public.publish_pending_site_theme() from public;
create trigger publish_pending_site_theme after update of published_data on public.pages
  for each row execute function public.publish_pending_site_theme();
