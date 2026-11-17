create table public.domain_requests (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  domain text not null check (length(domain) <= 249 and domain ~
    '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])$'),
  provider text not null check (provider in ('godaddy', 'namecheap', 'cloudflare', 'squarespace',
    'wix', 'bluehost', 'hostgator', 'hostinger', 'ionos', 'network-solutions', 'porkbun', 'route53', 'vercel', 'other')),
  status text not null default 'requested' check (status in ('requested', 'in_progress', 'done', 'needs_info')),
  notes text not null default '' check (length(notes) <= 1000),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  notification_sent_at timestamptz,
  notification_claimed_at timestamptz
);
create index domain_requests_site_time_idx on public.domain_requests(site_id, created_at desc);
create unique index domain_requests_one_open_idx on public.domain_requests(site_id, domain)
  where status in ('requested', 'in_progress', 'needs_info');
create index domain_requests_pending_notifications_idx on public.domain_requests(id)
  where status = 'done' and notification_sent_at is null;
alter table public.domain_requests enable row level security;
revoke all on public.domain_requests from public, anon, authenticated;
grant select on public.domain_requests to authenticated;
grant insert (site_id, domain, provider, created_by) on public.domain_requests to authenticated;
grant update (status, notes) on public.domain_requests to authenticated;
grant all on public.domain_requests to service_role;

create policy "owners read account domain requests" on public.domain_requests
  for select to authenticated using (exists (
    select 1 from public.sites s where s.id = site_id and public.is_account_owner(s.account_id)
  ));
create policy "owners create account domain requests" on public.domain_requests
  for insert to authenticated with check (
    created_by = auth.uid() and status = 'requested' and notes = '' and exists (
      select 1 from public.sites s where s.id = site_id and public.is_account_owner(s.account_id)
    )
  );
create policy "super admins read domain requests" on public.domain_requests
  for select to authenticated using (public.is_super_admin());
create policy "super admins update domain requests" on public.domain_requests
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy "service manages domain request notifications" on public.domain_requests
  for all to service_role using (true) with check (true);

create function public.track_domain_request_completion()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status then
    new.done_at := case when new.status = 'done' then now() else null end;
    new.notification_sent_at := null;
    new.notification_claimed_at := null;
  end if;
  return new;
end;
$$;
create trigger track_domain_request_completion before update of status on public.domain_requests
  for each row execute function public.track_domain_request_completion();
