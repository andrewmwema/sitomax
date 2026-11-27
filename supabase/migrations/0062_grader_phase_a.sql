begin;

create table public.grader_reports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  url_input text not null,
  final_url text,
  domain text not null,
  business_name text,
  city text,
  has_google_profile text check (has_google_profile in ('yes', 'no', 'not_sure')),
  google_maps_url text,
  status text not null default 'queued' check (status in ('queued', 'running', 'complete', 'failed')),
  progress jsonb not null default '{}',
  results jsonb,
  scores jsonb,
  ai_summary jsonb,
  screenshot_url text,
  unlocked boolean not null default false,
  lead_id uuid references public.form_submissions(id) on delete set null,
  ip_hash text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index grader_reports_rate_idx on public.grader_reports (ip_hash, created_at desc);
create index grader_reports_cache_idx on public.grader_reports (final_url, completed_at desc)
  where status = 'complete';
create index grader_reports_created_idx on public.grader_reports (created_at desc);

create table public.grader_unlocks (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.grader_reports(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  consent_marketing boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.grader_config (
  singleton boolean primary key default true check (singleton),
  secret_hash text check (secret_hash ~ '^[0-9a-f]{64}$'),
  daily_scan_limit integer not null default 300 check (daily_scan_limit > 0),
  places_daily_limit integer not null default 30 check (places_daily_limit between 1 and 30),
  places_monthly_limit integer not null default 900 check (places_monthly_limit between 1 and 900)
);
insert into public.grader_config (singleton) values (true);

create table public.grader_places_calls (
  id uuid primary key default gen_random_uuid(),
  business_key text not null,
  report_id uuid references public.grader_reports(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'ok', 'error', 'quota')),
  http_status integer,
  created_at timestamptz not null default now()
);
create index grader_places_calls_created_idx on public.grader_places_calls (created_at desc);
create table public.grader_places_cache (
  business_key text primary key,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create table public.grader_ai_usage (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.grader_reports(id) on delete set null,
  model text not null,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  created_at timestamptz not null default now()
);

alter table public.grader_reports enable row level security;
alter table public.grader_unlocks enable row level security;
alter table public.grader_config enable row level security;
alter table public.grader_places_calls enable row level security;
alter table public.grader_places_cache enable row level security;
alter table public.grader_ai_usage enable row level security;
revoke all on public.grader_reports, public.grader_unlocks, public.grader_config,
  public.grader_places_calls, public.grader_places_cache, public.grader_ai_usage
  from public, anon, authenticated;
grant select on public.grader_reports, public.grader_unlocks, public.grader_places_calls,
  public.grader_ai_usage to authenticated;
create policy grader_reports_admin_read on public.grader_reports for select to authenticated using (public.is_super_admin());
create policy grader_unlocks_admin_read on public.grader_unlocks for select to authenticated using (public.is_super_admin());
create policy grader_places_calls_admin_read on public.grader_places_calls for select to authenticated using (public.is_super_admin());
create policy grader_ai_usage_admin_read on public.grader_ai_usage for select to authenticated using (public.is_super_admin());

create function public.check_grader_worker(p_secret text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_secret is null or octet_length(p_secret) not between 32 and 512 or not exists (
    select from public.grader_config where secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) then raise insufficient_privilege using message = 'Grader worker is not authorized'; end if;
end;
$$;
revoke all on function public.check_grader_worker(text) from public, anon, authenticated;

create function public.grader_create_report(
  p_secret text, p_slug text, p_url text, p_domain text, p_business_name text, p_city text,
  p_profile text, p_maps_url text, p_ip_hash text, p_user_agent text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare report_id uuid;
begin
  perform public.check_grader_worker(p_secret);
  perform pg_advisory_xact_lock(hashtext('grader-scan-limit'));
  if (select count(*) from public.grader_reports where ip_hash = p_ip_hash and created_at >= now() - interval '1 hour') >= 5
    or (select count(*) from public.grader_reports where ip_hash = p_ip_hash and created_at >= now() - interval '1 day') >= 20 then
    return jsonb_build_object('error', 'rate_limit');
  end if;
  if (select count(*) from public.grader_reports where created_at >= date_trunc('day', now(), 'UTC')) >=
    (select daily_scan_limit from public.grader_config) then
    return jsonb_build_object('error', 'busy');
  end if;
  insert into public.grader_reports
    (slug, url_input, domain, business_name, city, has_google_profile, google_maps_url, ip_hash, user_agent)
    values (p_slug, p_url, p_domain, p_business_name, p_city, p_profile, p_maps_url, p_ip_hash, left(p_user_agent, 512))
    returning id into report_id;
  return jsonb_build_object('id', report_id, 'slug', p_slug);
end;
$$;

create function public.grader_update_report(p_secret text, p_id uuid, p_update jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_grader_worker(p_secret);
  update public.grader_reports set
    status = coalesce(p_update->>'status', status),
    progress = progress || coalesce(p_update->'progress', '{}'::jsonb),
    results = case when p_update ? 'results' then p_update->'results' else results end,
    scores = case when p_update ? 'scores' then p_update->'scores' else scores end,
    ai_summary = case when p_update ? 'ai_summary' then p_update->'ai_summary' else ai_summary end,
    final_url = coalesce(p_update->>'final_url', final_url),
    screenshot_url = coalesce(p_update->>'screenshot_url', screenshot_url),
    completed_at = case when p_update->>'status' in ('complete', 'failed') then now() else completed_at end
  where id = p_id;
  if not found then raise exception 'Grader report not found'; end if;
end;
$$;

create function public.grader_get_report(p_secret text, p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare report public.grader_reports;
begin
  perform public.check_grader_worker(p_secret);
  update public.grader_reports set status = 'failed', completed_at = now(),
    progress = progress || '{"scan":"failed"}'::jsonb
    where slug = p_slug and status in ('queued', 'running') and created_at < now() - interval '4 minutes';
  select * into report from public.grader_reports where slug = p_slug;
  if not found then return null; end if;
  return jsonb_build_object(
    'slug', report.slug, 'url', report.final_url, 'domain', report.domain,
    'status', report.status, 'progress', report.progress, 'scores', report.scores,
    'screenshot_url', report.screenshot_url, 'unlocked', report.unlocked,
    'headline', report.ai_summary->'headline', 'top_issues', (
      select jsonb_agg(jsonb_build_object('title', issue->'title', 'why_it_matters', issue->'why_it_matters'))
      from jsonb_array_elements(case when jsonb_typeof(report.ai_summary->'top_issues') = 'array'
        then report.ai_summary->'top_issues' else '[]'::jsonb end) issue
    )
  ) || case when report.unlocked then jsonb_build_object('results', report.results, 'ai_summary', report.ai_summary)
            else '{}'::jsonb end;
end;
$$;

create function public.grader_get_cache(p_secret text, p_id uuid, p_final_url text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cached public.grader_reports;
begin
  perform public.check_grader_worker(p_secret);
  select old.* into cached from public.grader_reports old
  join public.grader_reports current on current.id = p_id
  where old.id <> p_id and old.status = 'complete' and old.final_url = p_final_url
    and old.completed_at >= now() - interval '24 hours'
    and old.business_name is not distinct from current.business_name
    and old.city is not distinct from current.city
    and old.has_google_profile is not distinct from current.has_google_profile
    and old.google_maps_url is not distinct from current.google_maps_url
  order by old.completed_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('results', cached.results, 'scores', cached.scores,
    'ai_summary', cached.ai_summary, 'screenshot_url', cached.screenshot_url);
end;
$$;

create function public.grader_places_begin(p_secret text, p_report_id uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cached jsonb; call_id uuid; limits public.grader_config;
begin
  perform public.check_grader_worker(p_secret);
  perform pg_advisory_xact_lock(hashtext('grader-places-limit'));
  select result into cached from public.grader_places_cache
    where business_key = p_key and created_at >= now() - interval '7 days';
  if found then return jsonb_build_object('cached', cached); end if;
  select * into limits from public.grader_config;
  if (select count(*) from public.grader_places_calls where created_at >= date_trunc('day', now(), 'UTC')) >= limits.places_daily_limit
    or (select count(*) from public.grader_places_calls where created_at >= date_trunc('month', now(), 'UTC')) >= limits.places_monthly_limit then
    return jsonb_build_object('limited', true);
  end if;
  insert into public.grader_places_calls (business_key, report_id) values (p_key, p_report_id) returning id into call_id;
  return jsonb_build_object('call_id', call_id);
end;
$$;

create function public.grader_places_finish(p_secret text, p_call_id uuid, p_status text, p_http_status integer, p_result jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare key text;
begin
  perform public.check_grader_worker(p_secret);
  update public.grader_places_calls set status = p_status, http_status = p_http_status
    where id = p_call_id and status = 'pending' returning business_key into key;
  if not found then raise exception 'Places reservation not found'; end if;
  if p_status = 'ok' and p_result is not null then
    insert into public.grader_places_cache (business_key, result) values (key, p_result)
    on conflict (business_key) do update set result = excluded.result, created_at = now();
  end if;
end;
$$;

create function public.grader_record_ai_usage(p_secret text, p_report_id uuid, p_model text, p_input integer, p_output integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_grader_worker(p_secret);
  insert into public.grader_ai_usage (report_id, model, input_tokens, output_tokens)
    values (p_report_id, p_model, p_input, p_output);
end;
$$;

revoke all on function public.grader_create_report(text,text,text,text,text,text,text,text,text,text),
  public.grader_update_report(text,uuid,jsonb), public.grader_get_report(text,text),
  public.grader_get_cache(text,uuid,text), public.grader_places_begin(text,uuid,text),
  public.grader_places_finish(text,uuid,text,integer,jsonb), public.grader_record_ai_usage(text,uuid,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.grader_create_report(text,text,text,text,text,text,text,text,text,text),
  public.grader_update_report(text,uuid,jsonb), public.grader_get_report(text,text),
  public.grader_get_cache(text,uuid,text), public.grader_places_begin(text,uuid,text),
  public.grader_places_finish(text,uuid,text,integer,jsonb), public.grader_record_ai_usage(text,uuid,text,integer,integer)
  to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grader-screenshots', 'grader-screenshots', true, 3145728, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create function public.grader_storage_authorized() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select from public.grader_config
    where secret_hash is not null
      and secret_hash = encode(sha256(convert_to(
        coalesce((nullif(current_setting('request.headers', true), '')::jsonb)->>'x-grader-worker-secret', ''),
        'UTF8')), 'hex')
  )
$$;
revoke all on function public.grader_storage_authorized() from public;
grant execute on function public.grader_storage_authorized() to anon, authenticated;
create policy "grader worker uploads screenshots" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'grader-screenshots' and public.grader_storage_authorized());

commit;
