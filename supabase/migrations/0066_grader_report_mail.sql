begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('grader-reports', 'grader-reports', false, 8388608, array['application/pdf'])
on conflict (id) do nothing;
create policy "grader worker reads reports" on storage.objects for select to anon, authenticated
  using (bucket_id = 'grader-reports' and public.grader_storage_authorized());
create policy "grader worker uploads reports" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'grader-reports' and public.grader_storage_authorized());

create table public.grader_report_mail (
  unlock_id uuid primary key references public.grader_unlocks(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  sent_at timestamptz
);
create index grader_report_mail_due_idx on public.grader_report_mail(next_attempt_at)
  where status in ('pending', 'sending');
alter table public.grader_report_mail enable row level security;
revoke all on public.grader_report_mail from public, anon, authenticated;
grant select on public.grader_report_mail to authenticated;
create policy grader_report_mail_admin_read on public.grader_report_mail for select to authenticated
  using (public.is_super_admin());

create function public.queue_grader_report_mail() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.grader_report_mail(unlock_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.queue_grader_report_mail() from public, anon, authenticated;
create trigger queue_grader_report_mail after insert on public.grader_unlocks
  for each row execute function public.queue_grader_report_mail();
insert into public.grader_report_mail(unlock_id) select id from public.grader_unlocks on conflict do nothing;

create function public.grader_claim_report_mail(p_secret text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare jobs jsonb;
begin
  perform public.check_grader_worker(p_secret);
  update public.grader_report_mail set status = 'failed', lease_id = null, lease_until = null
    where status = 'sending' and lease_until < now() and attempts >= 5;
  with candidates as (
    select unlock_id from public.grader_report_mail
    where (status = 'pending' and next_attempt_at <= now()) or (status = 'sending' and lease_until < now())
    order by next_attempt_at, unlock_id for update skip locked limit 5
  ), claimed as (
    update public.grader_report_mail m set status = 'sending', attempts = m.attempts + 1,
      lease_id = gen_random_uuid(), lease_until = now() + interval '2 minutes'
    from candidates c where m.unlock_id = c.unlock_id returning m.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('unlock_id', c.unlock_id, 'lease_id', c.lease_id,
    'email', u.email, 'name', u.name, 'slug', r.slug)), '[]'::jsonb) into jobs
  from claimed c join public.grader_unlocks u on u.id = c.unlock_id
    join public.grader_reports r on r.id = u.report_id where r.unlocked and r.status = 'complete';
  return jobs;
end;
$$;
revoke all on function public.grader_claim_report_mail(text) from public, anon, authenticated;
grant execute on function public.grader_claim_report_mail(text) to anon, authenticated;

create function public.grader_finish_report_mail(p_secret text, p_unlock uuid, p_lease uuid, p_success boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.check_grader_worker(p_secret);
  if p_success is null then raise exception 'Invalid delivery result.' using errcode = '22023'; end if;
  update public.grader_report_mail set
    status = case when p_success then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
    sent_at = case when p_success then now() else null end,
    next_attempt_at = case when p_success then next_attempt_at else now() + interval '5 minutes' * power(2, least(attempts - 1, 4)) end,
    lease_id = null, lease_until = null
  where unlock_id = p_unlock and lease_id = p_lease and status = 'sending';
  return found;
end;
$$;
revoke all on function public.grader_finish_report_mail(text,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.grader_finish_report_mail(text,uuid,uuid,boolean) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
