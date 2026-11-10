-- Activity that means something: words written and removed in the manuscript,
-- chapters and book pages changed, comments and suggestions. Saves are not
-- activity (autosave fires every second of typing), and neither are changes
-- made by scripts or imports (no signed-in person). The old table counted
-- saves and imported files, so it starts over.

drop trigger if exists bookkit_track_activity on public.bookkit_documents;
drop function if exists public.bookkit_track_activity();
drop function if exists public.bookkit_workspace(integer);
drop table if exists public.bookkit_daily_activity;

create table public.bookkit_daily_activity (
  project_id uuid not null references public.projects(id) on delete cascade,
  day date not null,
  words_added integer not null default 0,
  words_removed integer not null default 0,
  chapters text[] not null default '{}',
  pages text[] not null default '{}',
  comments integer not null default 0,
  suggestions integer not null default 0,
  last_user uuid references auth.users(id) on delete set null,
  last_at timestamptz not null default now(),
  primary key (project_id, day)
);
alter table public.bookkit_daily_activity enable row level security;
create policy daily_activity_read on public.bookkit_daily_activity for select to authenticated
  using (public.has_project_access(project_id, 'viewer'));
revoke insert, update, delete on public.bookkit_daily_activity from anon, authenticated;

/** Add to today's activity for a book (only for a signed-in person). */
create or replace function public.bookkit_note_activity(p uuid, added integer, removed integer, chapter text, page text, comment integer, suggestion integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from public.projects where id = p) then return; end if;
  if added = 0 and removed = 0 and chapter is null and page is null and comment = 0 and suggestion = 0 then return; end if;
  insert into public.bookkit_daily_activity as d (project_id, day, words_added, words_removed, chapters, pages, comments, suggestions, last_user, last_at)
  values (p, (now() at time zone 'utc')::date, added, removed,
          case when chapter is null then '{}' else array[chapter] end,
          case when page is null then '{}' else array[page] end,
          comment, suggestion, auth.uid(), now())
  on conflict (project_id, day) do update set
    words_added = d.words_added + excluded.words_added,
    words_removed = d.words_removed + excluded.words_removed,
    chapters = case when chapter is null or chapter = any(d.chapters) then d.chapters else d.chapters || chapter end,
    pages = case when page is null or page = any(d.pages) then d.pages else d.pages || page end,
    comments = d.comments + excluded.comments,
    suggestions = d.suggestions + excluded.suggestions,
    last_user = excluded.last_user, last_at = excluded.last_at;
end $$;

create or replace function public.bookkit_track_documents() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p uuid := coalesce(new.project_id, old.project_id);
  path text := coalesce(new.path, old.path);
  delta integer;
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then return null; end if;
  if path ~ '^manuscript/.*\.md$' then
    delta := public.bookkit_word_count(case when tg_op = 'DELETE' then null else new.content end)
           - public.bookkit_word_count(case when tg_op = 'INSERT' then null else old.content end);
    perform public.bookkit_note_activity(p, greatest(delta, 0), greatest(-delta, 0), case when delta <> 0 then path end, null, 0, 0);
  elsif path ~ '^(bible|outline|craft|research)/.*\.md$' then
    perform public.bookkit_note_activity(p, 0, 0, null, path, 0, 0);
  end if;
  return null;
end $$;
create trigger bookkit_track_documents after insert or update or delete on public.bookkit_documents
  for each row execute function public.bookkit_track_documents();

create or replace function public.bookkit_track_conversation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'bookkit_suggestions' then perform public.bookkit_note_activity(new.project_id, 0, 0, null, null, 0, 1);
  else perform public.bookkit_note_activity(new.project_id, 0, 0, null, null, 1, 0); end if;
  return null;
end $$;
create trigger bookkit_track_threads after insert on public.bookkit_threads for each row execute function public.bookkit_track_conversation();
create trigger bookkit_track_messages after insert on public.bookkit_messages for each row execute function public.bookkit_track_conversation();
create trigger bookkit_track_suggestions after insert on public.bookkit_suggestions for each row execute function public.bookkit_track_conversation();

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
           sum(public.bookkit_word_count(d.content)) filter (where d.path ~ '^manuscript/.*\.md$')::integer as author_words,
           sum(public.bookkit_word_count(d.content)) filter (where d.path ~ '^draft/.*\.md$')::integer as draft_words,
           count(distinct regexp_replace(d.path, '^.*/', '')) filter (where d.path ~ '^(manuscript|draft)/(.*/)?\d+[^/]*\.md$')::integer as chapters_total,
           count(*) filter (where d.path ~ '^manuscript/(.*/)?\d+[^/]*\.md$' and public.bookkit_word_count(d.content) > 0)::integer as chapters_written
    from bookkit_documents d join mine on mine.id = d.project_id
    group by d.project_id
  )
  select m.id, m.name, m.role, coalesce(nullif(o.display_name, ''), o.email), m.bookkit_slug is not null,
         m.created_at,
         (select max(a.last_at) from bookkit_daily_activity a where a.project_id = m.id),
         (select coalesce(nullif(u.display_name, ''), u.email) from bookkit_daily_activity a join profiles u on u.id = a.last_user where a.project_id = m.id order by a.last_at desc limit 1),
         coalesce(docs.author_words, 0), coalesce(docs.draft_words, 0), coalesce(docs.chapters_total, 0), coalesce(docs.chapters_written, 0),
         m.brief_target_word_count,
         coalesce((select jsonb_agg(jsonb_build_object('day', a.day, 'added', a.words_added, 'removed', a.words_removed,
                     'chapters', cardinality(a.chapters), 'pages', cardinality(a.pages), 'comments', a.comments, 'suggestions', a.suggestions) order by a.day)
                   from bookkit_daily_activity a where a.project_id = m.id and a.day > current_date - p_days), '[]'::jsonb),
         m.library_id, m.shelf_id, m.private
  from mine m
  left join docs on docs.project_id = m.id
  left join profiles o on o.id = m.owner_id
  order by 7 desc nulls last, m.name
$$;
grant execute on function public.bookkit_workspace(integer) to authenticated;
