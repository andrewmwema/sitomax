-- UTC calendar days, including today. Daily-rotating hashes cannot identify
-- the same person across days; unique_visitors is a sum of daily uniques.
create function public.site_analytics(p_site_id uuid, p_days integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  start_day date := (now() at time zone 'UTC')::date - (p_days - 1);
  end_day date := (now() at time zone 'UTC')::date + 1;
  result jsonb;
begin
  if p_days is null or p_days not in (7, 30, 90) then
    raise exception 'Invalid analytics date range';
  end if;
  if not exists (
    select 1 from public.sites s
    where s.id = p_site_id
      and (public.is_super_admin() or public.is_account_owner(s.account_id))
  ) then
    raise exception 'Not authorized to view site analytics' using errcode = '42501';
  end if;

  with views as (
    select path, referrer, device, visitor_hash, (created_at at time zone 'UTC')::date as day
    from public.page_views
    where site_id = p_site_id
      and created_at >= (start_day::timestamp at time zone 'UTC')
      and created_at < (end_day::timestamp at time zone 'UTC')
  ),
  daily as (
    select d.day::date as day, count(v.day) as visits, count(distinct v.visitor_hash) as visitors
    from generate_series(start_day::timestamp, (end_day - 1)::timestamp, interval '1 day') as d(day)
    left join views v on v.day = d.day::date
    group by d.day
  ),
  pages as (
    select coalesce(nullif(path, ''), '/') as label, count(*) as count
    from views group by 1 order by count desc, label limit 10
  ),
  referrers as (
    select coalesce(nullif(referrer, ''), 'Direct') as label, count(*) as count
    from views group by 1 order by count desc, label limit 10
  ),
  devices as (
    select coalesce(nullif(device, ''), 'unknown') as label, count(*) as count
    from views group by 1 order by count desc, label
  )
  select jsonb_build_object(
    'visits', (select count(*) from views),
    'unique_visitors', (select coalesce(sum(visitors), 0) from daily),
    'form_submissions', (select count(*) from public.form_submissions
      where site_id = p_site_id
        and created_at >= (start_day::timestamp at time zone 'UTC')
        and created_at < (end_day::timestamp at time zone 'UTC')),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'visits', visits) order by day), '[]'::jsonb) from daily),
    'pages', (select coalesce(jsonb_agg(to_jsonb(pages) order by count desc, label), '[]'::jsonb) from pages),
    'referrers', (select coalesce(jsonb_agg(to_jsonb(referrers) order by count desc, label), '[]'::jsonb) from referrers),
    'devices', (select coalesce(jsonb_agg(to_jsonb(devices) order by count desc, label), '[]'::jsonb) from devices)
  ) into result;
  return result;
end;
$$;

revoke all on function public.site_analytics(uuid, integer) from public, anon;
grant execute on function public.site_analytics(uuid, integer) to authenticated;

create index form_submissions_site_id_created_at_idx
  on public.form_submissions (site_id, created_at);
