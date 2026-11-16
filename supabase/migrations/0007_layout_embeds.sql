-- 0007_layout_embeds.sql
-- The custom layout system's Embed element runs third-party HTML/JS (in
-- a sandboxed iframe). Only the agency (super admin) may add or change
-- embed code; clients may keep, move, resize or delete embeds the agency
-- placed. The editor UI and the updatePage Server Action apply the same
-- rule (lib/layout/embed.ts); this trigger enforces it for every write,
-- including direct API calls with a client's session.
--
-- No new tables, so no new RLS policies: pages keeps its existing ones.

-- Every Embed item's code anywhere in a page's Puck JSON (slots nest
-- arbitrarily deep). '' for an empty embed; NULL when the code isn't a
-- string (a crafted payload), which is always rejected below.
create or replace function public.page_embed_codes(data jsonb)
returns table (code text)
language sql
immutable
set search_path = public
as $$
  with recursive nodes(node) as (
    select data
    union all
    select child
    from nodes
    cross join lateral jsonb_array_elements(
      case jsonb_typeof(nodes.node)
        when 'array' then nodes.node
        when 'object' then coalesce(
          (select jsonb_agg(entry.value) from jsonb_each(nodes.node) as entry),
          '[]'::jsonb
        )
        else '[]'::jsonb
      end
    ) as children(child)
  )
  select
    case
      when jsonb_typeof(node -> 'props') is distinct from 'object' then ''
      when coalesce(jsonb_typeof(node -> 'props' -> 'code'), 'null') = 'null' then ''
      when jsonb_typeof(node -> 'props' -> 'code') = 'string' then node -> 'props' ->> 'code'
      else null
    end
  from nodes
  where jsonb_typeof(node) = 'object'
    and node ->> 'type' = 'Embed';
$$;

create or replace function public.guard_page_embeds()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Service role / SQL (no end user) and the agency are unrestricted.
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if exists (
    select 1
    from (
      select code from public.page_embed_codes(new.draft_data)
      union all
      select code from public.page_embed_codes(new.published_data)
    ) as incoming
    where incoming.code is null
      or (
        incoming.code <> ''
        and (
          tg_op = 'INSERT'
          or incoming.code not in (
            select code from public.page_embed_codes(old.draft_data) where code is not null
            union
            select code from public.page_embed_codes(old.published_data) where code is not null
          )
        )
      )
  ) then
    raise exception 'Only the agency can add or change embed code.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_page_embeds
  before insert or update of draft_data, published_data on public.pages
  for each row execute function public.guard_page_embeds();
