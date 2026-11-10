-- Leave unchanged files alone during restore, including large research sources.
create or replace function public.restore_bookkit_snapshot(p_project_id uuid,p_snapshot_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare safety uuid; expected integer;
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'editor') then raise exception 'Insufficient restore access'; end if;
 perform pg_advisory_xact_lock(78210613);
 select document_count into expected from public.bookkit_snapshots where snapshot_id=p_snapshot_id and project_id=p_project_id;
 if not found then raise exception 'Bookkit snapshot not found for project'; end if;
 if expected<>(select count(*) from public.bookkit_snapshot_files where snapshot_id=p_snapshot_id) then raise exception 'Incomplete snapshot'; end if;
 safety:=public.capture_bookkit_snapshot(p_project_id,'Auto-snapshot before restore');
 delete from public.bookkit_documents d where d.project_id=p_project_id and not exists(select 1 from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id where f.snapshot_id=p_snapshot_id and r.path=d.path);
 insert into public.bookkit_documents(project_id,path,content,source_sha256)
 select p_project_id,r.path,r.content,r.source_sha256 from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id where f.snapshot_id=p_snapshot_id and not exists(select 1 from public.bookkit_documents current where current.project_id=p_project_id and current.path=r.path and current.revision_id=r.id)
 on conflict(project_id,path) do update set content=excluded.content,source_sha256=excluded.source_sha256;
 return safety;
end;
$$;

