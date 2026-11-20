begin;

create extension if not exists pg_cron;

alter table public.posts
  add column scheduled_content jsonb,
  add constraint posts_scheduled_snapshot check (
    scheduled_content is null or (
      status = 'scheduled' and publish_at is not null and
      jsonb_typeof(scheduled_content) = 'object' and
      (scheduled_content->'version' = '1'::jsonb) is true and
      (scheduled_content#>>'{metadata,slug}' = slug) is true
    )
  );

create index posts_due_schedule_idx on public.posts (publish_at, id)
  where status = 'scheduled' and scheduled_content is not null;

create function public.clear_blog_schedule()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'scheduled' then
    new.scheduled_content := null;
  elsif new.scheduled_content is not null and new.scheduled_content = old.scheduled_content
    and new.draft_content is distinct from old.draft_content then
    new.has_unpublished_changes := true;
  end if;
  return new;
end;
$$;
revoke all on function public.clear_blog_schedule() from public, anon, authenticated, service_role;

create trigger clear_blog_schedule_before_update before update on public.posts
  for each row execute function public.clear_blog_schedule();

create function public.publish_due_blog_posts()
returns integer language plpgsql set search_path = '' as $$
declare
  published_count integer;
begin
  with due as (
    select id from public.posts
    where status = 'scheduled' and scheduled_content is not null and publish_at <= now()
    order by publish_at, id
    limit 100
    for update skip locked
  )
  update public.posts p
  set status = 'published', published_content = p.scheduled_content,
    published_at = now(), publish_at = null, scheduled_content = null
  from due where p.id = due.id;
  get diagnostics published_count = row_count;
  return published_count;
end;
$$;
revoke all on function public.publish_due_blog_posts() from public, anon, authenticated, service_role;

select cron.schedule('publish-due-blog-posts', '* * * * *', 'select public.publish_due_blog_posts()');

commit;
