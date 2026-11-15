-- 0004_site_assets.sql
-- Storage bucket for client site images (editor uploads).
-- Files live in one folder per site: site-assets/{site_id}/{file}.

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

-- Anyone can read site assets (they are shown on public sites).
create policy "public read site assets" on storage.objects
  for select using (bucket_id = 'site-assets');

-- Members of the site's account (and the super admin) can write files
-- inside their own site's folder.
create or replace function public.can_write_site_assets(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or exists (
    select 1
    from public.sites s
    where s.id::text = (storage.foldername(object_name))[1]
      and public.is_account_member(s.account_id)
  );
$$;

create policy "members insert site assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-assets' and public.can_write_site_assets(name));

create policy "members update site assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-assets' and public.can_write_site_assets(name))
  with check (bucket_id = 'site-assets' and public.can_write_site_assets(name));

create policy "members delete site assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-assets' and public.can_write_site_assets(name));
