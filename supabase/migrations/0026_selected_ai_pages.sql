alter table public.pages add column hide_from_menu boolean not null default false;
alter table public.pages add column ai_pending_build boolean not null default false;
alter table public.ai_requests add column page_surcharge integer not null default 0 check (page_surcharge between 0 and 8);
alter table public.ai_requests add column selected_page_result jsonb;

create function public.begin_selected_ai_generation(
  p_user_id uuid, p_account_id uuid, p_model text, p_page_count integer, p_site_id uuid default null
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare reservation uuid; surcharge integer;
begin
  if p_page_count is null or p_page_count not between 1 and 10 then
    raise exception 'Select between 1 and 10 pages.' using errcode = '22023';
  end if;
  reservation := public.begin_ai_site_generation(p_user_id, p_account_id, p_model, p_site_id);
  surcharge := 2 * greatest(0, p_page_count - 6);
  if surcharge > 0 and not (select is_unlimited from public.ai_requests where id = reservation) then
    update public.ai_limits set extra_credits = extra_credits - surcharge
      where account_id = p_account_id and extra_credits >= surcharge;
    if not found then raise exception 'Not enough credits for the selected pages.' using errcode = 'P0001'; end if;
    update public.ai_requests set page_surcharge = surcharge where id = reservation;
  end if;
  return reservation;
end;
$$;
revoke all on function public.begin_selected_ai_generation(uuid, uuid, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.begin_selected_ai_generation(uuid, uuid, text, integer, uuid) to service_role;

create or replace function public.reserve_ai_generation_call(
  p_generation_id uuid, p_user_id uuid, p_account_id uuid, p_action text, p_model text,
  p_site_id uuid default null, p_custom boolean default false
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare parent public.ai_requests%rowtype; call_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  select * into strict parent from public.ai_requests where id = p_generation_id for update;
  if parent.user_id <> p_user_id or parent.account_id <> p_account_id
    or parent.site_id is distinct from p_site_id or not parent.is_generation or parent.status <> 'pending'
    or p_action is distinct from 'generate_site' or p_model is distinct from parent.model then
    raise exception 'Invalid site-generation reservation.' using errcode = '42501';
  end if;
  if p_site_id is not null and not exists (select 1 from public.sites where id = p_site_id and account_id = p_account_id) then
    raise exception 'The site does not belong to this account.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
    and not exists (select 1 from public.account_members where user_id = p_user_id and account_id = p_account_id and role = 'owner') then
    raise exception 'Account owner access required.' using errcode = '42501';
  end if;
  if exists (select 1 from public.ai_requests where user_id = p_user_id and is_generation and status = 'pending'
    and id <> parent.id and id is distinct from parent.generation_id and created_at < parent.created_at
    and created_at > clock_timestamp() - interval '13 minutes') then
    raise exception 'Another site generation is in progress.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.ai_requests where user_id = p_user_id and not is_generation
    and created_at > clock_timestamp() - interval '1 minute' and generation_id is distinct from parent.id) >= 10 then
    raise exception 'AI rate limit reached. Try again in a minute.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.ai_requests where generation_id = parent.id) >=
    (case when parent.generation_id is not null then 40 when p_custom then 402 else 42 end) then
    raise exception 'This generation has reached its maximum number of AI calls.' using errcode = 'P0001';
  end if;
  insert into public.ai_requests(account_id, user_id, site_id, action, model, generation_id, is_unlimited)
    values (parent.account_id, parent.user_id, parent.site_id, 'generate_site', p_model, parent.id, parent.is_unlimited)
    returning id into call_id;
  return call_id;
end;
$$;

create function public.refund_ai_page_surcharge()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  update public.ai_limits set extra_credits = extra_credits + old.page_surcharge where account_id = old.account_id;
  return new;
end;
$$;
create trigger refund_ai_page_surcharge after update of status on public.ai_requests
for each row when (old.status = 'pending' and new.status = 'failed' and old.page_surcharge > 0)
execute function public.refund_ai_page_surcharge();

create table public.ai_page_retries (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.ai_requests(id),
  page_id uuid not null references public.pages(id) on delete cascade,
  expected_draft jsonb not null,
  sort_order integer not null,
  spec jsonb not null,
  lease_id uuid references public.ai_requests(id),
  leased_at timestamptz,
  unique (generation_id, page_id)
);
alter table public.ai_page_retries enable row level security;
create index on public.ai_page_retries(page_id);
revoke all on public.ai_page_retries from anon, authenticated;
grant all on public.ai_page_retries to service_role;

create function public.apply_selected_ai_pages(p_site_id uuid, p_pages jsonb, p_generation_id uuid, p_user_id uuid, p_theme jsonb default null)
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
  if p_theme is not null then update public.sites set draft_theme = p_theme where id = p_site_id; end if;
  perform public.finish_ai_site_generation(p_generation_id, false, p_site_id);
  return result;
end;
$$;
revoke all on function public.apply_selected_ai_pages(uuid, jsonb, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_selected_ai_pages(uuid, jsonb, uuid, uuid, jsonb) to service_role;

create function public.save_selected_ai_drafts(p_generation_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare reservation public.ai_requests%rowtype;
begin
  select * into strict reservation from public.ai_requests
    where id = p_generation_id and user_id = auth.uid() and selected_page_result is not null for update;
  update public.ai_requests set selected_page_result = null where id = p_generation_id;
  return public.apply_selected_ai_pages(reservation.site_id, reservation.selected_page_result, reservation.id, auth.uid());
end;
$$;
revoke all on function public.save_selected_ai_drafts(uuid) from public, anon, authenticated;
grant execute on function public.save_selected_ai_drafts(uuid) to authenticated;

create function public.create_selected_ai_site(
  p_account_id uuid, p_name text, p_subdomain text, p_theme jsonb, p_pages jsonb, p_business jsonb, p_site_id uuid,
  p_generation_id uuid, p_user_id uuid
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  insert into public.sites(id, account_id, name, subdomain, template_key, business)
    values (p_site_id, p_account_id, p_name, p_subdomain, 'ai', p_business);
  return public.apply_selected_ai_pages(p_site_id, p_pages, p_generation_id, p_user_id, p_theme);
end;
$$;
revoke all on function public.create_selected_ai_site(uuid, text, text, jsonb, jsonb, jsonb, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_selected_ai_site(uuid, text, text, jsonb, jsonb, jsonb, uuid, uuid, uuid) to service_role;

create function public.can_retry_ai_page(p_retry_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.ai_page_retries j join public.ai_requests r on r.id = j.generation_id
    join public.pages p on p.id = j.page_id join public.sites s on s.id = p.site_id and s.account_id = r.account_id
    where j.id = p_retry_id and r.user_id = auth.uid()
      and (public.is_super_admin() or public.is_account_owner(r.account_id)))
$$;
revoke all on function public.can_retry_ai_page(uuid) from public, anon, authenticated;
grant execute on function public.can_retry_ai_page(uuid) to authenticated;

create function public.list_ai_page_retries(p_site_id uuid)
returns table ("retryId" uuid, "pageId" uuid, slug text, label text)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct on (p.id) j.id, p.id, p.slug, p.nav_label
  from public.ai_page_retries j join public.ai_requests r on r.id = j.generation_id
    join public.pages p on p.id = j.page_id join public.sites s on s.id = p.site_id and s.account_id = r.account_id
  where p.site_id = p_site_id and r.user_id = auth.uid() and r.status <> 'failed'
    and p.draft_data = j.expected_draft and p.slug = j.spec->'build'->'page'->>'slug'
    and (public.is_super_admin() or public.is_account_owner(r.account_id))
  order by p.id, r.created_at desc
$$;
revoke all on function public.list_ai_page_retries(uuid) from public, anon, authenticated;
grant execute on function public.list_ai_page_retries(uuid) to authenticated;

create function public.claim_ai_page_retry(p_retry_id uuid, p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare job public.ai_page_retries%rowtype; parent public.ai_requests%rowtype; page public.pages%rowtype; lease uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  select * into strict job from public.ai_page_retries where id = p_retry_id for update;
  select * into strict parent from public.ai_requests where id = job.generation_id;
  select * into strict page from public.pages where id = job.page_id;
  if parent.user_id <> p_user_id or parent.site_id is distinct from page.site_id or parent.status = 'failed'
    or not exists (select 1 from public.sites where id = page.site_id and account_id = parent.account_id)
    or (not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
      and not exists (select 1 from public.account_members where account_id = parent.account_id and user_id = p_user_id and role = 'owner')) then
    raise exception 'This retry is not available.' using errcode = '42501';
  end if;
  if page.draft_data is distinct from job.expected_draft or page.slug is distinct from job.spec->'build'->'page'->>'slug' then
    raise exception 'This draft changed. Use Build pages with AI to start a new rebuild.' using errcode = 'P0001';
  end if;
  if job.leased_at > clock_timestamp() - interval '15 minutes'
    or exists (select 1 from public.ai_requests where user_id = p_user_id and generation_id is not null
      and is_generation and created_at > clock_timestamp() - interval '1 minute') then
    raise exception 'Another attempt is running or finished recently. Try again in a minute.' using errcode = 'P0001';
  end if;
  insert into public.ai_requests(account_id, user_id, site_id, action, model, is_generation, generation_id, is_unlimited)
    values (parent.account_id, p_user_id, page.site_id, 'generate_site', parent.model, true, parent.id, parent.is_unlimited)
    returning id into lease;
  update public.ai_page_retries set lease_id = lease, leased_at = clock_timestamp() where id = job.id;
  return jsonb_build_object('leaseId', lease, 'siteId', page.site_id, 'accountId', parent.account_id,
    'pageId', page.id, 'slug', page.slug, 'spec', job.spec);
end;
$$;

create function public.finish_ai_page_retry(p_retry_id uuid, p_lease_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare job public.ai_page_retries%rowtype; saved boolean := false; draft jsonb;
begin
  if not public.can_retry_ai_page(p_retry_id) then
    raise exception 'This retry is not available.' using errcode = '42501';
  end if;
  perform 1 from public.pages where id = (select page_id from public.ai_page_retries where id = p_retry_id) for update;
  select * into strict job from public.ai_page_retries where id = p_retry_id and lease_id = p_lease_id for update;
  select selected_page_result into strict draft from public.ai_requests where id = p_lease_id and user_id = auth.uid() for update;
  update public.ai_requests set selected_page_result = null where id = p_lease_id;
  if draft is not null then
    update public.pages set draft_data = draft, sort_order = job.sort_order, ai_pending_build = false
      where id = job.page_id and draft_data = job.expected_draft and slug = job.spec->'build'->'page'->>'slug';
    saved := found;
    if saved then delete from public.ai_page_retries where id = job.id; end if;
  end if;
  if not saved then
    update public.ai_page_retries set lease_id = null, leased_at = null where id = job.id;
  end if;
  perform public.finish_ai_site_generation(p_lease_id, false);
  return saved;
end;
$$;
revoke all on function public.claim_ai_page_retry(uuid, uuid), public.finish_ai_page_retry(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_ai_page_retry(uuid, uuid) to service_role;
grant execute on function public.finish_ai_page_retry(uuid, uuid) to authenticated;
