-- A library you create is visible to you straight away (insert … returning),
-- before the access functions' snapshot can see the new row.
drop policy libraries_select on public.libraries;
create policy libraries_select on public.libraries for select to authenticated
  using (owner_id = auth.uid() or created_by = auth.uid() or public.can_see_library(id));
