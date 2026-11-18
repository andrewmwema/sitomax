alter table public.pages add column nav_label text;

create function public.default_page_nav_label(p_slug text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select coalesce(nullif(btrim(left(initcap(array_to_string(
    (regexp_split_to_array(btrim(regexp_replace(p_slug, '[-_/[:space:]]+', ' ', 'g')), ' '))[1:2], ' '
  )), 40)), ''), 'Home')
$$;

update public.pages set nav_label = public.default_page_nav_label(slug);

alter table public.pages alter column nav_label set not null;
alter table public.pages add constraint pages_nav_label_valid check (
  char_length(nav_label) between 1 and 40
  and nav_label = btrim(nav_label)
  and nav_label ~ '^[^[:space:]]+( [^[:space:]]+){0,2}$'
);

create function public.fill_page_nav_label()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.nav_label := coalesce(new.nav_label, public.default_page_nav_label(new.slug));
  return new;
end;
$$;

create trigger fill_page_nav_label before insert on public.pages
for each row execute function public.fill_page_nav_label();
