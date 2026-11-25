-- READ ONLY. Checks direct references in the branch's 0054-0057 functions.
-- It does not inspect deployed function bodies or indirect dependencies.
with required_columns(table_name, column_names) as (values
  ('profiles', 'id is_super_admin'),
  ('accounts', 'id name is_internal site_plan_key'),
  ('account_members', 'account_id user_id role'),
  ('sites', 'id account_id template_key business theme draft_theme draft_header published_header'),
  ('pages', 'id site_id slug title sort_order draft_data published_data nav_label ai_pending_build'),
  ('site_templates', 'id pages is_active'),
  ('ai_limits', 'account_id monthly_site_generations monthly_edits extra_credits'),
  ('ai_plan_allowances', 'plan_key monthly_site_generations monthly_edits'),
  ('ai_account_allowance_overrides', 'account_id monthly_site_generations monthly_edits'),
  ('ai_requests', 'id account_id user_id site_id action model status credits_used is_unlimited created_at is_generation generation_id page_surcharge template_page_surcharge checkpoint_open'),
  ('ai_template_builds', 'generation_id template_id started_at created_at'),
  ('ai_page_retries', 'id generation_id page_id expected_draft sort_order spec lease_id leased_at'),
  ('ai_usage', 'request_id site_id'),
  ('site_draft_versions', 'id site_id pages theme header header_captured generated_page_ids')
), required_functions(signature) as (values
  ('public.is_super_admin()'),
  ('public.is_account_owner(uuid)'),
  ('public.reserve_ai_request_for_plan(uuid,uuid,text,text,uuid)'),
  ('public.begin_ai_site_generation_for_plan(uuid,uuid,text,uuid)'),
  ('public.begin_selected_ai_generation_for_plan(uuid,uuid,text,integer,uuid)'),
  ('public.ai_account_plan_summaries()'),
  ('public.capture_legacy_ai_allowance_override()'),
  ('public.refund_ai_template_page_surcharge()'),
  ('public.begin_ai_template_build(uuid,uuid,text)'),
  ('public.select_ai_template(uuid,uuid,uuid,text)'),
  ('public.cancel_ai_template_build(uuid,uuid,uuid)'),
  ('public.start_ai_template_checkpoints(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'),
  ('public.complete_ai_template_checkpoints(uuid,uuid)'),
  ('public.claim_ai_template_retry(uuid,uuid)'),
  ('public.capture_ai_draft_version_state()'),
  ('public.restore_ai_draft_version(uuid,uuid)'),
  ('public.finish_ai_request(uuid,boolean,bigint,bigint,bigint,bigint,bigint,numeric)'),
  ('public.finish_ai_site_generation(uuid,boolean,uuid)')
), builtin_functions(name) as (values
  ('clock_timestamp'), ('now'), ('date_trunc'), ('hashtextextended'),
  ('pg_advisory_xact_lock'), ('count'), ('jsonb_agg'), ('jsonb_array_length'),
  ('jsonb_typeof'), ('jsonb_array_elements'), ('jsonb_build_object'),
  ('jsonb_build_array'), ('jsonb_set'), ('to_jsonb')
), checks(kind, object_name, present) as (
  select 'table', 'public.' || table_name,
    to_regclass(format('public.%I', table_name)) is not null
  from required_columns
  union all
  select 'column', 'public.' || table_name || '.' || col,
    exists (select 1 from pg_attribute a
      where a.attrelid = to_regclass(format('public.%I', table_name))
        and a.attname = col and a.attnum > 0 and not a.attisdropped)
  from required_columns cross join lateral unnest(string_to_array(column_names, ' ')) as c(col)
  union all
  select 'function', signature, to_regprocedure(signature) is not null
  from required_functions
  union all
  select 'builtin', 'pg_catalog.' || b.name, exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pg_catalog' and p.proname = b.name
  ) from builtin_functions b
)
select kind, object_name, present from checks
order by present, kind, object_name;
