-- 0003_branding_access.sql
-- The login page is unauthenticated but must show the agency's branding,
-- and the agency logo lives in a public "branding" storage bucket that
-- only the super admin can write to.

-- agency_settings: allow anonymous reads (branding is public anyway).
create policy "anon can read agency settings" on public.agency_settings
  for select to anon using (true);

-- Storage bucket for agency branding assets (logo).
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- Anyone can read branding assets; only the super admin can write them.
create policy "public read branding" on storage.objects
  for select using (bucket_id = 'branding');

create policy "super admin insert branding" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.is_super_admin());

create policy "super admin update branding" on storage.objects
  for update to authenticated
  using (bucket_id = 'branding' and public.is_super_admin())
  with check (bucket_id = 'branding' and public.is_super_admin());

create policy "super admin delete branding" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.is_super_admin());
