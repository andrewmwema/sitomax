create function public.valid_site_business(value jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare key text; service jsonb;
begin
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  if value = '{}'::jsonb then return true; end if;
  if (select count(*) from jsonb_object_keys(value)) <> 10 then return false; end if;
  foreach key in array array['businessName', 'businessType', 'city', 'difference', 'tone', 'phone', 'email', 'address', 'openingHours'] loop
    if jsonb_typeof(value->key) is distinct from 'string' then return false; end if;
  end loop;
  if length(value->>'businessName') > 100 or length(value->>'businessType') > 100
    or length(value->>'city') > 100 or length(value->>'difference') > 1000
    or length(value->>'tone') > 200 or length(value->>'phone') > 40
    or length(value->>'email') > 254 or length(value->>'address') > 250
    or length(value->>'openingHours') > 1000
    or value->>'phone' !~ '^[+0-9(). -]*$'
    or (value->>'email' <> '' and value->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    or jsonb_typeof(value->'services') is distinct from 'array' then return false; end if;
  if jsonb_array_length(value->'services') > 20 then return false; end if;
  for service in select * from jsonb_array_elements(value->'services') loop
    if jsonb_typeof(service) is distinct from 'string' or length(btrim(service #>> '{}')) not between 1 and 80 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
alter table public.sites add column business jsonb not null default '{}'::jsonb
  check (public.valid_site_business(business));
grant update (business) on public.sites to authenticated;
revoke update (draft_theme) on public.sites from authenticated;

-- Draft themes remain editable without exposing an additional update column.
create function public.save_site_draft_theme(p_site_id uuid, p_theme jsonb)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(p_theme) is distinct from 'object' then
    raise exception 'Invalid theme.';
  end if;
  update public.sites set draft_theme = p_theme
    where id = p_site_id and draft_theme is not null
      and (public.is_super_admin() or public.is_account_member(account_id));
  return found;
end;
$$;
revoke all on function public.save_site_draft_theme(uuid, jsonb) from public, anon;
grant execute on function public.save_site_draft_theme(uuid, jsonb) to authenticated;

-- Generation and business information must commit in the same transaction.
create function public.replace_ai_site_drafts_with_business(
  p_site_id uuid, p_theme jsonb, p_pages jsonb, p_business jsonb
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare home_id uuid;
begin
  if jsonb_typeof(p_business) is distinct from 'object' then
    raise exception 'Invalid business information.';
  end if;
  home_id := public.replace_ai_site_drafts(p_site_id, p_theme, p_pages);
  update public.sites set business = p_business where id = p_site_id;
  return home_id;
end;
$$;
revoke all on function public.replace_ai_site_drafts_with_business(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.replace_ai_site_drafts_with_business(uuid, jsonb, jsonb, jsonb) to authenticated;

create function public.create_ai_site_with_business(
  p_account_id uuid, p_name text, p_subdomain text, p_theme jsonb, p_pages jsonb, p_business jsonb
) returns table(site_id uuid, page_id uuid)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare created record;
begin
  if jsonb_typeof(p_business) is distinct from 'object' then
    raise exception 'Invalid business information.';
  end if;
  select * into strict created from public.create_ai_site(p_account_id, p_name, p_subdomain, p_theme, p_pages);
  update public.sites set business = p_business where id = created.site_id;
  return query select created.site_id, created.page_id;
end;
$$;
revoke all on function public.create_ai_site_with_business(uuid, text, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_ai_site_with_business(uuid, text, text, jsonb, jsonb, jsonb) to service_role;
