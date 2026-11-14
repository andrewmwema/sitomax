-- 0001_init.sql
-- Initial schema for the white-label multi-tenant website platform.
-- Every table has RLS enabled. Access rules live here, not in the UI.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Single-row table with the agency's own branding.
create table public.agency_settings (
  id int primary key default 1 check (id = 1),
  name text,
  logo_url text,
  primary_color text,
  support_email text
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Client sub-accounts.
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.account_members (
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  primary key (account_id, user_id)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  name text,
  subdomain text unique not null,
  custom_domain text unique,
  domain_verified boolean not null default false,
  theme jsonb not null default '{}',
  template_key text,
  created_at timestamptz not null default now()
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  slug text not null default '', -- '' = home page
  title text,
  draft_data jsonb not null default '{}',
  published_data jsonb,
  published_at timestamptz,
  seo jsonb not null default '{}',
  sort_order int not null default 0,
  unique (site_id, slug)
);

create table public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites (id) on delete cascade,
  page_path text,
  form_name text,
  data jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.page_views (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites (id) on delete cascade,
  path text,
  referrer text,
  device text,
  country text,
  visitor_hash text,
  created_at timestamptz not null default now()
);

create index page_views_site_id_created_at_idx
  on public.page_views (site_id, created_at);

-- ---------------------------------------------------------------------------
-- Profile auto-creation trigger
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they bypass RLS and avoid recursion)
-- ---------------------------------------------------------------------------

create function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create function public.is_account_member(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_members m
    where m.account_id = acc
      and m.user_id = auth.uid()
  );
$$;

create function public.is_account_owner(acc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_members m
    where m.account_id = acc
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.agency_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.sites enable row level security;
alter table public.pages enable row level security;
alter table public.form_submissions enable row level security;
alter table public.page_views enable row level security;

-- Super admin (the agency) can do everything on every table.
create policy "super admin all" on public.agency_settings
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin all" on public.profiles
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin all" on public.accounts
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin all" on public.account_members
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin all" on public.sites
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin all" on public.pages
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin all" on public.form_submissions
  for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super admin all" on public.page_views
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- agency_settings: anyone authenticated can read; only super admin updates
-- (covered by the super admin policy above).
create policy "authenticated can read agency settings" on public.agency_settings
  for select to authenticated using (true);

-- profiles: users can read and update their own row, but never change
-- is_super_admin (the new value must equal the stored value, which the
-- security definer helper reads without RLS).
create policy "users read own profile" on public.profiles
  for select using (id = auth.uid());

create policy "users update own profile" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and is_super_admin = public.is_super_admin());

-- accounts: members can read their own account.
create policy "members read own account" on public.accounts
  for select using (public.is_account_member(id));

-- account_members: members can see who is in their account;
-- owners can manage editors (never other owners).
create policy "members read account members" on public.account_members
  for select using (public.is_account_member(account_id));

create policy "owners add editors" on public.account_members
  for insert with check (public.is_account_owner(account_id) and role = 'editor');

create policy "owners update editors" on public.account_members
  for update using (public.is_account_owner(account_id) and role = 'editor')
  with check (public.is_account_owner(account_id) and role = 'editor');

create policy "owners remove editors" on public.account_members
  for delete using (public.is_account_owner(account_id) and role = 'editor');

-- sites: members of the account can select/update.
-- Only super admin can insert/delete sites (super admin policy above).
create policy "members read sites" on public.sites
  for select using (public.is_account_member(account_id));

create policy "members update sites" on public.sites
  for update using (public.is_account_member(account_id))
  with check (public.is_account_member(account_id));

-- pages: members of the site's account can select/update;
-- owners and editors (i.e. any member) can insert/delete pages.
create policy "members read pages" on public.pages
  for select using (
    exists (
      select 1 from public.sites s
      where s.id = site_id and public.is_account_member(s.account_id)
    )
  );

create policy "members update pages" on public.pages
  for update using (
    exists (
      select 1 from public.sites s
      where s.id = site_id and public.is_account_member(s.account_id)
    )
  )
  with check (
    exists (
      select 1 from public.sites s
      where s.id = site_id and public.is_account_member(s.account_id)
    )
  );

create policy "members insert pages" on public.pages
  for insert with check (
    exists (
      select 1 from public.sites s
      where s.id = site_id and public.is_account_member(s.account_id)
    )
  );

create policy "members delete pages" on public.pages
  for delete using (
    exists (
      select 1 from public.sites s
      where s.id = site_id and public.is_account_member(s.account_id)
    )
  );

-- form_submissions: account owners can read. NO public insert policy;
-- inserts happen server-side with the service role (bypasses RLS).
create policy "owners read form submissions" on public.form_submissions
  for select using (
    exists (
      select 1 from public.sites s
      where s.id = site_id and public.is_account_owner(s.account_id)
    )
  );

-- page_views: account owners can read. NO public insert policy;
-- the analytics beacon inserts server-side with the service role.
create policy "owners read page views" on public.page_views
  for select using (
    exists (
      select 1 from public.sites s
      where s.id = site_id and public.is_account_owner(s.account_id)
    )
  );
