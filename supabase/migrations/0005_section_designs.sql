-- 0005_section_designs.sql
-- Section design library: presets the agency creates in the editor
-- ("Save as design") and offers to every client in the "Add section"
-- gallery, alongside the built-in catalog (lib/sections/catalog.ts).

create table public.section_designs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  block_type text not null,
  props jsonb not null default '{}'::jsonb,
  thumbnail_url text,
  created_by uuid references public.profiles (id) on delete set null,
  is_global boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.section_designs enable row level security;

-- Every signed-in user (clients picking a design in the editor) can read.
create policy "authenticated read section designs" on public.section_designs
  for select to authenticated
  using (true);

-- Only the super admin creates, updates or deletes designs.
create policy "super admin manages section designs" on public.section_designs
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
