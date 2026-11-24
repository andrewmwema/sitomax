begin;

alter table public.ai_requests add column template_page_surcharge integer not null default 0
  check (template_page_surcharge between 0 and 12);

create function public.refund_ai_template_page_surcharge()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  update public.ai_limits set extra_credits = extra_credits + old.template_page_surcharge where account_id = old.account_id;
  return new;
end;
$$;
create trigger refund_ai_template_page_surcharge after update of status on public.ai_requests
for each row when (old.status = 'pending' and new.status = 'failed' and old.template_page_surcharge > 0)
execute function public.refund_ai_template_page_surcharge();

alter table public.site_draft_versions add column header jsonb;

-- A recommendation holds a build allowance until a design is selected or
-- cancelled. Completed recommendation calls remain in the usage ledger.
create table public.ai_template_builds (
  generation_id uuid primary key references public.ai_requests(id) on delete cascade,
  template_id text references public.site_templates(id),
  started_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.ai_template_builds enable row level security;
revoke all on public.ai_template_builds from public, anon, authenticated;
grant all on public.ai_template_builds to service_role;

create function public.begin_ai_template_build(p_user_id uuid, p_account_id uuid, p_model text)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare reservation uuid; stale record;
begin
  if not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
    and not exists (select 1 from public.account_members where account_id = p_account_id
      and user_id = p_user_id and role = 'owner') then
    raise exception 'Only account owners or the agency can build a site.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  for stale in
    select r.id from public.ai_template_builds t join public.ai_requests r on r.id = t.generation_id
      where r.user_id = p_user_id and r.status = 'pending' and r.site_id is null
        and not r.checkpoint_open and t.template_id is null
        and t.created_at < clock_timestamp() - interval '30 minutes'
        and not exists (select 1 from public.ai_requests c where c.generation_id = r.id and c.status = 'pending')
      for update of r
  loop
    perform public.finish_ai_request(stale.id, true);
  end loop;
  reservation := public.reserve_ai_request_for_plan(p_user_id, p_account_id, 'generate_site', p_model, null);
  update public.ai_requests set is_generation = true where id = reservation;
  insert into public.ai_template_builds(generation_id) values (reservation);
  return reservation;
end;
$$;

create function public.select_ai_template(p_user_id uuid, p_account_id uuid, p_generation_id uuid, p_template_id text)
returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare parent public.ai_requests%rowtype; selected text; page_count integer; surcharge integer;
begin
  select * into strict parent from public.ai_requests where id = p_generation_id for update;
  select template_id into strict selected from public.ai_template_builds where generation_id = parent.id for update;
  if parent.user_id <> p_user_id or parent.account_id <> p_account_id or parent.status <> 'pending' or not parent.is_generation
    or parent.generation_id is not null or parent.site_id is not null or parent.checkpoint_open
    or (not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
      and not exists (select 1 from public.account_members where account_id = parent.account_id
        and user_id = p_user_id and role = 'owner')) then
    raise exception 'This build is unavailable.' using errcode = '42501';
  end if;
  if selected is not null then
    raise exception 'This build is already being created.' using errcode = 'P0001';
  end if;
  select jsonb_array_length(pages) into page_count from public.site_templates
    where id = p_template_id and is_active and jsonb_typeof(pages) = 'array';
  if page_count is null or page_count not between 1 and 12 then
    raise exception 'This design is unavailable.' using errcode = 'P0001';
  end if;
  surcharge := 2 * greatest(0, page_count - 6);
  if surcharge > 0 and not parent.is_unlimited then
    update public.ai_limits set extra_credits = extra_credits - surcharge
      where account_id = parent.account_id and extra_credits >= surcharge;
    if not found then raise exception 'Not enough credits for the selected pages.' using errcode = 'P0001'; end if;
    update public.ai_requests set template_page_surcharge = surcharge where id = parent.id;
  end if;
  update public.ai_template_builds set template_id = p_template_id where generation_id = parent.id;
  return page_count;
end;
$$;

create function public.cancel_ai_template_build(p_user_id uuid, p_account_id uuid, p_generation_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare parent public.ai_requests%rowtype;
begin
  select r.* into strict parent from public.ai_requests r
    join public.ai_template_builds t on t.generation_id = r.id where r.id = p_generation_id for update of r;
  if parent.user_id <> p_user_id or parent.account_id <> p_account_id or parent.site_id is not null or parent.checkpoint_open then
    raise exception 'This build cannot be cancelled.' using errcode = '42501';
  end if;
  if exists (select 1 from public.ai_requests where generation_id = parent.id and status = 'pending') then
    raise exception 'An AI request needs reconciliation before this build can be cancelled.' using errcode = 'P0001';
  end if;
  if parent.status = 'pending' then perform public.finish_ai_request(parent.id, true); end if;
end;
$$;

create function public.start_ai_template_checkpoints(
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
  update public.sites set business = p_business,
    draft_header = case when draft_header is null then null
      else jsonb_set(jsonb_set(draft_header, '{logo,text}', to_jsonb(p_business->>'businessName'), true),
        '{cta,text}', to_jsonb('Get in touch'::text), true) end
    where id = site.id;
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

create function public.complete_ai_template_checkpoints(p_user_id uuid, p_generation_id uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare parent public.ai_requests%rowtype;
begin
  select r.* into strict parent from public.ai_requests r
    join public.ai_template_builds t on t.generation_id = r.id
    where r.id = p_generation_id and r.user_id = p_user_id for update of r;
  update public.ai_requests set checkpoint_open = false where id = parent.id;
  if exists (select 1 from public.ai_requests where generation_id = parent.id and status = 'completed')
    or not exists (select 1 from public.ai_page_retries where generation_id = parent.id) then
    perform public.finish_ai_site_generation(parent.id, false);
  end if;
end;
$$;

create function public.claim_ai_template_retry(p_retry_id uuid, p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare job public.ai_page_retries%rowtype; parent public.ai_requests%rowtype; page public.pages%rowtype; lease uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  select r.* into strict parent from public.ai_requests r
    join public.ai_template_builds t on t.generation_id = r.id
    where r.id = (select generation_id from public.ai_page_retries where id = p_retry_id) for update of r;
  select * into strict job from public.ai_page_retries where id = p_retry_id for update;
  select * into strict page from public.pages where id = job.page_id;
  if parent.user_id <> p_user_id or parent.site_id is distinct from page.site_id or parent.status = 'failed'
    or not exists (select 1 from public.sites where id = page.site_id and account_id = parent.account_id)
    or (not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
      and not exists (select 1 from public.account_members where account_id = parent.account_id
        and user_id = p_user_id and role = 'owner')) then
    raise exception 'This retry is not available.' using errcode = '42501';
  end if;
  if parent.checkpoint_open and exists (select 1 from public.ai_template_builds
    where generation_id = parent.id and started_at > clock_timestamp() - interval '15 minutes') then
    raise exception 'This build is still running. Wait before retrying unfinished pages.' using errcode = 'P0001';
  end if;
  if page.draft_data is distinct from job.expected_draft or page.slug is distinct from job.spec#>>'{build,page,slug}' then
    raise exception 'This draft changed. No AI content was written.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ai_requests child where child.generation_id = parent.id
    and child.status = 'pending') then
    raise exception 'An earlier AI request needs reconciliation before retrying.' using errcode = 'P0001';
  end if;
  if job.leased_at > clock_timestamp() - interval '15 minutes'
    or exists (select 1 from public.ai_requests where user_id = p_user_id and generation_id is not null
      and is_generation and created_at > clock_timestamp() - interval '1 minute') then
    raise exception 'Another attempt is running or finished recently. Try again in a minute.' using errcode = 'P0001';
  end if;
  update public.ai_requests set checkpoint_open = false where id = parent.id;
  insert into public.ai_requests(account_id, user_id, site_id, action, model, is_generation, generation_id, is_unlimited)
    values (parent.account_id, p_user_id, page.site_id, 'generate_site', parent.model, true, parent.id, parent.is_unlimited)
    returning id into lease;
  update public.ai_page_retries set lease_id = lease, leased_at = clock_timestamp() where id = job.id;
  return jsonb_build_object('leaseId', lease, 'generationId', parent.id, 'siteId', page.site_id,
    'accountId', parent.account_id, 'pageId', page.id, 'slug', page.slug, 'spec', job.spec);
end;
$$;

revoke all on function public.begin_ai_template_build(uuid, uuid, text),
  public.select_ai_template(uuid, uuid, uuid, text), public.cancel_ai_template_build(uuid, uuid, uuid),
  public.start_ai_template_checkpoints(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb),
  public.complete_ai_template_checkpoints(uuid, uuid), public.claim_ai_template_retry(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_ai_template_build(uuid, uuid, text),
  public.select_ai_template(uuid, uuid, uuid, text), public.cancel_ai_template_build(uuid, uuid, uuid),
  public.start_ai_template_checkpoints(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb),
  public.complete_ai_template_checkpoints(uuid, uuid), public.claim_ai_template_retry(uuid, uuid)
  to service_role;

commit;
