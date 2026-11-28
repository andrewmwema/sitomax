-- Provider mappings stay encrypted; clients only read normalized account cards.
create table public.social_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  profile_key text not null default 'default',
  provider text not null default 'upload_post' check (provider = 'upload_post'),
  encrypted_provider_profile_id text,
  last_synced_at timestamptz,
  action_window timestamptz not null default now(),
  action_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (account_id, profile_key),
  unique (id, account_id),
  check (encrypted_provider_profile_id is null or
    (length(encrypted_provider_profile_id) between 40 and 1000 and encrypted_provider_profile_id like 'v1.%'))
);

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  account_id uuid not null,
  platform text not null check (platform in ('facebook', 'instagram', 'google_business', 'linkedin')),
  display_name text not null check (length(display_name) <= 500),
  avatar_url text check (avatar_url is null or (length(avatar_url) <= 4000 and avatar_url ~ '^https?://')),
  status text not null check (status in ('connected', 'needs_reconnect', 'disconnected')),
  last_synced_at timestamptz not null default now(),
  foreign key (profile_id, account_id) references public.social_profiles(id, account_id) on delete cascade,
  unique (profile_id, platform)
);
create index social_accounts_account_idx on public.social_accounts(account_id);

create table public.social_provider_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  action text not null,
  request_summary jsonb not null default '{}',
  response_summary jsonb not null default '{}',
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index social_provider_logs_account_created_idx on public.social_provider_logs(account_id, created_at desc);

alter table public.social_profiles enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_provider_logs enable row level security;
revoke all on public.social_profiles, public.social_accounts, public.social_provider_logs from public, anon, authenticated;
grant select on public.social_profiles, public.social_accounts, public.social_provider_logs to authenticated;
grant all on public.social_profiles, public.social_accounts, public.social_provider_logs to service_role;
create policy "agency reads social mappings" on public.social_profiles for select to authenticated using (public.is_super_admin());
create policy "owners read social accounts" on public.social_accounts for select to authenticated
  using (public.is_super_admin() or public.is_account_owner(account_id));
create policy "agency reads social logs" on public.social_provider_logs for select to authenticated using (public.is_super_admin());

-- This RPC exposes ciphertext only, never a provider username or credential.
create function public.social_connection_profile(p_account_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.social_profiles;
  window_start timestamptz := date_trunc('minute', clock_timestamp());
begin
  if auth.uid() is null or not (public.is_super_admin() or public.is_account_owner(p_account_id)) then
    raise exception 'Social account owner access required' using errcode = '42501';
  end if;
  insert into public.social_profiles(account_id) values (p_account_id)
    on conflict (account_id, profile_key) do nothing;
  select * into strict item from public.social_profiles
    where account_id = p_account_id and profile_key = 'default' for update;
  if item.action_window = window_start and item.action_count >= 30 then
    raise exception 'Social action limit reached. Wait a minute and try again.' using errcode = 'P0001';
  end if;
  update public.social_profiles set action_window = window_start,
    action_count = case when action_window = window_start then action_count + 1 else 1 end
    where id = item.id;
  return jsonb_build_object('id', item.id, 'encrypted_provider_profile_id', item.encrypted_provider_profile_id,
    'requested_at', clock_timestamp());
end;
$$;

create function public.save_social_profile_mapping(p_profile_id uuid, p_ciphertext text)
returns void language plpgsql security definer set search_path = public as $$
declare
  item public.social_profiles;
begin
  select * into item from public.social_profiles where id = p_profile_id for update;
  if auth.uid() is null or item.id is null or not (public.is_super_admin() or public.is_account_owner(item.account_id)) then
    raise exception 'Social account owner access required' using errcode = '42501';
  end if;
  -- The mapping is immutable. A retry or competing request cannot replace it.
  update public.social_profiles set encrypted_provider_profile_id = p_ciphertext
    where id = p_profile_id and encrypted_provider_profile_id is null;
end;
$$;

create function public.sync_social_accounts(p_profile_id uuid, p_started_at timestamptz, p_accounts jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  item public.social_profiles;
  entry jsonb;
begin
  select * into item from public.social_profiles where id = p_profile_id for update;
  if auth.uid() is null or item.id is null or not (public.is_super_admin() or public.is_account_owner(item.account_id)) then
    raise exception 'Social account owner access required' using errcode = '42501';
  end if;
  if p_started_at is null or p_started_at > clock_timestamp() or jsonb_typeof(p_accounts) is distinct from 'array'
    or jsonb_array_length(p_accounts) > 4 then
    raise exception 'Invalid social sync' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_accounts) a group by a->>'platform' having count(*) > 1) then
    raise exception 'Duplicate social platform' using errcode = '22023';
  end if;
  if item.last_synced_at is not null and item.last_synced_at >= p_started_at then return false; end if;
  update public.social_accounts set status = 'disconnected', last_synced_at = p_started_at where profile_id = item.id;
  for entry in select value from jsonb_array_elements(p_accounts) loop
    insert into public.social_accounts(profile_id, account_id, platform, display_name, avatar_url, status, last_synced_at)
      values (item.id, item.account_id, entry->>'platform', entry->>'displayName', entry->>'avatarUrl', entry->>'status', p_started_at)
    on conflict (profile_id, platform) do update set display_name = excluded.display_name,
      avatar_url = excluded.avatar_url, status = excluded.status, last_synced_at = excluded.last_synced_at;
  end loop;
  update public.social_profiles set last_synced_at = p_started_at where id = item.id;
  return true;
end;
$$;

-- Accept only bounded metadata, never arbitrary request/response bodies.
create function public.log_social_provider_call(p_account_id uuid, p_action text, p_ok boolean, p_http_status integer, p_error_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.is_super_admin() or public.is_account_owner(p_account_id)) then
    raise exception 'Social account owner access required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('create_profile', 'connect_url', 'list_accounts', 'publish', 'status', 'history',
    'destinations', 'google_post', 'list_reviews', 'reply_review', 'delete_profile')
    or p_ok is null or p_http_status is null or p_http_status not between 0 and 599
    or (p_error_code is not null and p_error_code not in ('not_configured', 'profile_limit', 'auth_expired', 'rate_limited',
      'media_invalid', 'platform_rejected', 'unavailable', 'outcome_unknown', 'invalid_response', 'conflict', 'unknown')) then
    raise exception 'Invalid social log metadata' using errcode = '22023';
  end if;
  insert into public.social_provider_logs(account_id, created_by, action, ok, response_summary)
    values (p_account_id, auth.uid(), p_action, p_ok, jsonb_build_object('http_status', p_http_status, 'error_code', p_error_code));
end;
$$;

revoke all on function public.social_connection_profile(uuid),
  public.save_social_profile_mapping(uuid, text),
  public.sync_social_accounts(uuid, timestamptz, jsonb),
  public.log_social_provider_call(uuid, text, boolean, integer, text) from public, anon;
grant execute on function public.social_connection_profile(uuid),
  public.save_social_profile_mapping(uuid, text),
  public.sync_social_accounts(uuid, timestamptz, jsonb),
  public.log_social_provider_call(uuid, text, boolean, integer, text) to authenticated;
