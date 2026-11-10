-- An INSERT ... RETURNING row must be visible before stable helper queries can
-- find it in their snapshot. Test the inserted row's owner directly.
drop policy projects_select on public.projects;
create policy projects_select on public.projects for select
 using (owner_id=auth.uid() or public.has_project_access(id,'viewer'));
