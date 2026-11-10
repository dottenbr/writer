-- Durable review conversations and tracked proposals for every Bookkit path.
create table public.bookkit_suggestions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 path text not null,
 author_id uuid not null references public.profiles(id),
 base_revision_id uuid not null references public.bookkit_revisions(id),
 proposed_content text not null,
 version bigint not null default 1,
 status text not null default 'pending' check(status in ('pending','accepted','rejected','withdrawn')),
 resolved_by uuid references public.profiles(id),
 resolved_at timestamptz,
 accepted_revision_id uuid references public.bookkit_revisions(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index bookkit_pending_suggestion on public.bookkit_suggestions(project_id,path,author_id) where status='pending';
create table public.bookkit_threads (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 path text not null,
 author_id uuid not null references public.profiles(id),
 suggestion_id uuid references public.bookkit_suggestions(id) on delete cascade,
 quoted_text text not null default '',
 anchor_start integer,
 anchor_revision_id uuid references public.bookkit_revisions(id),
 resolved_at timestamptz,
 resolved_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.bookkit_messages (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 thread_id uuid not null references public.bookkit_threads(id) on delete cascade,
 author_id uuid not null references public.profiles(id),
 body text not null check(length(btrim(body)) between 1 and 20000),
 created_at timestamptz not null default now()
);
create index bookkit_threads_path on public.bookkit_threads(project_id,path);
create index bookkit_messages_thread on public.bookkit_messages(thread_id,created_at);
create table public.bookkit_activity (
 id bigint generated always as identity primary key,
 project_id uuid not null references public.projects(id) on delete cascade,
 path text not null,
 kind text not null,
 entity_id text,
 created_at timestamptz not null default now()
);
create index bookkit_activity_project on public.bookkit_activity(project_id,id);
alter table public.bookkit_suggestions enable row level security;
alter table public.bookkit_threads enable row level security;
alter table public.bookkit_messages enable row level security;
alter table public.bookkit_activity enable row level security;
create policy suggestions_read on public.bookkit_suggestions for select to authenticated using(public.has_project_access(project_id,'viewer'));
create policy threads_read on public.bookkit_threads for select to authenticated using(public.has_project_access(project_id,'viewer'));
create policy messages_read on public.bookkit_messages for select to authenticated using(public.has_project_access(project_id,'viewer'));
create policy activity_read on public.bookkit_activity for select to authenticated using(public.has_project_access(project_id,'viewer'));
revoke insert,update,delete on public.bookkit_suggestions,public.bookkit_threads,public.bookkit_messages,public.bookkit_activity from anon,authenticated;

create function public.emit_bookkit_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare rowdata jsonb; file_path text;
begin
 rowdata:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 file_path:=rowdata->>'path';
 if TG_TABLE_NAME='bookkit_messages' then select path into file_path from public.bookkit_threads where id=(rowdata->>'thread_id')::uuid; end if;
 if file_path is not null then insert into public.bookkit_activity(project_id,path,kind,entity_id) values((rowdata->>'project_id')::uuid,file_path,TG_TABLE_NAME,coalesce(rowdata->>'id',file_path)); end if;
 return null;
end;
$$;
create trigger bookkit_document_activity after insert or update or delete on public.bookkit_documents for each row execute function public.emit_bookkit_activity();
create trigger bookkit_suggestion_activity after insert or update on public.bookkit_suggestions for each row execute function public.emit_bookkit_activity();
create trigger bookkit_thread_activity after insert or update on public.bookkit_threads for each row execute function public.emit_bookkit_activity();
create trigger bookkit_message_activity after insert on public.bookkit_messages for each row execute function public.emit_bookkit_activity();
alter publication supabase_realtime add table public.bookkit_activity;

create function public.save_bookkit_suggestion(p_project_id uuid,p_path text,p_base_revision_id uuid,p_content text,p_suggestion_id uuid default null,p_expected_version bigint default null) returns public.bookkit_suggestions
language plpgsql security definer set search_path='' as $$
declare result public.bookkit_suggestions;
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'editor') then raise exception 'Editing access required'; end if;
 if not exists(select 1 from public.bookkit_revisions where id=p_base_revision_id and project_id=p_project_id and path=p_path) then raise exception 'Invalid base revision'; end if;
 if not exists(select 1 from public.bookkit_documents where project_id=p_project_id and path=p_path) then raise exception 'Document no longer exists'; end if;
 if p_suggestion_id is null then
  insert into public.bookkit_suggestions(project_id,path,author_id,base_revision_id,proposed_content) values(p_project_id,p_path,auth.uid(),p_base_revision_id,p_content) returning * into result;
 else
  update public.bookkit_suggestions set proposed_content=p_content,version=version+1,updated_at=now()
  where id=p_suggestion_id and project_id=p_project_id and path=p_path and author_id=auth.uid() and status='pending' and version=p_expected_version and base_revision_id=p_base_revision_id returning * into result;
  if not found then raise exception 'Suggestion changed in another session or was reviewed. Reload before editing.'; end if;
 end if;
 return result;
end;
$$;
create function public.decide_bookkit_suggestion(p_suggestion_id uuid,p_decision text,p_expected_version bigint,p_document_version bigint default null,p_merged_content text default null) returns void
language plpgsql security definer set search_path='' as $$
declare s public.bookkit_suggestions; revision uuid;
begin
 -- Same advisory lock order as document mutations/snapshot restore.
 perform pg_advisory_xact_lock(78210613);
 select * into s from public.bookkit_suggestions where id=p_suggestion_id for update;
 if not found or auth.uid() is null or not public.has_project_access(s.project_id,'owner') then raise exception 'Only the author can accept or reject edits'; end if;
 if p_decision not in ('accepted','rejected') then raise exception 'Invalid review decision'; end if;
 if s.status<>'pending' or s.version<>p_expected_version then raise exception 'Suggestion changed. Review the latest version before deciding.'; end if;
 if p_decision='accepted' then
  if p_merged_content is null then raise exception 'Accepted content is required'; end if;
  update public.bookkit_documents set content=p_merged_content where project_id=s.project_id and path=s.path and version=p_document_version returning revision_id into revision;
  if not found then raise exception 'Document changed. Review the latest text before accepting.'; end if;
 end if;
 update public.bookkit_suggestions set status=p_decision,resolved_by=auth.uid(),resolved_at=now(),updated_at=now(),version=version+1,accepted_revision_id=revision where id=s.id;
end;
$$;
create function public.create_bookkit_thread(p_project_id uuid,p_path text,p_body text,p_quote text default '',p_anchor_start integer default null,p_anchor_revision_id uuid default null,p_suggestion_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 if auth.uid() is null or not public.has_project_access(p_project_id,'viewer') then raise exception 'Book access required'; end if;
 if not exists(select 1 from public.bookkit_documents where project_id=p_project_id and path=p_path) and not exists(select 1 from public.bookkit_assets where project_id=p_project_id and path=p_path) then raise exception 'File not found'; end if;
 if length(p_quote)>20000 or p_anchor_start<0 then raise exception 'Invalid comment anchor'; end if;
 if p_anchor_revision_id is not null and not exists(select 1 from public.bookkit_revisions where id=p_anchor_revision_id and project_id=p_project_id and path=p_path) then raise exception 'Invalid anchor revision'; end if;
 if p_suggestion_id is not null and not exists(select 1 from public.bookkit_suggestions where id=p_suggestion_id and project_id=p_project_id and path=p_path) then raise exception 'Invalid suggestion'; end if;
 insert into public.bookkit_threads(project_id,path,author_id,suggestion_id,quoted_text,anchor_start,anchor_revision_id) values(p_project_id,p_path,auth.uid(),p_suggestion_id,coalesce(p_quote,''),p_anchor_start,p_anchor_revision_id) returning id into tid;
 insert into public.bookkit_messages(project_id,thread_id,author_id,body) values(p_project_id,tid,auth.uid(),p_body);
 return tid;
end;
$$;
create function public.reply_bookkit_thread(p_thread_id uuid,p_body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.bookkit_threads; mid uuid;
begin
 select * into t from public.bookkit_threads where id=p_thread_id;
 if not found or auth.uid() is null or not public.has_project_access(t.project_id,'viewer') then raise exception 'Book access required'; end if;
 if t.resolved_at is not null then raise exception 'Reopen the conversation before replying'; end if;
 insert into public.bookkit_messages(project_id,thread_id,author_id,body) values(t.project_id,t.id,auth.uid(),p_body) returning id into mid;
 return mid;
end;
$$;
create function public.resolve_bookkit_thread(p_thread_id uuid,p_resolved boolean) returns void
language plpgsql security definer set search_path='' as $$
declare t public.bookkit_threads;
begin
 select * into t from public.bookkit_threads where id=p_thread_id for update;
 if not found or auth.uid() is null or not public.has_project_access(t.project_id,'viewer') or (t.author_id<>auth.uid() and not public.has_project_access(t.project_id,'owner')) then raise exception 'Only the author or thread creator can resolve this conversation'; end if;
 update public.bookkit_threads set resolved_at=case when p_resolved then now() else null end,resolved_by=case when p_resolved then auth.uid() else null end where id=t.id;
end;
$$;
revoke all on function public.save_bookkit_suggestion(uuid,text,uuid,text,uuid,bigint),public.decide_bookkit_suggestion(uuid,text,bigint,bigint,text),public.create_bookkit_thread(uuid,text,text,text,integer,uuid,uuid),public.reply_bookkit_thread(uuid,text),public.resolve_bookkit_thread(uuid,boolean) from public,anon;
grant execute on function public.save_bookkit_suggestion(uuid,text,uuid,text,uuid,bigint),public.decide_bookkit_suggestion(uuid,text,bigint,bigint,text),public.create_bookkit_thread(uuid,text,text,text,integer,uuid,uuid),public.reply_bookkit_thread(uuid,text),public.resolve_bookkit_thread(uuid,boolean) to authenticated;
