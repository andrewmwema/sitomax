alter table public.ai_requests add column checkpoint_open boolean not null default false;

create or replace function public.finish_ai_site_generation(p_generation_id uuid, p_success boolean, p_site_id uuid default null)
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
  -- Initial page/retry creation must not close the parent before body calls.
  if parent.checkpoint_open then return; end if;
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

create function public.start_ai_draft_checkpoints(
  p_generation_id uuid, p_user_id uuid, p_site_id uuid, p_name text, p_subdomain text,
  p_theme jsonb, p_pages jsonb, p_business jsonb, p_expected_business jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare parent public.ai_requests%rowtype;
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
  perform 1 from public.sites where id = p_site_id and account_id = parent.account_id for update;
  update public.sites set business = p_business
    where id = p_site_id and account_id = parent.account_id and business is not distinct from p_expected_business;
  if not found then
    raise exception 'Business information changed. Reload and confirm the latest details before building.' using errcode = 'P0001';
  end if;
  return public.apply_selected_ai_pages(p_site_id, p_pages, parent.id, p_user_id);
end;
$$;

create function public.checkpoint_ai_draft(p_generation_id uuid, p_user_id uuid, p_retry_id uuid, p_data jsonb)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare parent public.ai_requests%rowtype; job public.ai_page_retries%rowtype; saved boolean;
begin
  select * into strict parent from public.ai_requests where id = p_generation_id for update;
  if parent.user_id <> p_user_id or parent.status <> 'pending' or not parent.checkpoint_open
    or parent.generation_id is not null or not parent.is_generation
    or (not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
      and not exists (select 1 from public.account_members
        where account_id = parent.account_id and user_id = p_user_id and role = 'owner')) then
    raise exception 'This generation is no longer active.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_data->'content') is distinct from 'array'
    or nullif(btrim(p_data#>>'{root,props,seoTitle}'), '') is null
    or nullif(btrim(p_data#>>'{root,props,description}'), '') is null then
    raise exception 'Invalid generated draft.';
  end if;
  select * into strict job from public.ai_page_retries where id = p_retry_id and generation_id = parent.id for update;
  update public.pages p set draft_data = p_data, ai_pending_build = false, sort_order = job.sort_order
    where p.id = job.page_id and p.site_id = parent.site_id and p.draft_data = job.expected_draft
      and p.slug = job.spec#>>'{build,page,slug}'
      and exists (select 1 from public.sites s where s.id = p.site_id and s.account_id = parent.account_id);
  saved := found;
  delete from public.ai_page_retries where id = job.id;
  return saved;
end;
$$;

create function public.complete_ai_draft_checkpoints(p_generation_id uuid, p_user_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  perform 1 from public.ai_requests r where r.id = p_generation_id and r.user_id = p_user_id
    and r.is_generation and r.generation_id is null for update;
  if not found then raise exception 'This generation is unavailable.' using errcode = '42501'; end if;
  update public.ai_requests set checkpoint_open = false where id = p_generation_id;
  perform public.finish_ai_site_generation(p_generation_id, false);
end;
$$;

create or replace function public.list_ai_page_retries(p_site_id uuid)
returns table ("retryId" uuid, "pageId" uuid, slug text, label text)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct on (p.id) j.id, p.id, p.slug, p.nav_label
  from public.ai_page_retries j join public.ai_requests r on r.id = j.generation_id
    join public.pages p on p.id = j.page_id join public.sites s on s.id = p.site_id and s.account_id = r.account_id
  where p.site_id = p_site_id and r.user_id = auth.uid() and r.status <> 'failed'
    and (not r.checkpoint_open or r.created_at <= clock_timestamp() - interval '15 minutes')
    and p.draft_data = j.expected_draft and p.slug = j.spec#>>'{build,page,slug}'
    and (public.is_super_admin() or public.is_account_owner(r.account_id))
  order by p.id, r.created_at desc
$$;

create or replace function public.claim_ai_page_retry(p_retry_id uuid, p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare job public.ai_page_retries%rowtype; parent public.ai_requests%rowtype; page public.pages%rowtype; lease uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  select * into strict parent from public.ai_requests
    where id = (select generation_id from public.ai_page_retries where id = p_retry_id) for update;
  select * into strict job from public.ai_page_retries where id = p_retry_id for update;
  select * into strict page from public.pages where id = job.page_id;
  if parent.user_id <> p_user_id or parent.site_id is distinct from page.site_id or parent.status = 'failed'
    or not exists (select 1 from public.sites where id = page.site_id and account_id = parent.account_id)
    or (not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
      and not exists (select 1 from public.account_members where account_id = parent.account_id and user_id = p_user_id and role = 'owner')) then
    raise exception 'This retry is not available.' using errcode = '42501';
  end if;
  if parent.checkpoint_open and parent.created_at > clock_timestamp() - interval '15 minutes' then
    raise exception 'This site generation is still running. Wait before retrying unfinished pages.' using errcode = 'P0001';
  end if;
  if page.draft_data is distinct from job.expected_draft or page.slug is distinct from job.spec#>>'{build,page,slug}' then
    raise exception 'This draft changed. Use Build pages with AI to start a new rebuild.' using errcode = 'P0001';
  end if;
  if job.leased_at > clock_timestamp() - interval '15 minutes'
    or exists (select 1 from public.ai_requests where user_id = p_user_id and generation_id is not null
      and is_generation and created_at > clock_timestamp() - interval '1 minute') then
    raise exception 'Another attempt is running or finished recently. Try again in a minute.' using errcode = 'P0001';
  end if;
  if parent.checkpoint_open then
    update public.ai_requests set checkpoint_open = false where id = parent.id;
    -- Uncertain provider calls remain reserved; recovery must never refund them.
    perform public.finish_ai_site_generation(parent.id, false);
  end if;
  insert into public.ai_requests(account_id, user_id, site_id, action, model, is_generation, generation_id, is_unlimited)
    values (parent.account_id, p_user_id, page.site_id, 'generate_site', parent.model, true, parent.id, parent.is_unlimited)
    returning id into lease;
  update public.ai_page_retries set lease_id = lease, leased_at = clock_timestamp() where id = job.id;
  return jsonb_build_object('leaseId', lease, 'siteId', page.site_id, 'accountId', parent.account_id,
    'pageId', page.id, 'slug', page.slug, 'spec', job.spec);
end;
$$;

revoke all on function public.start_ai_draft_checkpoints(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb),
  public.checkpoint_ai_draft(uuid, uuid, uuid, jsonb), public.complete_ai_draft_checkpoints(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.start_ai_draft_checkpoints(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb),
  public.checkpoint_ai_draft(uuid, uuid, uuid, jsonb), public.complete_ai_draft_checkpoints(uuid, uuid)
  to service_role;
