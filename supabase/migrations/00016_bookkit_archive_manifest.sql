alter table public.projects add column bookkit_import_complete boolean not null default false;
create function public.bookkit_text_manifest(p_project_id uuid)
returns table(path text,size_bytes bigint,unix_mode integer,revision_id uuid)
language sql stable security invoker set search_path='' as $$
 select d.path,octet_length(d.content)::bigint,d.unix_mode,d.revision_id from public.bookkit_documents d where d.project_id=p_project_id order by d.path;
$$;
revoke all on function public.bookkit_text_manifest(uuid) from public,anon;
grant execute on function public.bookkit_text_manifest(uuid) to authenticated;
