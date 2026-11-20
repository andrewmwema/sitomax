-- Run against an isolated database with migrations through 0032.
begin;

do $$
declare
  account uuid := gen_random_uuid();
  site uuid := gen_random_uuid();
  scheduled jsonb := '{"version":1,"blocks":[],"metadata":{"slug":"due","title":"Reviewed version"}}';
begin
  insert into public.accounts(id, name) values (account, 'Scheduled blog test');
  insert into public.sites(id, account_id, subdomain) values (site, account, 'scheduled-blog-test');
  insert into public.posts(site_id, slug, title, status, publish_at, scheduled_content) values
    (site, 'due', 'Reviewed version', 'scheduled', now() - interval '1 minute', scheduled),
    (site, 'future', 'Not due', 'scheduled', now() + interval '1 minute', jsonb_set(scheduled, '{metadata,slug}', '"future"')),
    (site, 'canceled', 'Canceled', 'scheduled', now() - interval '1 minute', jsonb_set(scheduled, '{metadata,slug}', '"canceled"')),
    (site, 'legacy', 'Needs rescheduling', 'scheduled', now() - interval '1 minute', null);

  update public.posts set status = 'draft', publish_at = null where site_id = site and slug = 'canceled';
  update public.posts set title = 'Private revision', draft_content = '{"version":1,"blocks":[{"type":"paragraph","html":"Private"}]}'
    where site_id = site and slug = 'due';
  begin
    update public.posts set slug = 'private-url' where site_id = site and slug = 'due';
    raise exception 'Changing a scheduled URL must be rejected';
  exception when check_violation then null;
  end;
  assert not exists (select from public.posts where site_id = site and published_content is not null), 'Queueing does not publish';
  assert not has_function_privilege('authenticated', 'public.publish_due_blog_posts()', 'execute'), 'Users cannot run the job';
  assert not has_function_privilege('anon', 'public.publish_due_blog_posts()', 'execute'), 'Public clients cannot run the job';
  assert public.publish_due_blog_posts() = 1, 'Only the due, uncanceled snapshot is published';
  assert exists (
    select from public.posts where site_id = site and slug = 'due' and status = 'published'
      and published_content = scheduled and scheduled_content is null and publish_at is null
      and published_at is not null and title = 'Private revision' and has_unpublished_changes
  ), 'Publishes the frozen snapshot and retains newer draft edits';
  assert exists (
    select from public.posts where site_id = site and slug = 'canceled' and status = 'draft' and scheduled_content is null
  ), 'Canceling clears the snapshot';
  assert public.publish_due_blog_posts() = 0, 'Repeating a run does not republish a post';
end;
$$;

rollback;
