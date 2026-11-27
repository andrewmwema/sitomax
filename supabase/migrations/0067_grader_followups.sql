begin;

create table public.grader_unsubscribes (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.grader_unsubscribes enable row level security;
revoke all on public.grader_unsubscribes from public, anon, authenticated;

create table public.grader_followups (
  unlock_id uuid not null references public.grader_unlocks(id) on delete cascade,
  lead_id uuid not null references public.form_submissions(id) on delete cascade,
  day integer not null check (day in (2, 5, 10)),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'suppressed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null,
  lease_id uuid,
  lease_until timestamptz,
  sent_at timestamptz,
  primary key (unlock_id, day)
);
create index grader_followups_due_idx on public.grader_followups(next_attempt_at)
  where status in ('pending', 'sending');
alter table public.grader_followups enable row level security;
revoke all on public.grader_followups from public, anon, authenticated;
grant select on public.grader_followups to authenticated;
create policy grader_followups_admin_read on public.grader_followups for select to authenticated
  using (public.is_super_admin());

create function public.queue_grader_followups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.grader_followups(unlock_id, lead_id, day, next_attempt_at)
    select u.id, new.lead_id, d.day, u.created_at + make_interval(days => d.day)
    from public.grader_unlocks u cross join (values (2), (5), (10)) d(day)
    where u.id = new.unlock_id and u.consent_marketing;
  return new;
end;
$$;
revoke all on function public.queue_grader_followups() from public, anon, authenticated;
create trigger queue_grader_followups after insert on public.grader_notifications
  for each row execute function public.queue_grader_followups();
insert into public.grader_followups(unlock_id, lead_id, day, next_attempt_at)
  select u.id, n.lead_id, d.day, u.created_at + make_interval(days => d.day)
  from public.grader_unlocks u join public.grader_notifications n on n.unlock_id = u.id
    cross join (values (2), (5), (10)) d(day)
  where u.consent_marketing on conflict do nothing;

create function public.grader_followup_eligible(p_unlock uuid, p_lead uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.grader_unlocks u
    join public.form_submissions f on f.id = p_lead
    join public.grader_notifications n on n.unlock_id = u.id and n.lead_id = f.id
    where u.id = p_unlock and u.consent_marketing and f.status = 'new' and f.deleted_at is null
      and not exists (select 1 from public.grader_unsubscribes x where x.email = lower(btrim(u.email)))
      and not exists (select 1 from auth.users a where lower(btrim(a.email)) = lower(btrim(u.email)))
      and not exists (select 1 from public.lead_events e
        where e.lead_id = f.id and e.type = 'status_changed'
          and e.data->>'from' = 'new' and e.created_at >= u.created_at)
  )
$$;
revoke all on function public.grader_followup_eligible(uuid,uuid) from public, anon, authenticated;

create function public.grader_claim_followups(p_secret text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare jobs jsonb;
begin
  perform public.check_grader_worker(p_secret);
  update public.grader_followups set status = 'suppressed', lease_id = null, lease_until = null
    where (status = 'sending' or (status = 'pending' and next_attempt_at <= now()))
      and not public.grader_followup_eligible(unlock_id, lead_id);
  update public.grader_followups set status = 'failed', lease_id = null, lease_until = null
    where status = 'sending' and lease_until < now() and attempts >= 5;
  with candidates as (
    select f.unlock_id, f.day from public.grader_followups f
    where ((f.status = 'pending' and f.next_attempt_at <= now()) or (f.status = 'sending' and f.lease_until < now()))
      and public.grader_followup_eligible(f.unlock_id, f.lead_id)
      and exists (select 1 from public.grader_report_mail m where m.unlock_id = f.unlock_id and m.status = 'sent')
      and not exists (select 1 from public.grader_followups prev where prev.unlock_id = f.unlock_id
        and prev.day < f.day and prev.status in ('pending', 'sending'))
      and not exists (select 1 from public.grader_followups prev where prev.unlock_id = f.unlock_id
        and prev.sent_at > now() - interval '1 day')
    order by f.next_attempt_at, f.unlock_id, f.day for update skip locked limit 10
  ), claimed as (
    update public.grader_followups f set status = 'sending', attempts = f.attempts + 1,
      lease_id = gen_random_uuid(), lease_until = now() + interval '2 minutes'
    from candidates c where f.unlock_id = c.unlock_id and f.day = c.day returning f.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('unlock_id', c.unlock_id, 'lead_id', c.lead_id,
    'day', c.day, 'lease_id', c.lease_id, 'name', u.name, 'email', u.email,
    'slug', r.slug, 'issues', r.ai_summary->'top_issues', 'checks', r.results->'checks')), '[]'::jsonb) into jobs
  from claimed c join public.grader_unlocks u on u.id = c.unlock_id
    join public.grader_reports r on r.id = u.report_id;
  return jobs;
end;
$$;
revoke all on function public.grader_claim_followups(text) from public, anon, authenticated;
grant execute on function public.grader_claim_followups(text) to anon, authenticated;

create function public.grader_check_followup(p_secret text, p_unlock uuid, p_day integer, p_lease uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  perform public.check_grader_worker(p_secret);
  select public.grader_followup_eligible(f.unlock_id, f.lead_id) into allowed
    from public.grader_followups f where f.unlock_id = p_unlock and f.day = p_day
      and f.status = 'sending' and f.lease_id = p_lease and f.lease_until > now();
  if allowed is false then
    update public.grader_followups set status = 'suppressed', lease_id = null, lease_until = null
      where unlock_id = p_unlock and status in ('pending', 'sending');
  end if;
  return coalesce(allowed, false);
end;
$$;
revoke all on function public.grader_check_followup(text,uuid,integer,uuid) from public, anon, authenticated;
grant execute on function public.grader_check_followup(text,uuid,integer,uuid) to anon, authenticated;

create function public.grader_finish_followup(p_secret text, p_unlock uuid, p_day integer, p_lease uuid, p_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_grader_worker(p_secret);
  if p_success is null then raise exception 'Invalid delivery result.' using errcode = '22023'; end if;
  update public.grader_followups set
    status = case when p_success then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
    sent_at = case when p_success then now() else null end,
    next_attempt_at = case when p_success then next_attempt_at else now() + interval '5 minutes' * power(2, least(attempts - 1, 4)) end,
    lease_id = null, lease_until = null
  where unlock_id = p_unlock and day = p_day and lease_id = p_lease and status = 'sending';
  return found;
end;
$$;
revoke all on function public.grader_finish_followup(text,uuid,integer,uuid,boolean) from public, anon, authenticated;
grant execute on function public.grader_finish_followup(text,uuid,integer,uuid,boolean) to anon, authenticated;

create function public.grader_unsubscribe(p_secret text, p_unlock uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare normalized_email text;
begin
  perform public.check_grader_worker(p_secret);
  select lower(btrim(email)) into normalized_email from public.grader_unlocks where id = p_unlock;
  if normalized_email is null then return false; end if;
  insert into public.grader_unsubscribes(email) values (normalized_email) on conflict do nothing;
  update public.grader_followups f set status = 'suppressed', lease_id = null, lease_until = null
    from public.grader_unlocks u where f.unlock_id = u.id and lower(btrim(u.email)) = normalized_email
      and f.status in ('pending', 'sending');
  return true;
end;
$$;
revoke all on function public.grader_unsubscribe(text,uuid) from public, anon, authenticated;
grant execute on function public.grader_unsubscribe(text,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
