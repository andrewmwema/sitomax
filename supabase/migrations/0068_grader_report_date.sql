-- Grader reports: expose the scan date, and the business name once unlocked, for the PDF and web report.
create or replace function public.grader_get_report(p_secret text, p_slug text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare report public.grader_reports;
begin
  perform public.check_grader_worker(p_secret);
  update public.grader_reports set status = 'failed', completed_at = now(),
    progress = progress || '{"scan":"failed"}'::jsonb
    where slug = p_slug and status in ('queued', 'running') and created_at < now() - interval '4 minutes';
  select * into report from public.grader_reports where slug = p_slug;
  if not found then return null; end if;
  return jsonb_build_object(
    'slug', report.slug, 'url', report.final_url, 'domain', report.domain,
    'status', report.status, 'progress', report.progress, 'scores', report.scores,
    'screenshot_url', report.screenshot_url, 'unlocked', report.unlocked,
    'scanned_at', coalesce(report.completed_at, report.created_at),
    'headline', report.ai_summary->'headline', 'top_issues', (
      select jsonb_agg(jsonb_build_object('title', issue->'title', 'why_it_matters', issue->'why_it_matters'))
      from jsonb_array_elements(case when jsonb_typeof(report.ai_summary->'top_issues') = 'array'
        then report.ai_summary->'top_issues' else '[]'::jsonb end) issue
    )
  ) || case when report.unlocked then jsonb_build_object(
              'results', report.results, 'ai_summary', report.ai_summary, 'business_name', report.business_name)
            else '{}'::jsonb end;
end;
$$;
