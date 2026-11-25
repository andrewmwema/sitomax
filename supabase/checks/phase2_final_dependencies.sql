-- READ ONLY. Complements phase2_0055_dependencies.sql. Presence does not prove
-- migration history, compatible bodies, grants, constraints or behavior.
-- Do not apply a migration merely because one of its objects is missing.

with expected(signature, source) as (values
  ('public.valid_site_business(jsonb)', '0013; replaced by 0052_ai_business_intake'),
  ('public.is_super_admin()', '0001'),
  ('public.is_account_owner(uuid)', '0001'),
  ('public.is_account_member(uuid)', '0001'),
  ('public.create_site_from_template(uuid,text,text,text,text)', '0052 premium; replaced by 0053'),
  ('public.reserve_ai_request_for_plan(uuid,uuid,text,text,uuid)', '0054; corrected by 0056'),
  ('public.begin_ai_template_build(uuid,uuid,text)', '0055'),
  ('public.select_ai_template(uuid,uuid,uuid,text)', '0055'),
  ('public.start_ai_template_checkpoints(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)', '0055; corrected by 0056'),
  ('public.complete_ai_template_checkpoints(uuid,uuid)', '0055'),
  ('public.capture_ai_draft_version_state()', '0057'),
  ('public.restore_ai_draft_version(uuid,uuid)', '0057'),
  ('public.save_ai_empty_page(uuid,jsonb,jsonb)', '0058'),
  ('public.create_ai_template_site(uuid,uuid,text,text,text,text,jsonb)', '0059'),
  ('public.create_ai_template_site_with_colors(uuid,uuid,text,text,text,text,jsonb,text,text)', '0060'),
  ('public.checkpoint_ai_template_logo(uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb)', '0061')
)
select e.signature, e.source, p.oid is not null as present,
  p.prosecdef as security_definer,
  case when p.oid is not null then has_function_privilege('authenticated', p.oid, 'execute') end as authenticated_execute,
  case when p.oid is not null then has_function_privilege('service_role', p.oid, 'execute') end as service_role_execute
from expected e left join pg_catalog.pg_proc p on p.oid = to_regprocedure(e.signature)
order by e.source, e.signature;

with expected(schema_name, table_name, column_name, source) as (values
  ('public', 'site_draft_versions', 'header', '0055'),
  ('public', 'site_draft_versions', 'header_captured', '0057'),
  ('public', 'site_draft_versions', 'created_at', '0012'),
  ('public', 'site_draft_versions', 'generated_page_ids', '0012'),
  ('public', 'ai_requests', 'template_page_surcharge', '0055'),
  ('public', 'ai_template_builds', 'generation_id', '0055'),
  ('public', 'ai_template_builds', 'template_id', '0055'),
  ('public', 'ai_template_builds', 'started_at', '0055'),
  ('public', 'page_versions', 'page_id', '0009'),
  ('public', 'page_versions', 'data', '0009'),
  ('public', 'page_versions', 'kind', '0022'),
  ('public', 'page_versions', 'published_at', '0009'),
  ('public', 'sites', 'theme', '0001'),
  ('public', 'sites', 'draft_theme', '0012'),
  ('public', 'sites', 'draft_header', '0028'),
  ('public', 'sites', 'published_header', '0028'),
  ('storage', 'objects', 'bucket_id', 'Supabase Storage'),
  ('storage', 'objects', 'name', 'Supabase Storage')
)
select e.schema_name, e.table_name, e.column_name, e.source, a.attnum is not null as present,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type, a.attnotnull
from expected e left join pg_catalog.pg_attribute a
  on a.attrelid = to_regclass(format('%I.%I', e.schema_name, e.table_name))
    and a.attname = e.column_name and a.attnum > 0 and not a.attisdropped
order by e.schema_name, e.table_name, e.column_name;

select t.tgname, pg_catalog.pg_get_triggerdef(t.oid) as definition
from pg_catalog.pg_trigger t
where t.tgrelid in (to_regclass('public.ai_limits'), to_regclass('public.site_draft_versions'))
  and not t.tgisinternal
order by t.tgname;

-- Review definitions, not only names. Compare with the recorded deployed main
-- and the intended branch migrations; do not share credentials or site data.
select p.oid::regprocedure as signature, pg_catalog.pg_get_functiondef(p.oid) as definition
from pg_catalog.pg_proc p
where p.oid in (
  to_regprocedure('public.valid_site_business(jsonb)'),
  to_regprocedure('public.create_site_from_template(uuid,text,text,text,text)'),
  to_regprocedure('public.reserve_ai_request_for_plan(uuid,uuid,text,text,uuid)'),
  to_regprocedure('public.start_ai_template_checkpoints(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'),
  to_regprocedure('public.capture_ai_draft_version_state()')
)
order by p.oid::regprocedure::text;
