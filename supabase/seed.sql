-- Seed data: the single agency_settings row.
insert into public.agency_settings (id, name, logo_url, primary_color, support_email)
values (1, 'My Agency', null, '#4f46e5', 'support@example.com')
on conflict (id) do nothing;
