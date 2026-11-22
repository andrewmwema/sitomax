begin;

alter table public.lead_messages
  add column delivery_status text check (delivery_status in ('delivered', 'bounced')),
  add column delivery_status_at timestamptz;

create function public.record_lead_delivery_event(
  p_secret text, p_message_id text, p_request_id uuid, p_recipient text,
  p_status text, p_occurred_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_lead_worker(p_secret);
  if p_message_id is null or length(p_message_id) not between 1 and 128
    or p_recipient is null or p_status is null or p_status not in ('delivered', 'bounced') or p_occurred_at is null then
    raise invalid_parameter_value using message = 'Invalid lead delivery event';
  end if;
  update public.lead_messages m set
    delivery_status = p_status, delivery_status_at = p_occurred_at
  where m.direction = 'out' and m.to_email = lower(btrim(p_recipient))
    and (m.postmark_message_id = p_message_id
      or (m.postmark_message_id is null and m.id = p_request_id))
    and (m.delivery_status is null or
      (m.delivery_status = p_status and m.delivery_status_at < p_occurred_at) or
      (m.delivery_status = 'delivered' and p_status = 'bounced'));
  if found then return 'recorded'; end if;
  if exists (
    select from public.lead_messages m where m.direction = 'out'
      and (m.postmark_message_id = p_message_id or (m.postmark_message_id is null and m.id = p_request_id))
  ) then return 'ignored'; end if;
  return 'not_found';
end;
$$;
revoke all on function public.record_lead_delivery_event(text, text, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_lead_delivery_event(text, text, uuid, text, text, timestamptz) to anon;

create or replace function public.finish_lead_reply(p_secret text, p_request uuid, p_provider_id text, p_bounced boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  perform public.check_lead_worker(p_secret);
  update public.lead_messages set delivery_state = case when p_provider_id is null then 'failed' else 'sent' end,
    postmark_message_id = p_provider_id,
    delivery_status = case when p_bounced then 'bounced' else delivery_status end,
    delivery_status_at = case when p_bounced then now() else delivery_status_at end
    where id = p_request and direction = 'out' and delivery_state = 'sending'
    returning lead_id, site_id, actor_id, to_email into m;
  if not found then return false; end if;
  if p_bounced then
    insert into public.email_suppressions(email, event_type, reason, message_stream, occurred_at)
      select m.to_email, 'bounce', 'Postmark rejected the recipient as inactive.', '', now()
      on conflict (email) do update set event_type = excluded.event_type, reason = excluded.reason,
        message_stream = excluded.message_stream, occurred_at = excluded.occurred_at, recorded_at = now()
        where public.email_suppressions.occurred_at <= excluded.occurred_at;
    update public.form_submissions set lead_email_bounced_at = now()
      where public.lead_contact_email(data) = m.to_email;
  end if;
  if p_provider_id is not null then
    update public.form_submissions set status = case when status = 'new' then 'contacted' else status end,
      last_activity_at = greatest(last_activity_at, now()) where id = m.lead_id;
    insert into public.lead_events(lead_id, site_id, type, data, actor_id)
      values (m.lead_id, m.site_id, 'email_sent', jsonb_build_object('message_id', p_request), m.actor_id);
  end if;
  return true;
end;
$$;

create function public.lead_reply_senders(p_lead uuid) returns table (actor_id uuid, name text)
language sql stable security definer set search_path = '' as $$
  select distinct p.id, coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.email), ''), 'Team member')
  from public.lead_messages m join public.profiles p on p.id = m.actor_id
  where m.lead_id = p_lead and m.direction = 'out' and public.can_manage_site_leads(m.site_id);
$$;
revoke all on function public.lead_reply_senders(uuid) from public, anon, authenticated;
grant execute on function public.lead_reply_senders(uuid) to authenticated;

commit;
