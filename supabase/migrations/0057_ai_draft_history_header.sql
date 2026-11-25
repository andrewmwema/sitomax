begin;

alter table public.site_draft_versions
  add column header_captured boolean not null default false;

create function public.capture_ai_draft_version_state()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select s.draft_header into new.header from public.sites s where s.id = new.site_id;
  new.header_captured := true;
  select coalesce(jsonb_agg(
    case when p.id is null then entry.value
      else entry.value || jsonb_build_object('ai_pending_build', p.ai_pending_build) end
    order by entry.ordinality), '[]'::jsonb)
    into new.pages
    from jsonb_array_elements(new.pages) with ordinality as entry(value, ordinality)
    left join public.pages p on p.site_id = new.site_id and p.id::text = entry.value->>'id';
  return new;
end;
$$;
revoke all on function public.capture_ai_draft_version_state() from public, anon, authenticated;
create trigger capture_ai_draft_version_state before insert on public.site_draft_versions
for each row execute function public.capture_ai_draft_version_state();

-- A separate entry point leaves deployed main's restore function untouched.
create function public.restore_ai_draft_version(p_site_id uuid, p_version_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare backup public.site_draft_versions%rowtype;
begin
  select v.* into strict backup from public.site_draft_versions v
    join public.sites s on s.id = v.site_id
    where v.id = p_version_id and s.id = p_site_id
      and (public.is_super_admin() or public.is_account_owner(s.account_id));
  perform 1 from public.sites where id = backup.site_id for update;
  perform 1 from public.pages where site_id = backup.site_id order by id for update;
  if exists (select 1 from jsonb_array_elements(backup.pages) p
    where not exists (select 1 from public.pages where id = (p->>'id')::uuid and site_id = backup.site_id)) then
    raise exception 'A backed-up page was deleted. Ask your agency to recover this version.';
  end if;
  insert into public.site_draft_versions(site_id, pages, theme)
    select backup.site_id, coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'draft_data', p.draft_data)), '[]'),
      (select coalesce(draft_theme, theme) from public.sites where id = backup.site_id)
    from public.pages p where site_id = backup.site_id;
  update public.pages p set draft_data = b.value->'draft_data',
      ai_pending_build = case when jsonb_typeof(b.value->'ai_pending_build') = 'boolean'
        then (b.value->>'ai_pending_build')::boolean else p.ai_pending_build end
    from jsonb_array_elements(backup.pages) b(value)
    where p.site_id = backup.site_id and p.id = (b.value->>'id')::uuid;
  update public.pages set draft_data = '{"content":[],"root":{}}', ai_pending_build = false
    where site_id = backup.site_id and id = any(backup.generated_page_ids)
      and not exists (select 1 from jsonb_array_elements(backup.pages) p where (p->>'id')::uuid = pages.id);
  update public.sites set draft_theme = backup.theme,
    draft_header = case when backup.header_captured or backup.header is not null
      then backup.header else draft_header end
    where id = backup.site_id;
end;
$$;
revoke all on function public.restore_ai_draft_version(uuid, uuid) from public, anon;
grant execute on function public.restore_ai_draft_version(uuid, uuid) to authenticated;

commit;
