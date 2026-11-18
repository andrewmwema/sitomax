drop function public.reserve_ai_generation_call(uuid, uuid, uuid, text, text, uuid);

create function public.reserve_ai_generation_call(
  p_generation_id uuid, p_user_id uuid, p_account_id uuid, p_action text, p_model text,
  p_site_id uuid default null, p_custom boolean default false
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  parent public.ai_requests%rowtype;
  call_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_user_id::text, 0));
  select * into strict parent from public.ai_requests where id = p_generation_id for update;
  if parent.user_id <> p_user_id or parent.account_id <> p_account_id
    or parent.site_id is distinct from p_site_id or not parent.is_generation or parent.status <> 'pending'
    or p_action <> 'generate_site' or p_model is distinct from parent.model then
    raise exception 'Invalid site-generation reservation.' using errcode = '42501';
  end if;
  if p_site_id is not null and not exists (
    select 1 from public.sites where id = p_site_id and account_id = p_account_id
  ) then raise exception 'The site does not belong to this account.' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and is_super_admin)
    and not exists (select 1 from public.account_members
      where user_id = p_user_id and account_id = p_account_id and role = 'owner') then
    raise exception 'Account owner access required.' using errcode = '42501';
  end if;
  if p_custom and exists (select 1 from public.ai_requests where user_id = p_user_id
    and is_generation and status = 'pending' and id <> parent.id and created_at < parent.created_at
    and created_at > clock_timestamp() - interval '5 minutes') then
    raise exception 'Another site generation is in progress.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.ai_requests where user_id = p_user_id and not is_generation
    and created_at > clock_timestamp() - interval '1 minute'
    and (not p_custom or generation_id is distinct from parent.id)) >= 10 then
    raise exception 'AI rate limit reached. Try again in a minute.' using errcode = 'P0001';
  end if;
  -- Custom: one plan + four pages with up to ten sections, one repair each.
  if (select count(*) from public.ai_requests where generation_id = parent.id) >= (case when p_custom then 82 else 10 end) then
    raise exception 'This generation has reached its maximum number of AI calls.' using errcode = 'P0001';
  end if;
  insert into public.ai_requests(account_id, user_id, site_id, action, model, generation_id, is_unlimited)
    values (parent.account_id, parent.user_id, parent.site_id, 'generate_site', p_model, parent.id, parent.is_unlimited)
    returning id into call_id;
  return call_id;
end;
$$;
revoke all on function public.reserve_ai_generation_call(uuid, uuid, uuid, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.reserve_ai_generation_call(uuid, uuid, uuid, text, text, uuid, boolean) to service_role;
