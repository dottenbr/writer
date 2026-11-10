-- One MVCC read fixes the exported file versions even if collaborators keep
-- editing while the ZIP is downloading. Revisions and storage chunks persist.
create function public.bookkit_export_manifest(p_project_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('complete',p.bookkit_import_complete,'files',coalesce((
  select jsonb_agg(f.item order by f.path) from (
   select d.path,jsonb_build_object('path',d.path,'size_bytes',octet_length(d.content),'unix_mode',d.unix_mode,'revision_id',d.revision_id) item from public.bookkit_documents d where d.project_id=p.id
   union all
   select a.path,jsonb_build_object('path',a.path,'size_bytes',a.size_bytes,'unix_mode',a.unix_mode,'sha256',a.sha256,'chunks',a.chunks) item from public.bookkit_assets a where a.project_id=p.id
  ) f
 ),'[]'::jsonb)) from public.projects p where p.id=p_project_id;
$$;
revoke all on function public.bookkit_export_manifest(uuid) from public,anon;
grant execute on function public.bookkit_export_manifest(uuid) to authenticated;
