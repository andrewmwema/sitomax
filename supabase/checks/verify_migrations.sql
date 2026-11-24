with checks (
  migration, object_checked, kind, relation_name, object_name,
  grantee, privilege, expected
) as (
  values
    ('0001', 'table public.accounts', 'table', 'public.accounts', null, null, null, true),
    ('0001', 'table public.pages', 'table', 'public.pages', null, null, null, true),
    ('0001', 'function public.is_account_owner(uuid)', 'function', null, 'public.is_account_owner(uuid)', null, null, true),
    ('0001', 'policy public.pages: members read pages', 'policy', 'public.pages', 'members read pages', null, null, true),

    ('0002', 'authenticated UPDATE on public.sites.name', 'column_privilege', 'public.sites', 'name', 'authenticated', 'UPDATE', true),
    ('0002', 'authenticated UPDATE on public.sites.theme', 'column_privilege', 'public.sites', 'theme', 'authenticated', 'UPDATE', true),
    ('0002', 'no table-level UPDATE on public.sites for authenticated', 'table_privilege', 'public.sites', null, 'authenticated', 'UPDATE', false),

    ('0003', 'policy storage.objects: public read branding', 'policy', 'storage.objects', 'public read branding', null, null, true),
    ('0003', 'policy public.agency_settings: anon can read agency settings', 'policy', 'public.agency_settings', 'anon can read agency settings', null, null, true),

    ('0004', 'function public.can_write_site_assets(text)', 'function', null, 'public.can_write_site_assets(text)', null, null, true),
    ('0004', 'policy storage.objects: members insert site assets', 'policy', 'storage.objects', 'members insert site assets', null, null, true),

    ('0005', 'table public.section_designs', 'table', 'public.section_designs', null, null, null, true),
    ('0005', 'RLS enabled on public.section_designs', 'rls', 'public.section_designs', null, null, null, true),
    ('0005', 'policy public.section_designs: authenticated read section designs', 'policy', 'public.section_designs', 'authenticated read section designs', null, null, true),

    ('0006', 'storage bucket site-assets config (50MB, supported image/video types, no SVG)', 'bucket_config', null, 'site-assets', null, null, true),

    ('0007', 'function public.page_embed_codes(jsonb)', 'function', null, 'public.page_embed_codes(jsonb)', null, null, true),
    ('0007', 'trigger public.pages: guard_page_embeds', 'trigger', 'public.pages', 'guard_page_embeds', null, null, true),

    ('0008', 'policy public.section_designs: read shared or own designs', 'policy', 'public.section_designs', 'read shared or own designs', null, null, true),
    ('0008', 'policy public.section_designs: create private designs', 'policy', 'public.section_designs', 'create private designs', null, null, true),

    ('0009', 'table public.page_versions', 'table', 'public.page_versions', null, null, null, true),
    ('0009', 'index public.page_versions_page_date', 'index', 'public.page_versions', 'page_versions_page_date', null, null, true),
    ('0009', 'policy public.page_versions: members read page versions', 'policy', 'public.page_versions', 'members read page versions', null, null, true),
    ('0009', 'trigger public.pages: capture_page_version', 'trigger', 'public.pages', 'capture_page_version', null, null, true),

    ('0010', 'function public.create_template_site(uuid,text,text,text,jsonb,jsonb)', 'function', null, 'public.create_template_site(uuid,text,text,text,jsonb,jsonb)', null, null, true),
    ('0010', 'service_role EXECUTE on create_template_site', 'function_privilege', null, 'public.create_template_site(uuid,text,text,text,jsonb,jsonb)', 'service_role', 'EXECUTE', true),

    ('0011', 'table public.ai_limits', 'table', 'public.ai_limits', null, null, null, true),
    ('0011', 'table public.ai_requests', 'table', 'public.ai_requests', null, null, null, true),
    ('0011', 'table public.ai_usage', 'table', 'public.ai_usage', null, null, null, true),
    ('0011', 'policy public.ai_usage: owners read AI usage', 'policy', 'public.ai_usage', 'owners read AI usage', null, null, true),
    ('0011', 'service_role EXECUTE on reserve_ai_request', 'function_privilege', null, 'public.reserve_ai_request(uuid,uuid,text,text,uuid)', 'service_role', 'EXECUTE', true),

    ('0012', 'function public.begin_ai_site_generation(uuid,uuid,text,uuid)', 'function', null, 'public.begin_ai_site_generation(uuid,uuid,text,uuid)', null, null, true),
    ('0012', 'authenticated UPDATE on public.sites.draft_theme', 'column_privilege', 'public.sites', 'draft_theme', 'authenticated', 'UPDATE', true),
    ('0012', 'table public.site_draft_versions', 'table', 'public.site_draft_versions', null, null, null, true),
    ('0012', 'service_role EXECUTE on apply_generated_drafts', 'function_privilege', null, 'public.apply_generated_drafts(uuid,jsonb,jsonb,boolean)', 'service_role', 'EXECUTE', true),

    ('0013', 'column public.sites.business', 'column', 'public.sites', 'business', null, null, true),
    ('0013', 'function public.valid_site_business(jsonb)', 'function', null, 'public.valid_site_business(jsonb)', null, null, true),
    ('0013', 'authenticated EXECUTE on save_site_draft_theme', 'function_privilege', null, 'public.save_site_draft_theme(uuid,jsonb)', 'authenticated', 'EXECUTE', true),

    ('0014', 'function public.site_analytics(uuid,integer)', 'function', null, 'public.site_analytics(uuid,integer)', null, null, true),
    ('0014', 'authenticated EXECUTE on site_analytics', 'function_privilege', null, 'public.site_analytics(uuid,integer)', 'authenticated', 'EXECUTE', true),
    ('0014', 'index public.form_submissions_site_id_created_at_idx', 'index', 'public.form_submissions', 'form_submissions_site_id_created_at_idx', null, null, true),

    ('0015', 'table public.form_rate_limits', 'table', 'public.form_rate_limits', null, null, null, true),
    ('0015', 'RLS enabled on public.form_rate_limits', 'rls', 'public.form_rate_limits', null, null, null, true),
    ('0015', 'service_role EXECUTE on submit_contact_form', 'function_privilege', null, 'public.submit_contact_form(uuid,text,text,text,jsonb)', 'service_role', 'EXECUTE', true),
    ('0015', 'authenticated UPDATE on public.form_submissions.is_read', 'column_privilege', 'public.form_submissions', 'is_read', 'authenticated', 'UPDATE', true),

    ('0016', 'column public.sites.seo', 'column', 'public.sites', 'seo', null, null, true),
    ('0016', 'table public.redirects', 'table', 'public.redirects', null, null, null, true),
    ('0016', 'policy public.redirects: members manage redirects', 'policy', 'public.redirects', 'members manage redirects', null, null, true),
    ('0016', 'anon EXECUTE on lookup_tenant_redirect', 'function_privilege', null, 'public.lookup_tenant_redirect(text,text)', 'anon', 'EXECUTE', true),

    ('0017', 'column public.sites.domain_pending_since', 'column', 'public.sites', 'domain_pending_since', null, null, true),
    ('0017', 'table public.domain_action_limits', 'table', 'public.domain_action_limits', null, null, null, true),
    ('0017', 'authenticated EXECUTE on consume_domain_action', 'function_privilege', null, 'public.consume_domain_action(text,integer)', 'authenticated', 'EXECUTE', true),

    ('0018', 'table public.domain_requests', 'table', 'public.domain_requests', null, null, null, true),
    ('0018', 'index public.domain_requests_one_open_idx', 'index', 'public.domain_requests', 'domain_requests_one_open_idx', null, null, true),
    ('0018', 'policy public.domain_requests: owners create account domain requests', 'policy', 'public.domain_requests', 'owners create account domain requests', null, null, true),
    ('0018', 'authenticated INSERT on public.domain_requests.site_id', 'column_privilege', 'public.domain_requests', 'site_id', 'authenticated', 'INSERT', true),

    ('0019', 'column public.accounts.is_internal', 'column', 'public.accounts', 'is_internal', null, null, true),
    ('0019', 'index public.accounts_single_internal', 'index', 'public.accounts', 'accounts_single_internal', null, null, true),
    ('0019', 'no authenticated UPDATE on public.accounts.is_internal', 'column_privilege', 'public.accounts', 'is_internal', 'authenticated', 'UPDATE', false),
    ('0019', 'service_role EXECUTE on get_or_create_internal_account', 'function_privilege', null, 'public.get_or_create_internal_account(uuid,text)', 'service_role', 'EXECUTE', true),

    ('0020', 'table public.photo_search_limits', 'table', 'public.photo_search_limits', null, null, null, true),
    ('0020', 'policy public.photo_search_limits: service manages photo limits', 'policy', 'public.photo_search_limits', 'service manages photo limits', null, null, true),
    ('0020', 'authenticated EXECUTE on consume_photo_search', 'function_privilege', null, 'public.consume_photo_search(uuid)', 'authenticated', 'EXECUTE', true),

    ('0021', 'function public.list_site_media(uuid,text,integer,boolean)', 'function', null, 'public.list_site_media(uuid,text,integer,boolean)', null, null, true),
    ('0021', 'authenticated EXECUTE on list_site_media', 'function_privilege', null, 'public.list_site_media(uuid,text,integer,boolean)', 'authenticated', 'EXECUTE', true),

    ('0022', 'column public.page_versions.kind', 'column', 'public.page_versions', 'kind', null, null, true),
    ('0022', 'column public.page_versions.theme', 'column', 'public.page_versions', 'theme', null, null, true),
    ('0022', 'authenticated EXECUTE on save_editor_ai_draft', 'function_privilege', null, 'public.save_editor_ai_draft(uuid,jsonb,jsonb,boolean,jsonb)', 'authenticated', 'EXECUTE', true),

    ('0023', 'function public.apply_generated_drafts_selected(uuid,jsonb,jsonb,boolean)', 'function', null, 'public.apply_generated_drafts_selected(uuid,jsonb,jsonb,boolean)', null, null, true),
    ('0023', 'authenticated EXECUTE on replace_ai_site_drafts_with_business', 'function_privilege', null, 'public.replace_ai_site_drafts_with_business(uuid,jsonb,jsonb,jsonb)', 'authenticated', 'EXECUTE', true),
    ('0023', 'service_role EXECUTE on create_ai_site_with_business', 'function_privilege', null, 'public.create_ai_site_with_business(uuid,text,text,jsonb,jsonb,jsonb,uuid)', 'service_role', 'EXECUTE', true),

    ('0024', 'function public.reserve_ai_generation_call(uuid,uuid,uuid,text,text,uuid,boolean)', 'function', null, 'public.reserve_ai_generation_call(uuid,uuid,uuid,text,text,uuid,boolean)', null, null, true),
    ('0024', 'service_role EXECUTE on reserve_ai_generation_call', 'function_privilege', null, 'public.reserve_ai_generation_call(uuid,uuid,uuid,text,text,uuid,boolean)', 'service_role', 'EXECUTE', true),

    ('0025', 'column public.pages.nav_label', 'column', 'public.pages', 'nav_label', null, null, true),
    ('0025', 'constraint public.pages_nav_label_valid', 'constraint', 'public.pages', 'pages_nav_label_valid', null, null, true),
    ('0025', 'trigger public.pages: fill_page_nav_label', 'trigger', 'public.pages', 'fill_page_nav_label', null, null, true),

    ('0026', 'column public.pages.hide_from_menu', 'column', 'public.pages', 'hide_from_menu', null, null, true),
    ('0026', 'column public.pages.ai_pending_build', 'column', 'public.pages', 'ai_pending_build', null, null, true),
    ('0026', 'column public.ai_requests.selected_page_result', 'column', 'public.ai_requests', 'selected_page_result', null, null, true),
    ('0026', 'table public.ai_page_retries', 'table', 'public.ai_page_retries', null, null, null, true),
    ('0026', 'index public.ai_page_retries_page_id_idx', 'index', 'public.ai_page_retries', 'ai_page_retries_page_id_idx', null, null, true),
    ('0026', 'RLS enabled on public.ai_page_retries', 'rls', 'public.ai_page_retries', null, null, null, true),
    ('0026', 'service_role EXECUTE on apply_selected_ai_pages', 'function_privilege', null, 'public.apply_selected_ai_pages(uuid,jsonb,uuid,uuid,jsonb)', 'service_role', 'EXECUTE', true),
    ('0026', 'authenticated EXECUTE on save_selected_ai_drafts', 'function_privilege', null, 'public.save_selected_ai_drafts(uuid)', 'authenticated', 'EXECUTE', true),
    ('0026', 'authenticated EXECUTE on finish_ai_page_retry', 'function_privilege', null, 'public.finish_ai_page_retry(uuid,uuid)', 'authenticated', 'EXECUTE', true),

    ('0027', 'function public.list_site_files(uuid,text,integer)', 'function', null, 'public.list_site_files(uuid,text,integer)', null, null, true),
    ('0027', 'authenticated EXECUTE on list_site_files', 'function_privilege', null, 'public.list_site_files(uuid,text,integer)', 'authenticated', 'EXECUTE', true),

    ('0051', 'table public.conversion_events', 'table', 'public.conversion_events', null, null, null, true),
    ('0051', 'RLS enabled on public.conversion_events', 'rls', 'public.conversion_events', null, null, null, true),
    ('0051', 'policy public.conversion_events: owners read conversion events', 'policy', 'public.conversion_events', 'owners read conversion events', null, null, true),
    ('0051', 'authenticated SELECT on public.conversion_events', 'table_privilege', 'public.conversion_events', null, 'authenticated', 'SELECT', true),
    ('0051', 'authenticated INSERT on public.conversion_events', 'table_privilege', 'public.conversion_events', null, 'authenticated', 'INSERT', false),
    ('0051', 'service_role INSERT on public.conversion_events', 'table_privilege', 'public.conversion_events', null, 'service_role', 'INSERT', true)
)
select
  c.migration,
  c.object_checked,
  case c.kind
    when 'table' then to_regclass(c.relation_name) is not null
    when 'column' then exists (
      select 1 from pg_attribute a
      where a.attrelid = to_regclass(c.relation_name)
        and a.attname = c.object_name and a.attnum > 0 and not a.attisdropped
    )
    when 'function' then to_regprocedure(c.object_name) is not null
    when 'index' then exists (
      select 1 from pg_indexes i
      where i.schemaname = split_part(c.relation_name, '.', 1)
        and i.indexname = c.object_name
    )
    when 'policy' then exists (
      select 1 from pg_policies p
      where p.schemaname = split_part(c.relation_name, '.', 1)
        and p.tablename = split_part(c.relation_name, '.', 2)
        and p.policyname = c.object_name
    )
    when 'trigger' then exists (
      select 1 from pg_trigger t
      where t.tgrelid = to_regclass(c.relation_name)
        and t.tgname = c.object_name and not t.tgisinternal
    )
    when 'constraint' then exists (
      select 1 from pg_constraint x
      where x.conrelid = to_regclass(c.relation_name) and x.conname = c.object_name
    )
    when 'rls' then coalesce((
      select r.relrowsecurity from pg_class r where r.oid = to_regclass(c.relation_name)
    ), false)
    when 'table_privilege' then to_regclass(c.relation_name) is not null and coalesce(
      has_table_privilege(c.grantee, to_regclass(c.relation_name), c.privilege),
      false
    ) = c.expected
    when 'column_privilege' then exists (
      select 1 from pg_attribute a
      where a.attrelid = to_regclass(c.relation_name)
        and a.attname = c.object_name and a.attnum > 0 and not a.attisdropped
    ) and coalesce(
      has_column_privilege(c.grantee, to_regclass(c.relation_name), c.object_name, c.privilege),
      false
    ) = c.expected
    when 'function_privilege' then coalesce(
      has_function_privilege(c.grantee, to_regprocedure(c.object_name), c.privilege),
      false
    ) = c.expected and to_regprocedure(c.object_name) is not null
    when 'bucket_config' then exists (
      select 1 from storage.buckets b
      where b.id = c.object_name
        and b.file_size_limit = 52428800
        and coalesce(b.allowed_mime_types @> array[
          'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'video/mp4', 'video/webm'
        ]::text[], false)
        and not coalesce('image/svg+xml' = any(b.allowed_mime_types), false)
    )
    else false
  end as present
from checks c
order by c.migration, c.object_checked;
