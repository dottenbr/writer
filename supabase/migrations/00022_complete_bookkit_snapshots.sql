-- Preserve file metadata and immutable asset pointers alongside text revisions.
-- NULL asset_count marks historical text-only snapshots; restoring those leaves
-- attachments untouched, since their old state was never recorded.
alter table public.bookkit_snapshots add column asset_count integer;
alter table public.bookkit_snapshots add column import_complete boolean;
alter table public.bookkit_snapshot_files add column unix_mode integer;
create table public.bookkit_snapshot_assets (
 snapshot_id uuid not null references public.bookkit_snapshots(snapshot_id) on delete cascade,
 path text not null,
 manifest jsonb not null,
 primary key(snapshot_id,path)
);
alter table public.bookkit_snapshot_assets enable row level security;
create policy snapshot_assets_read on public.bookkit_snapshot_assets for select to authenticated using(exists(select 1 from public.bookkit_snapshots s where s.snapshot_id=bookkit_snapshot_assets.snapshot_id and public.has_project_access(s.project_id,'viewer')));
revoke insert,update,delete on public.bookkit_snapshot_assets from anon,authenticated;
create trigger serialize_bookkit_assets before insert or update or delete on public.bookkit_assets
 for each statement execute function public.lock_bookkit_documents();

create or replace function public.capture_bookkit_snapshot(p_project_id uuid,p_message text) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'editor') then raise exception 'Insufficient snapshot access'; end if;
 if not exists(select 1 from public.projects where id=p_project_id and bookkit_slug is not null) then raise exception 'Not a Bookkit project'; end if;
 perform pg_advisory_xact_lock(78210613);
 insert into public.snapshots(project_id,author_id,message,word_count,project_state)
 values(p_project_id,auth.uid(),p_message,0,jsonb_build_object('bookkit',2)) returning id into sid;
 insert into public.bookkit_snapshots(snapshot_id,project_id,document_count,asset_count,import_complete)
 select sid,p_project_id,(select count(*) from public.bookkit_documents where project_id=p_project_id),(select count(*) from public.bookkit_assets where project_id=p_project_id),bookkit_import_complete from public.projects where id=p_project_id;
 insert into public.bookkit_snapshot_files(snapshot_id,revision_id,unix_mode)
 select sid,d.revision_id,d.unix_mode from public.bookkit_documents d where d.project_id=p_project_id;
 insert into public.bookkit_snapshot_assets(snapshot_id,path,manifest)
 select sid,a.path,to_jsonb(a)-'created_at'-'project_id' from public.bookkit_assets a where a.project_id=p_project_id;
 return sid;
end;
$$;

create or replace function public.restore_bookkit_snapshot(p_project_id uuid,p_snapshot_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare safety uuid; expected integer; expected_assets integer; complete boolean;
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'editor') then raise exception 'Insufficient restore access'; end if;
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

create or replace function public.diff_bookkit_snapshot(p_project_id uuid,p_snapshot_id uuid,p_other_id uuid default null,p_offset integer default 0)
returns table(path text,before_text text,after_text text)
language plpgsql security definer set search_path='' as $$
declare compare_assets boolean;
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'viewer') then raise exception 'Insufficient snapshot access'; end if;
 if not exists(select 1 from public.bookkit_snapshots where snapshot_id=p_snapshot_id and project_id=p_project_id) or (p_other_id is not null and not exists(select 1 from public.bookkit_snapshots where snapshot_id=p_other_id and project_id=p_project_id)) then raise exception 'Bookkit snapshot not found for project'; end if;
 select asset_count is not null into compare_assets from public.bookkit_snapshots where snapshot_id=p_snapshot_id;
 if p_other_id is not null then compare_assets:=compare_assets and (select asset_count is not null from public.bookkit_snapshots where snapshot_id=p_other_id); end if;
 return query with a as (
  select r.path,r.content,r.id as revision_id,f.unix_mode from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id where f.snapshot_id=p_snapshot_id
 ), b as (
  select d.path,d.content,d.revision_id,d.unix_mode from public.bookkit_documents d where p_other_id is null and d.project_id=p_project_id
  union all
  select r.path,r.content,r.id,f.unix_mode from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id where p_other_id is not null and f.snapshot_id=p_other_id
 ), aa as (
  select f.path,f.manifest from public.bookkit_snapshot_assets f where f.snapshot_id=p_snapshot_id and compare_assets
 ), ba as (
  select a.path,to_jsonb(a)-'created_at'-'project_id' as manifest from public.bookkit_assets a where a.project_id=p_project_id and p_other_id is null and compare_assets
  union all
  select f.path,f.manifest from public.bookkit_snapshot_assets f where f.snapshot_id=p_other_id and p_other_id is not null and compare_assets
 ), changes as (
  select coalesce(a.path,b.path) as file_path,
   case when a.revision_id=b.revision_id and a.unix_mode is distinct from b.unix_mode then 'File permissions: '||a.unix_mode::text else a.content end as before_content,
   case when a.revision_id=b.revision_id and a.unix_mode is distinct from b.unix_mode then 'File permissions: '||b.unix_mode::text else b.content end as after_content
  from a full join b on a.path=b.path where a.revision_id is distinct from b.revision_id or (a.unix_mode is not null and b.unix_mode is not null and a.unix_mode is distinct from b.unix_mode)
  union all
  select coalesce(aa.path,ba.path),case when aa.manifest is not null then jsonb_pretty(aa.manifest-'chunks') end,case when ba.manifest is not null then jsonb_pretty(ba.manifest-'chunks') end
  from aa full join ba on aa.path=ba.path where aa.manifest is distinct from ba.manifest
 ) select file_path,before_content,after_content from changes order by file_path offset greatest(0,p_offset) limit 50;
end;
$$;

-- A saved attachment must remain downloadable for current books and snapshots.
create function public.bookkit_chunk_referenced(p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bookkit_assets a cross join lateral jsonb_array_elements(a.chunks) c where a.project_id::text=split_part(p_key,'/',1) and c->>'sha256'=split_part(p_key,'/',2))
 or exists(select 1 from public.bookkit_snapshot_assets a join public.bookkit_snapshots s using(snapshot_id) cross join lateral jsonb_array_elements(a.manifest->'chunks') c where s.project_id::text=split_part(p_key,'/',1) and c->>'sha256'=split_part(p_key,'/',2));
$$;
revoke all on function public.bookkit_chunk_referenced(text) from public,anon;
grant execute on function public.bookkit_chunk_referenced(text) to authenticated;
drop policy bookkit_storage_owner_delete on storage.objects;
create policy bookkit_storage_owner_delete on storage.objects for delete to authenticated
 using(bucket_id='bookkit-assets' and exists(select 1 from public.projects p where p.id::text=split_part(storage.objects.name,'/',1) and p.owner_id=auth.uid()) and not public.bookkit_chunk_referenced(storage.objects.name));
