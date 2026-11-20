begin;

create function public.import_blog_post(p_site_id uuid, p_post jsonb, p_author text, p_category jsonb, p_tags jsonb, p_overwrite boolean)
returns text language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  imported_post_id uuid;
  imported_author_id uuid;
  imported_category_id uuid;
  tag_id uuid;
  tag jsonb;
  entry public.posts;
begin
  if not exists (select 1 from public.sites s where s.id = p_site_id and
    (public.is_super_admin() or public.is_account_member(s.account_id))) then
    raise exception 'Site unavailable';
  end if;
  entry := jsonb_populate_record(null::public.posts, p_post);
  perform pg_advisory_xact_lock(hashtextextended(p_site_id::text, 0));
  select p.id into imported_post_id from public.posts p where p.site_id = p_site_id and p.slug = entry.slug for update;
  if imported_post_id is not null and not coalesce(p_overwrite, false) then return 'skipped'; end if;

  if p_author <> '' then
    select a.id into imported_author_id from public.blog_authors a where a.site_id = p_site_id and a.name = p_author order by a.id limit 1;
    if imported_author_id is null then
      insert into public.blog_authors(site_id, name) values (p_site_id, p_author) returning id into imported_author_id;
    end if;
  end if;
  if p_category is not null then
    insert into public.post_categories(site_id, name, slug) values (p_site_id, p_category->>'name', p_category->>'slug')
      on conflict (site_id, slug) do nothing;
    select c.id into imported_category_id from public.post_categories c where c.site_id = p_site_id and c.slug = p_category->>'slug';
  end if;

  if imported_post_id is null then
    insert into public.posts(site_id, slug, title, excerpt, draft_content, published_content, cover_image, cover_alt,
      author_id, category_id, status, published_at, reading_minutes, created_at)
    values (p_site_id, entry.slug, entry.title, entry.excerpt, entry.draft_content, entry.published_content, entry.cover_image,
      entry.cover_alt, imported_author_id, imported_category_id, entry.status, entry.published_at, entry.reading_minutes, coalesce(entry.created_at, now()))
    returning id into imported_post_id;
  else
    update public.posts p set title = entry.title, subtitle = '', excerpt = entry.excerpt,
      draft_content = entry.draft_content, published_content = entry.published_content, cover_image = entry.cover_image,
      cover_alt = entry.cover_alt, author_id = imported_author_id, category_id = imported_category_id,
      status = entry.status, published_at = entry.published_at, publish_at = null, reading_minutes = entry.reading_minutes,
      has_unpublished_changes = false
      where p.id = imported_post_id and p.site_id = p_site_id;
    delete from public.post_tag_links l where l.site_id = p_site_id and l.post_id = imported_post_id;
  end if;

  for tag in select value from jsonb_array_elements(p_tags) loop
    insert into public.post_tags(site_id, name, slug) values (p_site_id, tag->>'name', tag->>'slug')
      on conflict (site_id, slug) do nothing;
    select t.id into tag_id from public.post_tags t where t.site_id = p_site_id and t.slug = tag->>'slug';
    insert into public.post_tag_links(site_id, post_id, tag_id) values (p_site_id, imported_post_id, tag_id)
      on conflict do nothing;
  end loop;
  return 'imported';
end;
$$;
revoke all on function public.import_blog_post(uuid, jsonb, text, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.import_blog_post(uuid, jsonb, text, jsonb, jsonb, boolean) to authenticated;

commit;
