-- Search both filenames and upload metadata without exposing other site folders.
create function public.list_site_media(
  p_site_id uuid, p_query text default '', p_offset int default 0, p_agency boolean default false
) returns table(bucket text, path text, name text, alt text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not (
    public.is_super_admin() or (not p_agency and exists (
      select 1 from public.sites s where s.id = p_site_id and public.is_account_member(s.account_id)
    ))
  ) then raise exception 'Site media access required.' using errcode = '42501'; end if;
  if p_offset is null or p_offset < 0 or p_offset > 100000 or p_query is null or length(p_query) > 100 then
    raise exception 'Invalid media search.' using errcode = '22023';
  end if;
  return query select o.bucket_id, o.name, regexp_replace(o.name, '^.*/', ''), coalesce(o.user_metadata->>'alt', '')
    from storage.objects o
    where ((o.bucket_id = 'site-assets' and split_part(o.name, '/', 1) = p_site_id::text)
      or (p_agency and public.is_super_admin() and o.bucket_id = 'branding'))
      and (o.metadata->>'mimetype' like 'image/%' or o.name ~* '\.(jpe?g|png|gif|webp|avif|svg)$')
      and (strpos(lower(o.name), lower(p_query)) > 0 or strpos(lower(coalesce(o.user_metadata->>'alt', '')), lower(p_query)) > 0)
    order by o.created_at desc, o.id desc limit 24 offset p_offset;
end;
$$;
revoke all on function public.list_site_media(uuid, text, int, boolean) from public, anon;
grant execute on function public.list_site_media(uuid, text, int, boolean) to authenticated;
