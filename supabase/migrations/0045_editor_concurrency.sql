begin;

alter table public.pages add column draft_version uuid not null default gen_random_uuid();

-- Save actions supply a baseline and a replacement token. Raising here also
-- rolls back header, theme and history writes in the surrounding RPC.
create function public.guard_editor_page_version()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare expected text; replacement text;
begin
  expected := new.draft_data#>>'{root,props,__expectedPageVersion}';
  replacement := new.draft_data#>>'{root,props,__nextPageVersion}';
  if expected is not null then
    if expected::uuid is distinct from old.draft_version then
      raise exception 'This page changed in another editor. Reload before saving.' using errcode = '40001';
    end if;
    if replacement is null then
      raise exception 'A replacement page version is required.' using errcode = '22023';
    end if;
    new.draft_version := replacement::uuid;
  elsif new.draft_data is distinct from old.draft_data then
    new.draft_version := gen_random_uuid();
  else
    new.draft_version := old.draft_version;
  end if;
  new.draft_data := new.draft_data #- '{root,props,__expectedPageVersion}' #- '{root,props,__nextPageVersion}';
  new.published_data := new.published_data #- '{root,props,__expectedPageVersion}' #- '{root,props,__nextPageVersion}';
  return new;
end;
$$;
revoke all on function public.guard_editor_page_version() from public, anon, authenticated;
create trigger guard_editor_page_version before update on public.pages
for each row execute function public.guard_editor_page_version();

create function public.strip_page_version_tokens()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.data := new.data #- '{root,props,__expectedPageVersion}' #- '{root,props,__nextPageVersion}';
  return new;
end;
$$;
revoke all on function public.strip_page_version_tokens() from public, anon, authenticated;
create trigger strip_page_version_tokens before insert or update of data on public.page_versions
for each row execute function public.strip_page_version_tokens();

create table public.page_editor_sessions (
  id uuid primary key,
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen timestamptz not null default clock_timestamp()
);
create index page_editor_sessions_page_seen on public.page_editor_sessions(page_id, last_seen);
alter table public.page_editor_sessions enable row level security;
create policy "members see page editor sessions" on public.page_editor_sessions
for select to authenticated using (
  exists (select 1 from public.pages p where p.id = page_id)
);
revoke all on public.page_editor_sessions from public, anon, authenticated;
grant select on public.page_editor_sessions to authenticated;

create function public.heartbeat_page_editor(p_page_id uuid, p_session_id uuid, p_close boolean default false)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare others integer;
begin
  if auth.uid() is null or p_session_id is null or not exists (
    select 1 from public.pages p join public.sites s on s.id = p.site_id
    where p.id = p_page_id and (public.is_super_admin() or public.is_account_member(s.account_id))
  ) then
    raise exception 'Page unavailable.' using errcode = '42501';
  end if;
  delete from public.page_editor_sessions
    where page_id = p_page_id and last_seen < clock_timestamp() - interval '45 seconds';
  if p_close then
    delete from public.page_editor_sessions
      where id = p_session_id and page_id = p_page_id and user_id = auth.uid();
  else
    insert into public.page_editor_sessions(id, page_id, user_id)
      values (p_session_id, p_page_id, auth.uid())
      on conflict (id) do update set last_seen = clock_timestamp()
      where page_editor_sessions.page_id = p_page_id and page_editor_sessions.user_id = auth.uid();
    if not found then raise exception 'Editor session unavailable.' using errcode = '42501'; end if;
  end if;
  select count(*) into others from public.page_editor_sessions
    where page_id = p_page_id and id <> p_session_id
      and last_seen >= clock_timestamp() - interval '45 seconds';
  return others;
end;
$$;
revoke all on function public.heartbeat_page_editor(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.heartbeat_page_editor(uuid, uuid, boolean) to authenticated;

commit;
