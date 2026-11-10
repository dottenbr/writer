-- Collaborator changes are proposals; only the author publishes canonical text.
drop policy bookkit_update on public.bookkit_documents;
create policy bookkit_update on public.bookkit_documents for update using(public.has_project_access(project_id,'owner')) with check(public.has_project_access(project_id,'owner'));
drop policy bookkit_insert on public.bookkit_documents;
create policy bookkit_insert on public.bookkit_documents for insert with check(public.has_project_access(project_id,'owner'));
drop policy assets_update on public.bookkit_assets;
create policy assets_update on public.bookkit_assets for update to authenticated using(public.has_project_access(project_id,'owner')) with check(public.has_project_access(project_id,'owner'));

create or replace function public.restore_bookkit_snapshot(p_project_id uuid,p_snapshot_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare safety uuid; expected integer; expected_assets integer; complete boolean;
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'owner') then raise exception 'Insufficient restore access'; end if;
 perform pg_advisory_xact_lock(78210613);
 select document_count,asset_count,import_complete into expected,expected_assets,complete from public.bookkit_snapshots where snapshot_id=p_snapshot_id and project_id=p_project_id;
 if not found then raise exception 'Bookkit snapshot not found for project'; end if;
 if expected<>(select count(*) from public.bookkit_snapshot_files where snapshot_id=p_snapshot_id) or (expected_assets is not null and expected_assets<>(select count(*) from public.bookkit_snapshot_assets where snapshot_id=p_snapshot_id)) then raise exception 'Incomplete snapshot'; end if;
 safety:=public.capture_bookkit_snapshot(p_project_id,'Auto-snapshot before restore');
 delete from public.bookkit_documents d where d.project_id=p_project_id and not exists(select 1 from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id where f.snapshot_id=p_snapshot_id and r.path=d.path);
 insert into public.bookkit_documents(project_id,path,content,source_sha256,unix_mode)
 select p_project_id,r.path,r.content,r.source_sha256,coalesce(f.unix_mode,current.unix_mode,33188)
 from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id left join public.bookkit_documents current on current.project_id=p_project_id and current.path=r.path
 where f.snapshot_id=p_snapshot_id and (current.revision_id is distinct from r.id or (f.unix_mode is not null and current.unix_mode is distinct from f.unix_mode))
 on conflict(project_id,path) do update set content=excluded.content,source_sha256=excluded.source_sha256,unix_mode=excluded.unix_mode;
 if expected_assets is not null then
  delete from public.bookkit_assets a where a.project_id=p_project_id and not exists(select 1 from public.bookkit_snapshot_assets f where f.snapshot_id=p_snapshot_id and f.path=a.path);
  insert into public.bookkit_assets(project_id,path,size_bytes,sha256,unix_mode,chunks,is_directory)
  select p_project_id,f.path,(f.manifest->>'size_bytes')::bigint,f.manifest->>'sha256',(f.manifest->>'unix_mode')::integer,f.manifest->'chunks',(f.manifest->>'is_directory')::boolean from public.bookkit_snapshot_assets f where f.snapshot_id=p_snapshot_id
  on conflict(project_id,path) do update set size_bytes=excluded.size_bytes,sha256=excluded.sha256,unix_mode=excluded.unix_mode,chunks=excluded.chunks,is_directory=excluded.is_directory;
  update public.projects set bookkit_import_complete=complete where id=p_project_id;
 end if;
 return safety;
end;
$$;

