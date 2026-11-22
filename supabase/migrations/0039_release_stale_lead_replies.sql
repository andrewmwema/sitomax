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
      and created_at < now() - interval '15 minutes';
  get diagnostics released = row_count;
  return released;
end;
$$;

revoke all on function public.release_stale_lead_replies() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'schedule' and pg_function_is_visible(oid)) then
    perform cron.schedule('release-stale-lead-replies', '*/5 * * * *', 'select public.release_stale_lead_replies()');
  end if;
end;
$$;
