create or replace function public.save_bookkit_suggestion(p_project_id uuid,p_path text,p_base_revision_id uuid,p_content text,p_suggestion_id uuid default null,p_expected_version bigint default null) returns public.bookkit_suggestions
language plpgsql security definer set search_path='' as $$
declare result public.bookkit_suggestions;
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'editor') then raise exception 'Editing access required'; end if;
 if not exists(select 1 from public.bookkit_revisions where id=p_base_revision_id and project_id=p_project_id and path=p_path) then raise exception 'Invalid base revision'; end if;
 if not exists(select 1 from public.bookkit_documents where project_id=p_project_id and path=p_path) then raise exception 'Document no longer exists'; end if;
 if p_suggestion_id is null then
  insert into public.bookkit_suggestions(project_id,path,author_id,base_revision_id,proposed_content) values(p_project_id,p_path,auth.uid(),p_base_revision_id,p_content) returning * into result;
 else
  update public.bookkit_suggestions set proposed_content=p_content,base_revision_id=p_base_revision_id,version=version+1,updated_at=now()
  where id=p_suggestion_id and project_id=p_project_id and path=p_path and author_id=auth.uid() and status='pending' and version=p_expected_version returning * into result;
  if not found then raise exception 'Suggestion changed in another session or was reviewed. Reload before editing.'; end if;
 end if;
 return result;
end;
$$;
