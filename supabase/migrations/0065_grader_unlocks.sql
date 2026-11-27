begin;

create table public.grader_unlock_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index grader_unlock_attempts_rate_idx on public.grader_unlock_attempts(ip_hash, created_at desc);
alter table public.grader_unlock_attempts enable row level security;
revoke all on public.grader_unlock_attempts from public, anon, authenticated;

create table public.grader_notifications (
  id uuid primary key default gen_random_uuid(),
  unlock_id uuid not null unique references public.grader_unlocks(id) on delete cascade,
  lead_id uuid not null references public.form_submissions(id) on delete cascade,
  report_id uuid not null references public.grader_reports(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index grader_notifications_due_idx on public.grader_notifications(next_attempt_at)
  where status in ('pending', 'sending');
alter table public.grader_notifications enable row level security;
revoke all on public.grader_notifications from public, anon, authenticated;
grant select on public.grader_notifications to authenticated;
create policy grader_notifications_admin_read on public.grader_notifications for select to authenticated
  using (public.is_super_admin());

create function public.grader_unlock_report(
  p_secret text, p_slug text, p_name text, p_email text, p_phone text,
  p_consent boolean, p_ip_hash text, p_report_url text, p_account_id uuid, p_site_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  report public.grader_reports%rowtype;
  lead uuid;
  unlock_id uuid;
  normalized_email text := lower(btrim(p_email));
  details text;
  existing_unlock uuid;
begin
  perform public.check_grader_worker(p_secret);
  if p_slug is null or p_slug !~ '^[a-z0-9-]{1,60}$' or p_name is null or length(btrim(p_name)) not between 1 and 120
    or normalized_email is null or length(normalized_email) not between 3 and 254 or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or (p_phone is not null and length(p_phone) > 80) or p_consent is null
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' or p_report_url is null or p_report_url !~ '^https?://[^[:space:]]+$'
    or length(p_report_url) > 2048 then
    raise exception 'Invalid unlock request.' using errcode = '22023';
  end if;
  if p_account_id is null or p_site_id is null or not exists (
    select 1 from public.sites s where s.id = p_site_id and s.account_id = p_account_id
  ) then raise exception 'Grader lead destination is not configured.' using errcode = '55000'; end if;
  perform pg_advisory_xact_lock(hashtextextended('grader-unlock-ip:' || p_ip_hash, 0));
  if (select count(*) from public.grader_unlock_attempts a
    where a.ip_hash = p_ip_hash and a.created_at >= now() - interval '1 hour') >= 10 then
    return jsonb_build_object('error', 'rate_limit');
  end if;
  insert into public.grader_unlock_attempts(ip_hash) values (p_ip_hash);
  select * into report from public.grader_reports where slug = p_slug for update;
  if not found or report.status <> 'complete' then return jsonb_build_object('error', 'unavailable'); end if;

  perform pg_advisory_xact_lock(hashtextextended('grader-lead:' || p_site_id::text || ':' || normalized_email, 0));
  select u.id into existing_unlock from public.grader_unlocks u
    where u.report_id = report.id and lower(btrim(u.email)) = normalized_email order by u.created_at limit 1;
  if existing_unlock is not null then
    return jsonb_build_object('ok', true);
  end if;
  select f.id into lead from public.form_submissions f
    where f.site_id = p_site_id and f.deleted_at is null and exists (
      select 1 from jsonb_each_text(case when jsonb_typeof(f.data) = 'object' then f.data else '{}'::jsonb end) field
      where regexp_replace(lower(field.key), '[[:space:]_-]+', '', 'g') in ('email', 'emailaddress')
        and lower(btrim(field.value)) = normalized_email
    ) order by f.created_at, f.id limit 1 for update;
  if lead is null then
    insert into public.form_submissions(site_id, page_path, form_name, data)
      values (p_site_id, '/grader', 'Website Grader',
        jsonb_build_object('name', btrim(p_name), 'email', normalized_email, 'phone', nullif(btrim(p_phone), ''),
          'website', coalesce(report.final_url, report.url_input)))
      returning id into lead;
  else
    update public.form_submissions set unread = true, is_read = false, last_activity_at = now()
      where id = lead;
  end if;
  details := 'Website Grader report: ' || p_report_url || E'\nWebsite: ' ||
    coalesce(report.final_url, report.url_input) || E'\nScore: ' ||
    coalesce(report.scores->>'overall', 'Could not score') || E'\nTop issues: ' ||
    coalesce((select string_agg(issue->>'title', '; ' order by ord)
      from jsonb_array_elements(case when jsonb_typeof(report.ai_summary->'top_issues') = 'array'
        then report.ai_summary->'top_issues' else '[]'::jsonb end) with ordinality as i(issue, ord)),
      'Not available');
  insert into public.lead_notes(lead_id, site_id, author_id, body)
    values (lead, p_site_id, null, left(details, 4000));
  insert into public.grader_unlocks(report_id, name, email, phone, consent_marketing)
    values (report.id, btrim(p_name), normalized_email, nullif(btrim(p_phone), ''), p_consent)
    returning id into unlock_id;
  update public.grader_reports set unlocked = true, lead_id = lead where id = report.id;
  insert into public.grader_notifications(unlock_id, lead_id, report_id)
    values (unlock_id, lead, report.id);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.grader_unlock_report(text,text,text,text,text,boolean,text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.grader_unlock_report(text,text,text,text,text,boolean,text,text,uuid,uuid) to anon, authenticated;

create function public.grader_claim_notifications(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare jobs jsonb;
begin
  perform public.check_grader_worker(p_secret);
  delete from public.grader_unlock_attempts where created_at < now() - interval '1 day';
  update public.grader_notifications set status = 'failed', lease_id = null, lease_until = null
    where status = 'sending' and lease_until < now() and attempts >= 5;
  with candidates as (
    select id from public.grader_notifications
    where (status = 'pending' and next_attempt_at <= now())
       or (status = 'sending' and lease_until < now())
    order by next_attempt_at, id for update skip locked limit 10
  ), claimed as (
    update public.grader_notifications n set status = 'sending', attempts = n.attempts + 1,
      lease_id = gen_random_uuid(), lease_until = now() + interval '2 minutes'
    from candidates c where n.id = c.id returning n.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'lease_id', c.lease_id, 'lead_id', c.lead_id, 'site_id', f.site_id,
    'slug', r.slug, 'domain', r.domain, 'url', coalesce(r.final_url, r.url_input),
    'score', r.scores->'overall'
  )), '[]'::jsonb) into jobs
  from claimed c join public.grader_reports r on r.id = c.report_id
    join public.form_submissions f on f.id = c.lead_id;
  return jobs;
end;
$$;
revoke all on function public.grader_claim_notifications(text) from public, anon, authenticated;
grant execute on function public.grader_claim_notifications(text) to anon, authenticated;

create function public.grader_finish_notification(p_secret text, p_id uuid, p_lease uuid, p_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_grader_worker(p_secret);
  if p_success is null then raise exception 'Invalid notification result.' using errcode = '22023'; end if;
  update public.grader_notifications set
    status = case when p_success then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
    sent_at = case when p_success then now() else null end,
    next_attempt_at = case when p_success then next_attempt_at else now() + interval '5 minutes' * power(2, least(attempts - 1, 4)) end,
    lease_id = null, lease_until = null
  where id = p_id and lease_id = p_lease and status = 'sending';
  return found;
end;
$$;
revoke all on function public.grader_finish_notification(text,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.grader_finish_notification(text,uuid,uuid,boolean) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
