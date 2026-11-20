begin;

alter table public.blog_settings
  add column show_in_menu boolean not null default true,
  add column noindex_tags boolean not null default true;

create or replace function public.lookup_tenant_redirect(p_host text, p_path text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  with site as (
    select s.id, coalesce(
      (select regexp_replace(bs.blog_path, '/+$', '') from public.blog_settings bs where bs.site_id = s.id),
      '/blog'
    ) as blog_path
    from public.sites s
    where s.subdomain = lower(p_host) or (s.custom_domain = lower(p_host) and s.domain_verified)
    order by case when s.subdomain = lower(p_host) then 0 else 1 end
    limit 1
  ), blog_redirect as (
    select site.blog_path || '/' || p.slug as to_path
    from site
    join public.post_redirects r on r.site_id = site.id
    join public.posts p on p.site_id = site.id and p.id = r.to_post_id
    where p_path = site.blog_path || '/' || r.from_slug
      and p.status = 'published' and p.published_content is not null
    limit 1
  ), regular_redirect as (
    select r.to_path
    from public.redirects r join site on site.id = r.site_id
    where r.from_path = p_path
    limit 1
  )
  select coalesce((select to_path from blog_redirect), (select to_path from regular_redirect))
$$;

commit;
