-- Store immutable revisions when files change; capturing a snapshot must only
-- copy pointers, even for books with tens of megabytes of OCR research.
alter table public.bookkit_documents add column revision_id uuid references public.bookkit_revisions(id);
insert into public.bookkit_revisions(project_id,path,content,content_hash,source_sha256)
 select project_id,path,content,encode(sha256(convert_to(content,'UTF8')),'hex'),source_sha256 from public.bookkit_documents
 on conflict(project_id,path,content_hash,source_sha256) do nothing;
update public.bookkit_documents d set revision_id=r.id from public.bookkit_revisions r
 where r.project_id=d.project_id and r.path=d.path and r.source_sha256=d.source_sha256 and r.content_hash=encode(sha256(convert_to(d.content,'UTF8')),'hex');
alter table public.bookkit_documents alter column revision_id set not null;
create function public.record_bookkit_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare hash text;
begin
 if TG_OP='UPDATE' then
  if new.project_id=old.project_id and new.path=old.path and new.content=old.content and new.source_sha256=old.source_sha256 then new.revision_id=old.revision_id; return new; end if;
 end if;
 hash:=encode(sha256(convert_to(new.content,'UTF8')),'hex');
 insert into public.bookkit_revisions(project_id,path,content,content_hash,source_sha256)
 values(new.project_id,new.path,new.content,hash,new.source_sha256) on conflict(project_id,path,content_hash,source_sha256) do nothing;
 select id into new.revision_id from public.bookkit_revisions where project_id=new.project_id and path=new.path and content_hash=hash and source_sha256=new.source_sha256;
 return new;
end;
$$;
create trigger record_bookkit_revision before insert or update on public.bookkit_documents for each row execute function public.record_bookkit_revision();

create or replace function public.capture_bookkit_snapshot(p_project_id uuid,p_message text) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid; n integer;
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'editor') then raise exception 'Insufficient snapshot access'; end if;
 if not exists(select 1 from public.projects where id=p_project_id and bookkit_slug is not null) then raise exception 'Not a Bookkit project'; end if;
 perform pg_advisory_xact_lock(78210613);
 select count(*) into n from public.bookkit_documents where project_id=p_project_id;
 insert into public.snapshots(project_id,author_id,message,word_count,project_state)
 values(p_project_id,auth.uid(),p_message,0,jsonb_build_object('bookkit',1)) returning id into sid;
 insert into public.bookkit_snapshots values(sid,p_project_id,n);
 insert into public.bookkit_snapshot_files(snapshot_id,revision_id)
 select sid,d.revision_id from public.bookkit_documents d where d.project_id=p_project_id;
 return sid;
end;
$$;


-- Preserve NULL for absent files so adding or removing an empty file is visible.
create or replace function public.diff_bookkit_snapshot(p_project_id uuid,p_snapshot_id uuid,p_other_id uuid default null,p_offset integer default 0)
returns table(path text,before_text text,after_text text)
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'viewer') then raise exception 'Insufficient snapshot access'; end if;
 if not exists(select 1 from public.bookkit_snapshots where snapshot_id=p_snapshot_id and project_id=p_project_id) or (p_other_id is not null and not exists(select 1 from public.bookkit_snapshots where snapshot_id=p_other_id and project_id=p_project_id)) then raise exception 'Bookkit snapshot not found for project'; end if;
 return query with a as (
  select r.path,r.content,r.id as revision_id from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id where f.snapshot_id=p_snapshot_id
 ), b as (
  select d.path,d.content,d.revision_id from public.bookkit_documents d where p_other_id is null and d.project_id=p_project_id
  union all
  select r.path,r.content,r.id as revision_id from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id=f.revision_id where p_other_id is not null and f.snapshot_id=p_other_id
 ) select coalesce(a.path,b.path),a.content,b.content from a full join b on a.path=b.path where a.revision_id is distinct from b.revision_id order by 1 offset greatest(0,p_offset) limit 50;
end;
$$;
