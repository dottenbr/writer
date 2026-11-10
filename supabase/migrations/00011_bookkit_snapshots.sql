-- Monotonic versions prevent old clients from overwriting a file restored after
-- deletion. Serialize document mutations and snapshot operations before any row
-- locks are acquired (the statement trigger avoids row/parent lock inversion).
create sequence public.bookkit_document_version_seq;
select setval('public.bookkit_document_version_seq', greatest(1,(select coalesce(max(version),0)+1 from public.bookkit_documents)),false);
alter table public.bookkit_documents alter column version type bigint;
alter table public.bookkit_documents alter column version set default nextval('public.bookkit_document_version_seq');
grant usage on sequence public.bookkit_document_version_seq to authenticated,service_role;
create or replace function public.bump_bookkit_version() returns trigger language plpgsql set search_path='' as $$
begin new.version=nextval('public.bookkit_document_version_seq'); return new; end;
$$;
create function public.lock_bookkit_documents() returns trigger language plpgsql set search_path='' as $$
begin perform pg_advisory_xact_lock(78210613); return null; end;
$$;
create trigger serialize_bookkit_documents before insert or update or delete on public.bookkit_documents
 for each statement execute function public.lock_bookkit_documents();

create table public.bookkit_revisions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 path text not null,
 content text not null,
 content_hash text not null,
 source_sha256 text not null,
 unique(project_id,path,content_hash,source_sha256)
);
create table public.bookkit_snapshots (
 snapshot_id uuid primary key references public.snapshots(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 document_count integer not null
);
create table public.bookkit_snapshot_files (
 snapshot_id uuid not null references public.bookkit_snapshots(snapshot_id) on delete cascade,
 revision_id uuid not null references public.bookkit_revisions(id) on delete cascade,
 primary key(snapshot_id,revision_id)
);
alter table public.bookkit_revisions enable row level security;
alter table public.bookkit_snapshots enable row level security;
alter table public.bookkit_snapshot_files enable row level security;
create policy revisions_read on public.bookkit_revisions for select to authenticated using(public.has_project_access(project_id,'viewer'));
create policy bookkit_snapshots_read on public.bookkit_snapshots for select to authenticated using(public.has_project_access(project_id,'viewer'));
create policy snapshot_files_read on public.bookkit_snapshot_files for select to authenticated using(exists(select 1 from public.bookkit_snapshots s where s.snapshot_id=bookkit_snapshot_files.snapshot_id and public.has_project_access(s.project_id,'viewer')));
-- Snapshot manifests and revisions are immutable to clients; only RPCs write.
revoke insert,update,delete on public.bookkit_revisions,public.bookkit_snapshots,public.bookkit_snapshot_files from anon,authenticated;

create function public.capture_bookkit_snapshot(p_project_id uuid,p_message text) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid; n integer;
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'editor') then raise exception 'Insufficient snapshot access'; end if;
 if not exists(select 1 from public.projects where id=p_project_id and bookkit_slug is not null) then raise exception 'Not a Bookkit project'; end if;
 perform pg_advisory_xact_lock(78210613);
 select count(*) into n from public.bookkit_documents where project_id=p_project_id;
 insert into public.snapshots(project_id,author_id,message,word_count,project_state)
 values(p_project_id,auth.uid(),p_message,0,jsonb_build_object('bookkit',1)) returning id into sid;
 insert into public.bookkit_revisions(project_id,path,content,content_hash,source_sha256)
 select project_id,path,content,encode(sha256(convert_to(content,'UTF8')),'hex'),source_sha256 from public.bookkit_documents where project_id=p_project_id
 on conflict(project_id,path,content_hash,source_sha256) do nothing;
 insert into public.bookkit_snapshots values(sid,p_project_id,n);
 insert into public.bookkit_snapshot_files(snapshot_id,revision_id)
 select sid,r.id from public.bookkit_documents d join public.bookkit_revisions r on r.project_id=d.project_id and r.path=d.path and r.source_sha256=d.source_sha256 and r.content_hash=encode(sha256(convert_to(d.content,'UTF8')),'hex') where d.project_id=p_project_id;
 return sid;
end;
$$;

create function public.restore_bookkit_snapshot(p_project_id uuid,p_snapshot_id uuid) returns uuid
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
 select p_project_id,r.path,r.content,r.source_sha256 from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id where f.snapshot_id=p_snapshot_id
 on conflict(project_id,path) do update set content=excluded.content,source_sha256=excluded.source_sha256;
 return safety;
end;
$$;

create function public.diff_bookkit_snapshot(p_project_id uuid,p_snapshot_id uuid,p_other_id uuid default null,p_offset integer default 0)
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
 ) select coalesce(a.path,b.path),coalesce(a.content,''),coalesce(b.content,'') from a full join b on a.path=b.path where a.content is distinct from b.content order by 1 offset greatest(0,p_offset) limit 50;
end;
$$;
revoke all on function public.capture_bookkit_snapshot(uuid,text),public.restore_bookkit_snapshot(uuid,uuid),public.diff_bookkit_snapshot(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.capture_bookkit_snapshot(uuid,text),public.restore_bookkit_snapshot(uuid,uuid),public.diff_bookkit_snapshot(uuid,uuid,uuid,integer) to authenticated;
