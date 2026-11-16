create table public.page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  data jsonb not null,
  published_at timestamptz not null default now()
);

create index page_versions_page_date on public.page_versions(page_id, published_at desc, id desc);
alter table public.page_versions enable row level security;

create policy "members read page versions" on public.page_versions
  for select to authenticated
  using (exists (select 1 from public.pages where pages.id = page_id));

-- Only the publishing trigger writes history. Clients cannot forge versions.
create function public.capture_page_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.published_data is not null then
    -- Row updates serialize publishing; keep order even when the clock ties.
    insert into public.page_versions(page_id, data, published_at)
      select new.id, new.published_data,
        greatest(clock_timestamp(), coalesce(max(published_at) + interval '1 microsecond', '-infinity'::timestamptz))
      from public.page_versions where page_id = new.id;
    delete from public.page_versions
      where page_id = new.id and id not in (
        select id from public.page_versions where page_id = new.id
        order by published_at desc, id desc limit 20
      );
  end if;
  return new;
end;
$$;

revoke all on function public.capture_page_version() from public;
create trigger capture_page_version
  after insert or update of published_data, published_at on public.pages
  for each row execute function public.capture_page_version();

insert into public.page_versions(page_id, data, published_at)
  select id, published_data, coalesce(published_at, now())
  from public.pages where published_data is not null;
