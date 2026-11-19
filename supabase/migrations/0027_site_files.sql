-- 0027_site_files.sql
-- Downloadable files (PDF, Office documents, plain text/CSV) for the link
-- picker's "File" option. They live in the same site-assets/{site_id}/
-- folder and use the existing storage policies. No HTML, SVG or scripts.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'video/mp4', 'video/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv'
]
where id = 'site-assets';

create or replace function public.list_site_files(
  p_site_id uuid, p_query text default '', p_offset int default 0
) returns table(path text, name text, mimetype text, size bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not (
    public.is_super_admin() or exists (
      select 1 from public.sites s where s.id = p_site_id and public.is_account_member(s.account_id)
    )
  ) then raise exception 'Site file access required.' using errcode = '42501'; end if;
  if p_offset is null or p_offset < 0 or p_offset > 100000 or p_query is null or length(p_query) > 100 then
    raise exception 'Invalid file search.' using errcode = '22023';
  end if;
  return query select o.name, regexp_replace(o.name, '^.*/', ''), coalesce(o.metadata->>'mimetype', ''),
      coalesce((o.metadata->>'size')::bigint, 0)
    from storage.objects o
    where o.bucket_id = 'site-assets' and split_part(o.name, '/', 1) = p_site_id::text
      and o.name ~* '\.(pdf|docx?|xlsx?|pptx?|txt|csv)$'
      and strpos(lower(o.name), lower(p_query)) > 0
    order by o.created_at desc, o.id desc limit 24 offset p_offset;
end;
$$;
revoke all on function public.list_site_files(uuid, text, int) from public, anon;
grant execute on function public.list_site_files(uuid, text, int) to authenticated;
