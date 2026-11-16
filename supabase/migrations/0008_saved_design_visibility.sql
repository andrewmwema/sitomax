-- Private designs belong to their creator; only the agency can share globally.
-- Existing designs remain global.
alter table public.section_designs alter column is_global set default false;

drop policy "authenticated read section designs" on public.section_designs;

create policy "read shared or own designs" on public.section_designs
  for select to authenticated
  using (is_global or created_by = auth.uid() or public.is_super_admin());

create policy "create private designs" on public.section_designs
  for insert to authenticated
  with check (created_by = auth.uid() and not is_global);

create policy "update own private designs" on public.section_designs
  for update to authenticated
  using (created_by = auth.uid() and not is_global)
  with check (created_by = auth.uid() and not is_global);

create policy "delete own private designs" on public.section_designs
  for delete to authenticated
  using (created_by = auth.uid() and not is_global);
