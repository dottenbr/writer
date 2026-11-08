-- Preserve NULL for absent files so adding or removing an empty file is visible.
create or replace function public.diff_bookkit_snapshot(p_project_id uuid,p_snapshot_id uuid,p_other_id uuid default null,p_offset integer default 0)
returns table(path text,before_text text,after_text text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'viewer') then raise exception 'Insufficient snapshot access'; end if;
 if not exists(select 1 from public.bookkit_snapshots where snapshot_id=p_snapshot_id and project_id=p_project_id) or (p_other_id is not null and not exists(select 1 from public.bookkit_snapshots where snapshot_id=p_other_id and project_id=p_project_id)) then raise exception 'Bookkit snapshot not found for project'; end if;
 return query with a as (
  select r.path,r.content from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id where f.snapshot_id=p_snapshot_id
 ), b as (
  select d.path,d.content from public.bookkit_documents d where p_other_id is null and d.project_id=p_project_id
  union all
  select r.path,r.content from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id where p_other_id is not null and f.snapshot_id=p_other_id
 ) select coalesce(a.path,b.path),a.content,b.content from a full join b on a.path=b.path where a.content is distinct from b.content order by 1 offset greatest(0,p_offset) limit 50;
end;
$$;
