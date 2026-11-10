-- 00037_workspace_speed_and_word_count.sql
-- 1. Fix bookkit_word_count so internal hyphens (e.g. "mother-in-law") stay one word
--    and CRLF front matter is stripped identically to the client's splitDocument/countWords.
-- 2. Maintain a stored `word_count` column on `bookkit_documents` so `bookkit_workspace()`
--    reads integer word counts directly instead of decompressing TOASTed chapter prose
--    and running regexes on every Workspace page load (420 ms -> < 10 ms).
-- 3. Skip activity inflation when restoring a snapshot (`app.skip_activity = 'on'`).

create or replace function public.bookkit_word_count(t text) returns integer
language sql immutable parallel safe as $$
  select coalesce(
    (select count(*)::integer
     from regexp_matches(
       regexp_replace(
         regexp_replace(
           coalesce(t, ''),
           '^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)',
           ''
         ),
         '^#{1,6}\s+.*$',
         '',
         'gn'
       ),
       '[[:alnum:]][[:alnum:]''’\-]*',
       'g'
     )),
    0
  )
$$;

alter table public.bookkit_documents
  add column if not exists word_count integer not null default 0;

update public.bookkit_documents
set word_count = public.bookkit_word_count(content)
where path ~ '^(manuscript|draft)/.*\.md$';

create or replace function public.bookkit_set_document_word_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.path ~ '^(manuscript|draft)/.*\.md$' then
    if tg_op = 'INSERT' or new.content is distinct from old.content or new.path is distinct from old.path then
      new.word_count := public.bookkit_word_count(new.content);
    end if;
  else
    new.word_count := 0;
  end if;
  return new;
end $$;

drop trigger if exists bookkit_documents_word_count on public.bookkit_documents;
create trigger bookkit_documents_word_count
  before insert or update of content, path on public.bookkit_documents
  for each row execute function public.bookkit_set_document_word_count();

create or replace function public.bookkit_track_documents() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p uuid := coalesce(new.project_id, old.project_id);
  path text := coalesce(new.path, old.path);
  delta integer;
begin
  if auth.uid() is null or current_setting('app.skip_activity', true) = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return null;
  end if;
  if path ~ '^manuscript/.*\.md$' then
    delta := coalesce(case when tg_op = 'DELETE' then 0 else new.word_count end, 0)
           - coalesce(case when tg_op = 'INSERT' then 0 else old.word_count end, 0);
    perform public.bookkit_note_activity(p, greatest(delta, 0), greatest(-delta, 0), case when delta <> 0 then path end, null, 0, 0);
  elsif path ~ '^(bible|outline|craft|research)/.*\.md$' then
    perform public.bookkit_note_activity(p, 0, 0, null, path, 0, 0);
  end if;
  return null;
end $$;

create or replace function public.restore_bookkit_snapshot(p_project_id uuid, p_snapshot_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare safety uuid; expected integer; expected_assets integer; complete boolean;
begin
  if auth.uid() is null or not public.has_project_access(p_project_id, 'owner') then raise exception 'Insufficient restore access'; end if;
  perform pg_advisory_xact_lock(78210613);
  select document_count, asset_count, import_complete into expected, expected_assets, complete from public.bookkit_snapshots where snapshot_id = p_snapshot_id and project_id = p_project_id;
  if not found then raise exception 'Bookkit snapshot not found for project'; end if;
  if expected <> (select count(*) from public.bookkit_snapshot_files where snapshot_id = p_snapshot_id) or (expected_assets is not null and expected_assets <> (select count(*) from public.bookkit_snapshot_assets where snapshot_id = p_snapshot_id)) then raise exception 'Incomplete snapshot'; end if;
  safety := public.capture_bookkit_snapshot(p_project_id, 'Auto-snapshot before restore');
  perform set_config('app.skip_activity', 'on', true);
  delete from public.bookkit_documents d where d.project_id = p_project_id and not exists (select 1 from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id = f.revision_id where f.snapshot_id = p_snapshot_id and r.path = d.path);
  insert into public.bookkit_documents(project_id, path, content, source_sha256, unix_mode)
  select p_project_id, r.path, r.content, r.source_sha256, coalesce(f.unix_mode, current.unix_mode, 33188)
  from public.bookkit_snapshot_files f join public.bookkit_revisions r on r.id = f.revision_id left join public.bookkit_documents current on current.project_id = p_project_id and current.path = r.path
  where f.snapshot_id = p_snapshot_id and (current.revision_id is distinct from r.id or (f.unix_mode is not null and current.unix_mode is distinct from f.unix_mode))
  on conflict(project_id, path) do update set content = excluded.content, source_sha256 = excluded.source_sha256, unix_mode = excluded.unix_mode;
  if expected_assets is not null then
    delete from public.bookkit_assets a where a.project_id = p_project_id and not exists (select 1 from public.bookkit_snapshot_assets f where f.snapshot_id = p_snapshot_id and f.path = a.path);
    insert into public.bookkit_assets(project_id, path, size_bytes, sha256, unix_mode, chunks, is_directory)
    select p_project_id, f.path, (f.manifest->>'size_bytes')::bigint, f.manifest->>'sha256', (f.manifest->>'unix_mode')::integer, f.manifest->'chunks', (f.manifest->>'is_directory')::boolean from public.bookkit_snapshot_assets f where f.snapshot_id = p_snapshot_id
    on conflict(project_id, path) do update set size_bytes = excluded.size_bytes, sha256 = excluded.sha256, unix_mode = excluded.unix_mode, chunks = excluded.chunks, is_directory = excluded.is_directory;
    update public.projects set bookkit_import_complete = complete where id = p_project_id;
  end if;
  return safety;
end;
$$;

create or replace function public.bookkit_workspace(p_days integer default 84)
returns table (
  project_id uuid, name text, role text, owner_name text, is_bookkit boolean,
  created_at timestamptz, last_worked_at timestamptz, last_worked_by text,
  author_words integer, draft_words integer, chapters_total integer, chapters_written integer,
  target_words integer, activity jsonb, library_id uuid, shelf_id uuid, private boolean
)
language sql stable security invoker set search_path = public as $$
  with mine as (
    select p.id, p.name, p.owner_id, p.created_at, p.bookkit_slug, p.brief_target_word_count, p.library_id, p.shelf_id, p.private,
           case when p.owner_id = auth.uid() then 'owner'
                else coalesce((select m.role::text from project_members m where m.project_id = p.id and m.user_id = auth.uid() and m.accepted_at is not null),
                              case when p.library_id is not null and not p.private then nullif(public.library_role(p.library_id), 'owner') end,
                              case when p.library_id is not null and not p.private and public.library_role(p.library_id) = 'owner' then 'coauthor' end,
                              'viewer') end as role
    from projects p
    where public.has_project_access(p.id, 'viewer')
  ), docs as (
    select d.project_id,
           sum(d.word_count) filter (where d.path ~ '^manuscript/.*\.md$')::integer as author_words,
           sum(d.word_count) filter (where d.path ~ '^draft/.*\.md$')::integer as draft_words,
           count(distinct regexp_replace(d.path, '^.*/', '')) filter (where d.path ~ '^(manuscript|draft)/(.*/)?\d+[^/]*\.md$')::integer as chapters_total,
           count(*) filter (where d.path ~ '^manuscript/(.*/)?\d+[^/]*\.md$' and d.word_count > 0)::integer as chapters_written,
           max(d.updated_at) as last_saved
    from bookkit_documents d join mine on mine.id = d.project_id
    group by d.project_id
  )
  select m.id, m.name, m.role, coalesce(nullif(o.display_name, ''), o.email), m.bookkit_slug is not null,
         m.created_at,
         greatest(docs.last_saved, (select max(a.last_at) from bookkit_daily_activity a where a.project_id = m.id)),
         (select coalesce(nullif(u.display_name, ''), u.email) from bookkit_daily_activity a join profiles u on u.id = a.last_user where a.project_id = m.id order by a.day desc limit 1),
         coalesce(docs.author_words, 0), coalesce(docs.draft_words, 0), coalesce(docs.chapters_total, 0), coalesce(docs.chapters_written, 0),
         m.brief_target_word_count,
         coalesce((select jsonb_agg(jsonb_build_object(
                     'day', a.day,
                     'words_added', a.words_added,
                     'words_removed', a.words_removed,
                     'chapters', a.chapters,
                     'pages', a.pages,
                     'comments', a.comments,
                     'suggestions', a.suggestions
                   ) order by a.day)
                   from bookkit_daily_activity a where a.project_id = m.id and a.day > current_date - p_days), '[]'::jsonb),
         m.library_id, m.shelf_id, m.private
  from mine m
  left join docs on docs.project_id = m.id
  left join profiles o on o.id = m.owner_id
  order by 7 desc nulls last
$$;
grant execute on function public.bookkit_workspace(integer) to authenticated;
