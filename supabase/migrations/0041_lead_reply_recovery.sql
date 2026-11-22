create or replace function public.release_stale_lead_replies()
returns integer
language plpgsql security definer set search_path = ''
as $$
declare released integer;
begin
  update public.lead_messages
    set delivery_state = 'failed'
    where direction = 'out'
      and delivery_state = 'sending'
      and created_at < now() - interval '5 minutes';
  get diagnostics released = row_count;
  return released;
end;
$$;

create or replace function public.discard_lead_reply(p_secret text, p_request uuid, p_lead uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare discarded uuid;
begin
  perform public.check_lead_worker(p_secret);
  delete from public.lead_messages
    where id = p_request
      and lead_id = p_lead
      and direction = 'out'
      and (
        delivery_state = 'failed'
        or (delivery_state = 'sending' and created_at < now() - interval '5 minutes')
      )
    returning id into discarded;
  return discarded is not null;
end;
$$;

revoke all on function public.release_stale_lead_replies() from public, anon, authenticated;
revoke all on function public.discard_lead_reply(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.discard_lead_reply(text, uuid, uuid) to anon;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'schedule' and pg_function_is_visible(oid)) then
    perform cron.schedule('release-stale-lead-replies-v2', '*/5 * * * *', 'select public.release_stale_lead_replies()');
  end if;
end;
$$;
