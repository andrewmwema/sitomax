-- 0006_site_assets_limits.sql
-- Server-side upload validation for the "site-assets" bucket, enforced
-- by Supabase Storage itself (not just client code): max 50MB per file,
-- images plus MP4/WebM background videos only.

update storage.buckets
set
  file_size_limit = 52428800, -- 50MB
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    -- no image/svg+xml: SVG can carry scripts when opened directly
    'video/mp4',
    'video/webm'
  ]
where id = 'site-assets';
