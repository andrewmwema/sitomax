create or replace function public.valid_site_business(value jsonb)
returns boolean language plpgsql immutable set search_path = public, pg_temp as $$
declare key text; service jsonb; audience jsonb; social jsonb;
begin
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  if value = '{}'::jsonb then return true; end if;
  if exists (
    select 1 from jsonb_object_keys(value) as object_key(name)
    where object_key.name not in ('businessName', 'businessType', 'city', 'difference', 'tone', 'phone', 'email',
      'address', 'openingHours', 'services', 'primaryAction', 'audiences', 'description', 'socialLinks')
  ) then return false; end if;
  foreach key in array array['businessName', 'businessType', 'city', 'difference', 'tone', 'phone',
    'email', 'address', 'openingHours'] loop
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
  if value ? 'primaryAction' and (
    jsonb_typeof(value->'primaryAction') is distinct from 'string'
    or value->>'primaryAction' not in ('call', 'book', 'buy', 'inquire')
  ) then return false; end if;
  if value ? 'audiences' then
    if jsonb_typeof(value->'audiences') is distinct from 'array' or jsonb_array_length(value->'audiences') > 10 then
      return false;
    end if;
    for audience in select * from jsonb_array_elements(value->'audiences') loop
      if jsonb_typeof(audience) is distinct from 'string'
        or length(btrim(audience #>> '{}')) not between 1 and 80 then return false; end if;
    end loop;
  end if;
  if value ? 'description' and (
    jsonb_typeof(value->'description') is distinct from 'string' or length(value->>'description') > 4000
  ) then return false; end if;
  if value ? 'socialLinks' then
    if jsonb_typeof(value->'socialLinks') is distinct from 'array' or jsonb_array_length(value->'socialLinks') > 8 then
      return false;
    end if;
    for social in select * from jsonb_array_elements(value->'socialLinks') loop
      if jsonb_typeof(social) is distinct from 'object'
        or (select count(*) from jsonb_object_keys(social)) <> 2
        or exists (select 1 from jsonb_object_keys(social) as social_key(name) where social_key.name not in ('label', 'url'))
        or jsonb_typeof(social->'label') is distinct from 'string'
        or length(btrim(social->>'label')) not between 1 and 40
        or jsonb_typeof(social->'url') is distinct from 'string'
        or length(social->>'url') > 2000
        or social->>'url' !~* '^https?://' then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;
