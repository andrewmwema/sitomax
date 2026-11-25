begin;

create function public.save_ai_empty_page(
  p_page_id uuid, p_expected_draft jsonb, p_data jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_site uuid;
  previous_draft jsonb;
  previous_version_time timestamptz;
  history_draft jsonb;
begin
  if auth.uid() is null or jsonb_typeof(p_expected_draft) is distinct from 'object'
    or jsonb_typeof(p_data) is distinct from 'object'
    or jsonb_typeof(p_data->'content') is distinct from 'array'
    or jsonb_typeof(p_data->'root') is distinct from 'object' then
    raise exception 'Invalid AI page draft.' using errcode = '22023';
  end if;
  if (p_expected_draft ? 'content' and p_expected_draft->'content' is distinct from '[]'::jsonb)
    or (p_expected_draft ? 'zones' and (
      jsonb_typeof(p_expected_draft->'zones') is distinct from 'object'
      or exists (select 1 from jsonb_each(
        case when jsonb_typeof(p_expected_draft->'zones') = 'object'
          then p_expected_draft->'zones' else '{}'::jsonb end
      ) zone where zone.value is distinct from '[]'::jsonb)
    )) then
    raise exception 'Only empty pages can be built with AI.' using errcode = '22023';
  end if;
  select p.site_id into target_site from public.pages p join public.sites s on s.id = p.site_id
    where p.id = p_page_id and (public.is_super_admin() or public.is_account_member(s.account_id));
  if target_site is null then raise exception 'Page unavailable.' using errcode = '42501'; end if;
  perform 1 from public.sites where id = target_site for update;
  select draft_data into previous_draft from public.pages
    where id = p_page_id and site_id = target_site for update;
  if not found then raise exception 'Page unavailable.' using errcode = '42501'; end if;
  if previous_draft is distinct from p_expected_draft then
    raise exception 'The page changed in another editor.' using errcode = '40001';
  end if;

  history_draft := previous_draft || jsonb_build_object(
    'content', coalesce(previous_draft->'content', '[]'::jsonb),
    'root', case when jsonb_typeof(previous_draft->'root') = 'object'
      then previous_draft->'root' else '{}'::jsonb end
  );
  select greatest(clock_timestamp(), coalesce(max(published_at) + interval '1 microsecond',
    '-infinity'::timestamptz)) into previous_version_time from public.page_versions where page_id = p_page_id;
  insert into public.page_versions(page_id, data, kind, published_at)
    values (p_page_id, history_draft, 'ai_edit', previous_version_time);
  update public.pages set draft_data = p_data where id = p_page_id;
  insert into public.page_versions(page_id, data, kind, published_at)
    values (p_page_id, p_data, 'ai_edit', previous_version_time + interval '1 microsecond');
  delete from public.page_versions where page_id = p_page_id and id not in (
    select id from public.page_versions where page_id = p_page_id order by published_at desc, id desc limit 20
  );
end;
$$;

revoke all on function public.save_ai_empty_page(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_ai_empty_page(uuid, jsonb, jsonb) to authenticated;

commit;
