-- Grader Phase C: admin reports list, sales-mode scans, share links, competitor comparisons and retention.
begin;

alter table public.grader_reports
  add column source text not null default 'public' check (source in ('public', 'admin')),
  add column share_disabled boolean not null default false,
  add column compare_of uuid references public.grader_reports(id) on delete set null;
create index grader_reports_compare_idx on public.grader_reports (compare_of, created_at desc)
  where compare_of is not null;
create index grader_reports_retention_idx on public.grader_reports (created_at)
  where source = 'public' and not unlocked;

alter table public.grader_config
  add column retention_days integer not null default 90 check (retention_days between 7 and 3650);

-- Admin scans skip the per-IP limit but still count toward the global daily limit.
-- Competitor scans must start from a complete report whose full results are visible.
drop function public.grader_create_report(text, text, text, text, text, text, text, text, text, text);
create function public.grader_create_report(
  p_secret text, p_slug text, p_url text, p_domain text, p_business_name text, p_city text,
  p_profile text, p_maps_url text, p_ip_hash text, p_user_agent text,
  p_source text default 'public', p_compare_slug text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare report_id uuid; base_id uuid;
begin
  perform public.check_grader_worker(p_secret);
  if p_source is null or p_source not in ('public', 'admin') then
    raise invalid_parameter_value using message = 'Invalid grader report source';
  end if;
  if p_compare_slug is not null then
    select id into base_id from public.grader_reports
      where slug = p_compare_slug and status = 'complete' and (unlocked or source = 'admin');
    if base_id is null then return jsonb_build_object('error', 'not_found'); end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('grader-scan-limit'));
  if p_source = 'public' and (
    (select count(*) from public.grader_reports where ip_hash = p_ip_hash and created_at >= now() - interval '1 hour') >= 5
    or (select count(*) from public.grader_reports where ip_hash = p_ip_hash and created_at >= now() - interval '1 day') >= 20) then
    return jsonb_build_object('error', 'rate_limit');
  end if;
  if (select count(*) from public.grader_reports where created_at >= date_trunc('day', now(), 'UTC')) >=
    (select daily_scan_limit from public.grader_config) then
    return jsonb_build_object('error', 'busy');
  end if;
  insert into public.grader_reports
    (slug, url_input, domain, business_name, city, has_google_profile, google_maps_url, ip_hash, user_agent, source, compare_of)
    values (p_slug, p_url, p_domain, p_business_name, p_city, p_profile, p_maps_url, p_ip_hash, left(p_user_agent, 512),
      p_source, base_id)
    returning id into report_id;
  return jsonb_build_object('id', report_id, 'slug', p_slug);
end;
$$;

-- Admin reports are shown in full without the email gate; `unlocked` in the payload means "full report visible".
create or replace function public.grader_get_report(p_secret text, p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare report public.grader_reports; full_report boolean;
begin
  perform public.check_grader_worker(p_secret);
  update public.grader_reports set status = 'failed', completed_at = now(),
    progress = progress || '{"scan":"failed"}'::jsonb
    where slug = p_slug and status in ('queued', 'running') and created_at < now() - interval '4 minutes';
  select * into report from public.grader_reports where slug = p_slug;
  if not found then return null; end if;
  full_report := report.unlocked or report.source = 'admin';
  return jsonb_build_object(
    'slug', report.slug, 'url', report.final_url, 'domain', report.domain,
    'status', report.status, 'progress', report.progress, 'scores', report.scores,
    'screenshot_url', report.screenshot_url, 'unlocked', full_report,
    'share_disabled', report.share_disabled,
    'scanned_at', coalesce(report.completed_at, report.created_at),
    'headline', report.ai_summary->'headline', 'top_issues', (
      select jsonb_agg(jsonb_build_object('title', issue->'title', 'why_it_matters', issue->'why_it_matters'))
      from jsonb_array_elements(case when jsonb_typeof(report.ai_summary->'top_issues') = 'array'
        then report.ai_summary->'top_issues' else '[]'::jsonb end) issue
    )
  ) || case when full_report then jsonb_build_object(
              'results', report.results, 'ai_summary', report.ai_summary, 'business_name', report.business_name,
              'competitor_slug', (select c.slug from public.grader_reports c where c.compare_of = report.id
                order by c.created_at desc limit 1))
            else '{}'::jsonb end;
end;
$$;

revoke all on function public.grader_create_report(text, text, text, text, text, text, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.grader_create_report(text, text, text, text, text, text, text, text, text, text, text, text)
  to anon, authenticated;

create function public.grader_set_share_disabled(p_slug text, p_disabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_super_admin() then
    raise insufficient_privilege using message = 'Only super admins can change grader share links';
  end if;
  update public.grader_reports set share_disabled = coalesce(p_disabled, false) where slug = p_slug;
  return found;
end;
$$;
revoke all on function public.grader_set_share_disabled(text, boolean) from public, anon, authenticated;
grant execute on function public.grader_set_share_disabled(text, boolean) to authenticated;

-- Runs with the caller's rights, so grader RLS (super admin only) still applies.
create function public.grader_admin_list_reports(
  p_search text default null, p_unlocked boolean default null, p_grade text default null,
  p_source text default null, p_from timestamptz default null, p_to timestamptz default null,
  p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, slug text, created_at timestamptz, domain text, business_name text, url_input text, final_url text,
  city text, has_google_profile text, google_maps_url text, status text, overall integer, grade text, source text,
  unlocked boolean, share_disabled boolean, unlock_name text, unlock_email text, lead_id uuid, compare_of_slug text,
  total_count bigint
) language sql stable security invoker set search_path = '' as $$
  with filtered as (
    select r.id, r.slug, r.created_at, r.domain, r.business_name, r.url_input, r.final_url, r.city,
      r.has_google_profile, r.google_maps_url, r.status,
      case when jsonb_typeof(r.scores->'overall') = 'number' then round((r.scores->>'overall')::numeric)::integer end as overall,
      r.scores->>'grade' as grade, r.source, r.unlocked, r.share_disabled, u.name as unlock_name, u.email as unlock_email,
      r.lead_id, (select b.slug from public.grader_reports b where b.id = r.compare_of) as compare_of_slug
    from public.grader_reports r
    left join lateral (
      select gu.name, gu.email from public.grader_unlocks gu where gu.report_id = r.id order by gu.created_at desc limit 1
    ) u on true
    where public.is_super_admin()
      and (coalesce(p_search, '') = '' or strpos(lower(concat_ws(' ', r.domain, r.business_name, r.url_input, r.final_url,
        r.slug, u.name, u.email)), lower(p_search)) > 0)
      and (p_unlocked is null or r.unlocked = p_unlocked)
      and (p_grade is null or (p_grade = 'none' and r.scores->>'grade' is null) or r.scores->>'grade' = p_grade)
      and (p_source is null or r.source = p_source)
      and (p_from is null or r.created_at >= p_from)
      and (p_to is null or r.created_at < p_to)
  )
  select f.*, count(*) over () as total_count from filtered f
  order by f.created_at desc, f.id
  limit least(greatest(coalesce(p_limit, 25), 1), 5000) offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke all on function public.grader_admin_list_reports(text, boolean, text, text, timestamptz, timestamptz, integer, integer)
  from public, anon, authenticated;
grant execute on function public.grader_admin_list_reports(text, boolean, text, text, timestamptz, timestamptz, integer, integer)
  to authenticated;

-- Retention: locked public scans expire; unlocked reports, admin reports and competitor scans
-- attached to a kept report stay permanently.
create function public.grader_retention_expired(p_secret text, p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare days integer; expired jsonb;
begin
  perform public.check_grader_worker(p_secret);
  select retention_days into days from public.grader_config;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'slug', r.slug, 'screenshot_url', r.screenshot_url)), '[]'::jsonb)
    into expired
    from (
      select r.id, r.slug, r.screenshot_url from public.grader_reports r
      where r.source = 'public' and not r.unlocked and r.created_at < now() - make_interval(days => days)
        and not exists (select from public.grader_reports kept where kept.id = r.compare_of
          and (kept.unlocked or kept.source = 'admin'))
      order by r.created_at
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    ) r;
  return jsonb_build_object('retention_days', days, 'reports', expired);
end;
$$;

create function public.grader_delete_expired(p_secret text, p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare days integer; deleted integer;
begin
  perform public.check_grader_worker(p_secret);
  select retention_days into days from public.grader_config;
  delete from public.grader_reports r
    where r.id = any(p_ids) and r.source = 'public' and not r.unlocked
      and r.created_at < now() - make_interval(days => days)
      and not exists (select from public.grader_reports kept where kept.id = r.compare_of
        and (kept.unlocked or kept.source = 'admin'));
  get diagnostics deleted = row_count;
  return deleted;
end;
$$;
revoke all on function public.grader_retention_expired(text, integer), public.grader_delete_expired(text, uuid[])
  from public, anon, authenticated;
grant execute on function public.grader_retention_expired(text, integer), public.grader_delete_expired(text, uuid[])
  to anon, authenticated;

-- Storage deletes return the removed rows, so the worker also needs to read screenshots.
create policy "grader worker reads screenshots" on storage.objects for select to anon, authenticated
  using (bucket_id = 'grader-screenshots' and public.grader_storage_authorized());
create policy "grader worker deletes screenshots" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'grader-screenshots' and public.grader_storage_authorized());
create policy "grader worker deletes reports" on storage.objects for delete to anon, authenticated
  using (bucket_id = 'grader-reports' and public.grader_storage_authorized());

commit;
