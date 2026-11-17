-- Only owners and agency admins may mark submissions read.
create policy "owners update submission read status" on public.form_submissions
  for update to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id and public.is_account_owner(s.account_id)))
  with check (exists (select 1 from public.sites s where s.id = site_id and public.is_account_owner(s.account_id)));
revoke update on public.form_submissions from anon, authenticated;
grant update (is_read) on public.form_submissions to authenticated;

-- A private, expiring fixed window shared by all app instances.
create table public.form_rate_limits (
  site_id uuid not null references public.sites(id) on delete cascade,
  ip_hash text not null,
  window_start timestamptz not null,
  attempts integer not null,
  primary key (site_id, ip_hash)
);
alter table public.form_rate_limits enable row level security;
revoke all on public.form_rate_limits from public, anon, authenticated;
grant all on public.form_rate_limits to service_role;

create function public.submit_contact_form(
  p_site_id uuid, p_ip_hash text, p_path text, p_form_name text, p_data jsonb
) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  request_time timestamptz := clock_timestamp();
  current_attempts integer;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate limit key';
  end if;
  delete from public.form_rate_limits where window_start < request_time - interval '1 day';
  insert into public.form_rate_limits(site_id, ip_hash, window_start, attempts)
    values (p_site_id, p_ip_hash, request_time, 1)
  on conflict (site_id, ip_hash) do update set
    window_start = case when public.form_rate_limits.window_start <= request_time - interval '10 minutes'
      then request_time else public.form_rate_limits.window_start end,
    attempts = case when public.form_rate_limits.window_start <= request_time - interval '10 minutes'
      then 1 else public.form_rate_limits.attempts + 1 end
  returning attempts into current_attempts;
  if current_attempts > 10 then return false; end if;
  insert into public.form_submissions(site_id, page_path, form_name, data)
    values (p_site_id, p_path, p_form_name, p_data);
  return true;
end;
$$;
revoke all on function public.submit_contact_form(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_contact_form(uuid, text, text, text, jsonb) to service_role;
