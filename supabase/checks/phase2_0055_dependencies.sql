-- READ ONLY. Run before 0055; 0054's function is expected to be missing
-- until 0054 is applied. These checks cover named objects, not their behavior,
-- column types, constraints, grants, or indirect dependencies.
with required_columns(table_name, column_name, provided_by) as (
  values
    ('profiles', 'id', '0001_init.sql'),
    ('profiles', 'is_super_admin', '0001_init.sql'),
    ('accounts', 'id', '0001_init.sql'),
    ('accounts', 'is_internal', '0019_internal_account.sql'),
    ('accounts', 'site_plan_key', '0052_premium_template_catalog.sql'),
    ('account_members', 'account_id', '0001_init.sql'),
    ('account_members', 'user_id', '0001_init.sql'),
    ('account_members', 'role', '0001_init.sql'),
    ('sites', 'id', '0001_init.sql'),
    ('sites', 'account_id', '0001_init.sql'),
    ('sites', 'template_key', '0001_init.sql'),
    ('sites', 'theme', '0001_init.sql'),
    ('sites', 'draft_theme', '0012_ai_site_generator.sql'),
    ('sites', 'business', '0013_site_business.sql'),
    ('sites', 'draft_header', '0028_global_headers.sql'),
    ('sites', 'published_header', '0028_global_headers.sql'),
    ('pages', 'id', '0001_init.sql'),
    ('pages', 'site_id', '0001_init.sql'),
    ('pages', 'slug', '0001_init.sql'),
    ('pages', 'title', '0001_init.sql'),
    ('pages', 'sort_order', '0001_init.sql'),
    ('pages', 'draft_data', '0001_init.sql'),
    ('pages', 'published_data', '0001_init.sql'),
    ('pages', 'nav_label', '0025_page_menu_labels.sql'),
    ('pages', 'ai_pending_build', '0026_selected_ai_pages.sql'),
    ('site_templates', 'id', '0052_premium_template_catalog.sql'),
    ('site_templates', 'pages', '0052_premium_template_catalog.sql'),
    ('site_templates', 'is_active', '0052_premium_template_catalog.sql'),
    ('ai_limits', 'account_id', '0011_ai_usage.sql'),
    ('ai_limits', 'extra_credits', '0011_ai_usage.sql'),
    ('ai_requests', 'id', '0011_ai_usage.sql'),
    ('ai_requests', 'account_id', '0011_ai_usage.sql'),
    ('ai_requests', 'user_id', '0011_ai_usage.sql'),
    ('ai_requests', 'site_id', '0011_ai_usage.sql'),
    ('ai_requests', 'action', '0011_ai_usage.sql'),
    ('ai_requests', 'model', '0011_ai_usage.sql'),
    ('ai_requests', 'status', '0011_ai_usage.sql'),
    ('ai_requests', 'credits_used', '0011_ai_usage.sql'),
    ('ai_requests', 'is_unlimited', '0011_ai_usage.sql'),
    ('ai_requests', 'created_at', '0011_ai_usage.sql'),
    ('ai_requests', 'is_generation', '0012_ai_site_generator.sql'),
    ('ai_requests', 'generation_id', '0012_ai_site_generator.sql'),
    ('ai_requests', 'page_surcharge', '0026_selected_ai_pages.sql'),
    ('ai_requests', 'selected_page_result', '0026_selected_ai_pages.sql'),
    ('ai_requests', 'checkpoint_open', '0037_ai_draft_checkpoints.sql'),
    ('ai_usage', 'request_id', '0011_ai_usage.sql'),
    ('ai_usage', 'site_id', '0011_ai_usage.sql'),
    ('site_draft_versions', 'id', '0012_ai_site_generator.sql'),
    ('site_draft_versions', 'site_id', '0012_ai_site_generator.sql'),
    ('site_draft_versions', 'pages', '0012_ai_site_generator.sql'),
    ('site_draft_versions', 'theme', '0012_ai_site_generator.sql'),
    ('ai_page_retries', 'id', '0026_selected_ai_pages.sql'),
    ('ai_page_retries', 'generation_id', '0026_selected_ai_pages.sql'),
    ('ai_page_retries', 'page_id', '0026_selected_ai_pages.sql'),
    ('ai_page_retries', 'expected_draft', '0026_selected_ai_pages.sql'),
    ('ai_page_retries', 'sort_order', '0026_selected_ai_pages.sql'),
    ('ai_page_retries', 'spec', '0026_selected_ai_pages.sql'),
    ('ai_page_retries', 'lease_id', '0026_selected_ai_pages.sql'),
    ('ai_page_retries', 'leased_at', '0026_selected_ai_pages.sql')
), required_functions(signature, provided_by) as (
  values
    ('public.finish_ai_request(uuid,boolean,bigint,bigint,bigint,bigint,bigint,numeric)', '0011_ai_usage.sql'),
    ('public.finish_ai_site_generation(uuid,boolean,uuid)', '0012_ai_site_generator.sql; replaced by 0037_ai_draft_checkpoints.sql'),
    ('public.reserve_ai_generation_call(uuid,uuid,uuid,text,text,uuid,boolean)', '0024_custom_generation_call_budget.sql; replaced by 0026_selected_ai_pages.sql'),
    ('public.can_retry_ai_page(uuid)', '0026_selected_ai_pages.sql'),
    ('public.finish_ai_page_retry(uuid,uuid)', '0026_selected_ai_pages.sql'),
    ('public.checkpoint_ai_draft(uuid,uuid,uuid,jsonb)', '0037_ai_draft_checkpoints.sql'),
    ('public.list_ai_page_retries(uuid)', '0026_selected_ai_pages.sql; replaced by 0037_ai_draft_checkpoints.sql'),
    ('public.reserve_ai_request_for_plan(uuid,uuid,text,text,uuid)', '0054_ai_plan_allowances.sql')
), checks as (
  select 'column' as kind, 'public.' || table_name || '.' || column_name as object_name, provided_by,
    exists (select 1 from pg_catalog.pg_attribute a
      where a.attrelid = to_regclass(format('public.%I', table_name))
        and a.attname = column_name and a.attnum > 0 and not a.attisdropped) as present
  from required_columns
  union all
  select 'table', 'public.' || table_name, provided_by, to_regclass(format('public.%I', table_name)) is not null
    from (select distinct table_name, min(provided_by) as provided_by from required_columns group by table_name) tables
  union all
  select 'function', signature, provided_by, to_regprocedure(signature) is not null from required_functions
  union all
  select 'role', role_name, 'Supabase platform', exists (select 1 from pg_catalog.pg_roles r where r.rolname = role_name)
    from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name)
)
select kind, object_name, provided_by, case when present then 'present' else 'MISSING' end as status
from checks
order by present, kind, object_name;
