create function public.valid_site_seo(value jsonb)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select jsonb_typeof(value) = 'object'
    and not exists (select 1 from jsonb_object_keys(value) k
      where k not in ('socialImage', 'googleAnalyticsId', 'metaPixelId', 'googleVerification', 'noindex'))
    and (not value ? 'socialImage' or (
      jsonb_typeof(value->'socialImage') = 'string' and length(value->>'socialImage') <= 2048
      and ((value->>'socialImage') = ''
        or ((value->>'socialImage') ~ '^/' and (value->>'socialImage') !~ '^//' and (value->>'socialImage') !~ '[[:space:]\\]')
        or ((value->>'socialImage') ~* '^https?://[^/@[:space:]\\?#]+([/?#]|$)' and (value->>'socialImage') !~ '[[:space:]\\]'))
    ))
    and (not value ? 'googleAnalyticsId' or (jsonb_typeof(value->'googleAnalyticsId') = 'string' and value->>'googleAnalyticsId' ~ '^(G-[A-Z0-9]{4,20})?$'))
    and (not value ? 'metaPixelId' or (jsonb_typeof(value->'metaPixelId') = 'string' and value->>'metaPixelId' ~ '^([0-9]{5,25})?$'))
    and (not value ? 'googleVerification' or (jsonb_typeof(value->'googleVerification') = 'string' and value->>'googleVerification' ~ '^([A-Za-z0-9_-]{1,200})?$'))
    and (not value ? 'noindex' or jsonb_typeof(value->'noindex') = 'boolean')
$$;
alter table public.sites add column seo jsonb not null default '{}'::jsonb
  check (public.valid_site_seo(seo));
grant update (seo) on public.sites to authenticated;

create table public.redirects (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  from_path text not null,
  to_path text not null,
  created_at timestamptz not null default now(),
  unique (site_id, from_path),
  check (length(from_path) between 1 and 2048 and from_path ~ '^/' and from_path !~ '^//' and from_path !~ '[[:space:]\\?#]'),
  check (length(to_path) between 1 and 2048 and to_path ~ '^/' and to_path !~ '^//' and to_path !~ '[[:space:]\\]'),
  check (from_path <> to_path)
);
alter table public.redirects enable row level security;
create policy "members manage redirects" on public.redirects for all to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)))
  with check (exists (select 1 from public.sites s where s.id = site_id and public.is_account_member(s.account_id)));
create policy "super admin manages redirects" on public.redirects for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
grant select, insert, update, delete on public.redirects to authenticated;

-- Only the public destination is exposed; the table remains member-only.
create function public.lookup_tenant_redirect(p_host text, p_path text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  with site as (
    select id from public.sites s
    where s.subdomain = lower(p_host) or (s.custom_domain = lower(p_host) and s.domain_verified)
    order by case when s.subdomain = lower(p_host) then 0 else 1 end
    limit 1
  )
  select r.to_path from public.redirects r join site on site.id = r.site_id
  where r.from_path = p_path
  limit 1
$$;
revoke all on function public.lookup_tenant_redirect(text, text) from public;
grant execute on function public.lookup_tenant_redirect(text, text) to anon, authenticated;
