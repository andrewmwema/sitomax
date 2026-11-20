begin;

alter table public.page_views
  add column blog_post_id uuid,
  add constraint page_views_blog_post_fkey foreign key (site_id, blog_post_id)
    references public.posts(site_id, id) on delete set null (blog_post_id);

create index page_views_blog_post_idx on public.page_views (site_id, created_at, blog_post_id)
  where blog_post_id is not null;

create function public.blog_analytics(p_site_id uuid, p_days integer)
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
    select 1 from public.sites s where s.id = p_site_id
      and (public.is_super_admin() or public.is_account_owner(s.account_id))
  ) then
    raise exception 'Not authorized to view blog analytics' using errcode = '42501';
  end if;

  with counts as (
    select blog_post_id, count(*) as visits from public.page_views
    where site_id = p_site_id and blog_post_id is not null
      and created_at >= (start_day::timestamp at time zone 'UTC')
      and created_at < (end_day::timestamp at time zone 'UTC')
    group by blog_post_id
  ), top_posts as (
    select p.id, coalesce(nullif(p.published_content #>> '{metadata,title}', ''), p.title) as title, c.visits
    from counts c join public.posts p on p.site_id = p_site_id and p.id = c.blog_post_id
    order by c.visits desc, p.id limit 10
  )
  select jsonb_build_object(
    'visits', (select coalesce(sum(visits), 0) from counts),
    'posts', (select coalesce(jsonb_agg(to_jsonb(top_posts) order by visits desc, id), '[]'::jsonb) from top_posts)
  ) into result;
  return result;
end;
$$;

revoke all on function public.blog_analytics(uuid, integer) from public, anon;
grant execute on function public.blog_analytics(uuid, integer) to authenticated;

commit;
