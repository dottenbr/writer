create or replace function public.emit_bookkit_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb; file_path text;
begin
 rowdata:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 file_path:=rowdata->>'path';
 if TG_TABLE_NAME='bookkit_messages' then select path into file_path from public.bookkit_threads where id=(rowdata->>'thread_id')::uuid; end if;
 if file_path is not null and exists(select 1 from public.projects where id=(rowdata->>'project_id')::uuid) then insert into public.bookkit_activity(project_id,path,kind,entity_id) values((rowdata->>'project_id')::uuid,file_path,TG_TABLE_NAME,coalesce(rowdata->>'id',file_path)); end if;
 return null;
end;
$$;
create or replace function public.reply_bookkit_thread(p_thread_id uuid,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.bookkit_threads; mid uuid;
begin
 select * into t from public.bookkit_threads where id=p_thread_id for update;
 if not found or auth.uid() is null or not public.has_project_access(t.project_id,'viewer') then raise exception 'Book access required'; end if;
 if t.resolved_at is not null then raise exception 'Reopen the conversation before replying'; end if;
 insert into public.bookkit_messages(project_id,thread_id,author_id,body) values(t.project_id,t.id,auth.uid(),p_body) returning id into mid;
 return mid;
end;
$$;
