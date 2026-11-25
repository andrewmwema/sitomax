begin;

-- These replacements correct committed, unapplied migrations 0054 and 0055.
drop trigger capture_legacy_ai_generation_override on public.ai_limits;
create trigger capture_legacy_ai_generation_override
  after update of monthly_site_generations on public.ai_limits
  for each row when (old.monthly_site_generations is distinct from new.monthly_site_generations)
  execute function public.capture_legacy_ai_allowance_override('generations');

drop trigger capture_legacy_ai_edit_override on public.ai_limits;
create trigger capture_legacy_ai_edit_override
  after update of monthly_edits on public.ai_limits
  for each row when (old.monthly_edits is distinct from new.monthly_edits)
  execute function public.capture_legacy_ai_allowance_override('edits');

create or replace function public.reserve_ai_request_for_plan(
  p_user_id uuid, p_account_id uuid, p_action text, p_model text, p_site_id uuid default null
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  unlimited boolean;
  internal boolean;
  limits public.ai_limits%rowtype;
  allowance public.ai_plan_allowances%rowtype;
  account_override public.ai_account_allowance_overrides%rowtype;
  used bigint;
  quota int;
  credits int := 0;
  request_id uuid;
  request_time timestamptz;
  month_start timestamptz;
begin
  select is_super_admin into unlimited from public.profiles where id = p_user_id;
  select is_internal into internal from public.accounts where id = p_account_id;
  if unlimited is null or internal is null or (not unlimited and (internal or not exists (
    select 1 from public.account_members where user_id = p_user_id and account_id = p_account_id
  ))) then raise exception 'You do not have access to this AI account.' using errcode = '42501'; end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites where id = p_site_id and account_id = p_account_id
  ) then raise exception 'The site does not belong to this account.' using errcode = '42501'; end if;
  if p_action not in ('generate_site', 'edit_section', 'rewrite_text') or p_action is null
    or p_model is null or length(p_model) not between 1 and 100 then
    raise exception 'Invalid AI request.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  if not unlimited then
    select * into limits from public.ai_limits where account_id = p_account_id for update;
    if not found then
      raise exception 'AI limits are not configured for this account. Contact your agency.' using errcode = 'P0001';
    end if;
    select p.* into allowance from public.accounts a
      join public.ai_plan_allowances p on p.plan_key = a.site_plan_key
      where a.id = p_account_id;
    if not found then raise exception 'AI allowances are not configured for this plan.' using errcode = 'P0001'; end if;
    select * into account_override from public.ai_account_allowance_overrides where account_id = p_account_id;
  end if;
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
    quota := case when p_action = 'generate_site'
      then coalesce(account_override.monthly_site_generations, allowance.monthly_site_generations)
      else coalesce(account_override.monthly_edits, allowance.monthly_edits) end;
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
  update public.sites set business = p_business,
    draft_header = case when draft_header is null then null
      when cta_text is null then jsonb_set(draft_header, '{logo,text}', to_jsonb(p_business->>'businessName'), true)
      else jsonb_set(jsonb_set(draft_header, '{logo,text}', to_jsonb(p_business->>'businessName'), true),
        '{cta,text}', to_jsonb(cta_text), true) end
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

commit;
