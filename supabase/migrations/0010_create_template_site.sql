-- Atomic creation: only a server-side super-admin action may call this function.
create function public.create_template_site(
  p_account_id uuid, p_name text, p_subdomain text, p_template_key text,
  p_theme jsonb, p_pages jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  site_id uuid;
begin
  if jsonb_typeof(p_pages) is distinct from 'array' or jsonb_array_length(p_pages) <> 4 then
    raise exception 'A template must contain four pages';
  end if;
  insert into public.sites(account_id, name, subdomain, template_key, theme)
    values (p_account_id, p_name, p_subdomain, p_template_key, p_theme)
    returning id into site_id;
  insert into public.pages(site_id, title, slug, sort_order, draft_data, published_data, published_at, seo)
    select site_id, p.value->>'title', p.value->>'slug', (p.ordinality - 1)::integer,
      p.value->'data', p.value->'data', now(),
      jsonb_build_object('description', coalesce(p.value->'data'->'root'->'props'->>'description', ''))
    from jsonb_array_elements(p_pages) with ordinality as p(value, ordinality);
  return site_id;
end;
$$;
revoke all on function public.create_template_site(uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_template_site(uuid, text, text, text, jsonb, jsonb) to service_role;
