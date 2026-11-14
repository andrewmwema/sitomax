-- Clients may only edit a site's name and theme.
-- Subdomain, domain, verification and ownership change only
-- through server code using the service role.
revoke update on public.sites from authenticated, anon;
grant update (name, theme) on public.sites to authenticated;

-- Users may only change their own display name.
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;