create table public.conversion_events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  event_type text not null check (event_type = 'cta_click'),
  path text not null,
  created_at timestamptz not null default now()
);

create index conversion_events_site_id_created_at_idx
  on public.conversion_events (site_id, created_at);

alter table public.conversion_events enable row level security;

create policy "super admin all" on public.conversion_events
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "owners read conversion events" on public.conversion_events
  for select using (
    exists (
      select 1 from public.sites s
      where s.id = site_id and public.is_account_owner(s.account_id)
    )
  );

revoke all on public.conversion_events from public, anon, authenticated;
grant select on public.conversion_events to authenticated;
grant all on public.conversion_events to service_role;
revoke all on sequence public.conversion_events_id_seq from anon, authenticated;
grant all on sequence public.conversion_events_id_seq to service_role;

create or replace function public.site_analytics(p_site_id uuid, p_days integer)
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
    'cta_clicks', (select count(*) from public.conversion_events
      where site_id = p_site_id
        and event_type = 'cta_click'
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
