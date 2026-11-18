-- One rolling allowance across all app instances using the stock-photo key.
create table public.photo_search_limits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default clock_timestamp()
);
create index photo_search_limits_date on public.photo_search_limits(created_at);
alter table public.photo_search_limits enable row level security;
revoke all on public.photo_search_limits from public, anon, authenticated;
grant all on public.photo_search_limits to service_role;
create policy "service manages photo limits" on public.photo_search_limits
  for all to service_role using (true) with check (true);

create function public.consume_photo_search(p_account_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not (public.is_super_admin() or public.is_account_member(p_account_id)) then
    raise exception 'Account access required.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock-photo-search', 0));
  delete from public.photo_search_limits where created_at <= clock_timestamp() - interval '60 seconds';
  if (select count(*) from public.photo_search_limits) >= 100 then return false; end if;
  insert into public.photo_search_limits default values;
  return true;
end;
$$;
revoke all on function public.consume_photo_search(uuid) from public, anon;
grant execute on function public.consume_photo_search(uuid) to authenticated;

-- A super admin uploads selected assets into the future site's UUID folder.
-- The site, pages and business data still commit atomically after validation.
create function public.create_ai_site_with_business(
  p_account_id uuid, p_name text, p_subdomain text, p_theme jsonb, p_pages jsonb, p_business jsonb, p_site_id uuid
) returns table(site_id uuid, page_id uuid)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare home_id uuid;
begin
  if p_site_id is null or jsonb_typeof(p_business) is distinct from 'object' then
    raise exception 'Invalid generated site.';
  end if;
  insert into public.sites(id, account_id, name, subdomain, template_key, business)
    values (p_site_id, p_account_id, p_name, p_subdomain, 'ai', p_business);
  home_id := public.apply_generated_drafts(p_site_id, p_theme, p_pages, false);
  return query select p_site_id, home_id;
end;
$$;
revoke all on function public.create_ai_site_with_business(uuid, text, text, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_ai_site_with_business(uuid, text, text, jsonb, jsonb, jsonb, uuid) to service_role;
