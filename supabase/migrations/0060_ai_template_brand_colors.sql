begin;

create function public.create_ai_template_site_with_colors(
  p_account_id uuid, p_generation_id uuid, p_template_id text,
  p_site_name text, p_subdomain text, p_timezone text, p_business jsonb,
  p_primary text, p_secondary text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  result jsonb;
  copied_site uuid;
  base_theme jsonb;
  colors jsonb;
begin
  if (p_primary is not null and p_primary !~ '^#[0-9a-fA-F]{6}$')
    or (p_secondary is not null and p_secondary !~ '^#[0-9a-fA-F]{6}$')
    or (p_primary is null and p_secondary is null) then
    raise exception 'Invalid brand colors.' using errcode = '22023';
  end if;
  result := public.create_ai_template_site(
    p_account_id, p_generation_id, p_template_id, p_site_name, p_subdomain, p_timezone, p_business
  );
  copied_site := (result->>'siteId')::uuid;
  select coalesce(draft_theme, theme) into strict base_theme from public.sites where id = copied_site;
  if jsonb_typeof(base_theme) is distinct from 'object'
    or (base_theme ? 'colors' and jsonb_typeof(base_theme->'colors') is distinct from 'object') then
    raise exception 'The selected design has an invalid theme.' using errcode = '22023';
  end if;
  colors := coalesce(base_theme->'colors', '{}'::jsonb);
  if p_primary is not null then colors := colors || jsonb_build_object('primary', p_primary); end if;
  if p_secondary is not null then colors := colors || jsonb_build_object('secondary', p_secondary); end if;
  update public.sites set draft_theme = jsonb_set(base_theme, '{colors}', colors, true) where id = copied_site;
  return result;
end;
$$;

revoke all on function public.create_ai_template_site_with_colors(uuid, uuid, text, text, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.create_ai_template_site_with_colors(uuid, uuid, text, text, text, text, jsonb, text, text)
  to authenticated;

commit;
