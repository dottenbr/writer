create function public.refresh_bookkit_sources(p_project_id uuid,p_files jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare f jsonb; expected bigint; actual bigint; n integer:=0;
begin
 if auth.uid() is null or not exists(select 1 from public.projects where id=p_project_id and owner_id=auth.uid()) then raise exception 'Owner access required'; end if;
 if jsonb_typeof(p_files)<>'array' then raise exception 'Expected source files'; end if;
 perform pg_advisory_xact_lock(78210613);
 if jsonb_array_length(p_files)=0 then return 0; end if;
 perform public.capture_bookkit_snapshot(p_project_id,'Before source refresh');
 for f in select value from jsonb_array_elements(p_files) loop
  if encode(sha256(convert_to(f->>'content','UTF8')),'hex')<>f->>'source_sha256' then raise exception 'Source checksum mismatch'; end if;
  expected:=(f->>'version')::bigint;
  if expected is null then
   insert into public.bookkit_documents(project_id,path,content,source_sha256,unix_mode) values(p_project_id,f->>'path',f->>'content',f->>'source_sha256',(f->>'unix_mode')::integer);
  else
   update public.bookkit_documents d set content=f->>'content',source_sha256=f->>'source_sha256',unix_mode=(f->>'unix_mode')::integer
   where d.project_id=p_project_id and d.path=f->>'path' and d.version=expected and exists(select 1 from public.bookkit_revisions r where r.id=d.revision_id and r.content_hash=d.source_sha256);
   get diagnostics actual=row_count;
   if actual<>1 then raise exception 'Cloud edits conflict with source refresh: %',f->>'path'; end if;
  end if;
  n:=n+1;
 end loop;
 return n;
end;
$$;
revoke all on function public.refresh_bookkit_sources(uuid,jsonb) from public,anon;
grant execute on function public.refresh_bookkit_sources(uuid,jsonb) to authenticated;
