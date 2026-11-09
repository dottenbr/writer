-- 00038_workspace_book_targets.sql
-- 1. Extract per-chapter word budgets (`draft_budget_words` / `target_words`) into a stored
--    `budget_words` integer column on `bookkit_documents` so `bookkit_workspace()` never
--    decompresses TOASTed chapter prose.
-- 2. Resolve per-book `target_words` in `bookkit_workspace()` from:
--      a) `manuscript.target_words` in `book.yaml`,
--      b) sum of per-chapter `budget_words` across the book's chapters,
--      c) `manuscript.chapter_words * chapters_total` from `book.yaml`,
--      d) explicit `projects.brief_target_word_count` when customized (`<> 80000`),
--      e) explicit literary `form` default in `book.yaml`,
--      f) reference draft length rounded to the nearest 500 words when a reference draft exists,
--      g) `projects.brief_target_word_count` (or 80,000 fallback).

create or replace function public.bookkit_budget_words(t text) returns integer
language sql immutable parallel safe as $$
  select coalesce(
    (substring(
       coalesce(substring(coalesce(t, '') from '^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)'), ''),
       '(?:^|\n)\s*(?:draft_budget_words|target_words):\s*([0-9]+)'
     ))::integer,
    0
  )
$$;

alter table public.bookkit_documents
  add column if not exists budget_words integer not null default 0;

update public.bookkit_documents
set budget_words = public.bookkit_budget_words(content)
where path ~ '^(manuscript|draft)/.*\.md$';

create or replace function public.bookkit_set_document_word_count() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.path ~ '^(manuscript|draft)/.*\.md$' then
    if tg_op = 'INSERT' or new.content is distinct from old.content or new.path is distinct from old.path then
      new.word_count := public.bookkit_word_count(new.content);
      new.budget_words := public.bookkit_budget_words(new.content);
    end if;
  else
    new.word_count := 0;
    new.budget_words := 0;
  end if;
  return new;
end $$;

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
  ), chapter_budgets as (
    select d.project_id,
           regexp_replace(d.path, '^.*/', '') as file_name,
           coalesce(
             nullif(max(d.budget_words) filter (where d.path ~ '^manuscript/'), 0),
             nullif(max(d.budget_words) filter (where d.path ~ '^draft/'), 0),
             0
           )::integer as chapter_budget
    from bookkit_documents d join mine on mine.id = d.project_id
    where d.path ~ '^(manuscript|draft)/(.*/)?\d+[^/]*\.md$'
    group by d.project_id, regexp_replace(d.path, '^.*/', '')
  ), budgets as (
    select cb.project_id,
           sum(cb.chapter_budget)::integer as budget_words
    from chapter_budgets cb
    group by cb.project_id
  ), docs as (
    select d.project_id,
           sum(d.word_count) filter (where d.path ~ '^manuscript/.*\.md$')::integer as author_words,
           sum(d.word_count) filter (where d.path ~ '^draft/.*\.md$')::integer as draft_words,
           count(distinct regexp_replace(d.path, '^.*/', '')) filter (where d.path ~ '^(manuscript|draft)/(.*/)?\d+[^/]*\.md$')::integer as chapters_total,
           count(*) filter (where d.path ~ '^manuscript/(.*/)?\d+[^/]*\.md$' and d.word_count > 0)::integer as chapters_written,
           max(d.updated_at) as last_saved
    from bookkit_documents d join mine on mine.id = d.project_id
    group by d.project_id
  ), cfg as (
    select d.project_id,
           (substring(d.content from '(?:^|\n)\s*target_words:\s*([0-9]+)'))::integer as target_words,
           (substring(d.content from '(?:^|\n)\s*chapter_words:\s*([0-9]+)'))::integer as chapter_words,
           substring(d.content from '(?:^|\n)form:\s*([a-z\-]+)') as form
    from bookkit_documents d join mine on mine.id = d.project_id
    where d.path = 'book.yaml'
  )
  select m.id, m.name, m.role, coalesce(nullif(o.display_name, ''), o.email), m.bookkit_slug is not null,
         m.created_at,
         greatest(docs.last_saved, (select max(a.last_at) from bookkit_daily_activity a where a.project_id = m.id)),
         (select coalesce(nullif(u.display_name, ''), u.email) from bookkit_daily_activity a join profiles u on u.id = a.last_user where a.project_id = m.id order by a.day desc limit 1),
         coalesce(docs.author_words, 0), coalesce(docs.draft_words, 0), coalesce(docs.chapters_total, 0), coalesce(docs.chapters_written, 0),
         coalesce(
           nullif(cfg.target_words, 0),
           nullif(budgets.budget_words, 0),
           case when coalesce(cfg.chapter_words, 0) > 0 and coalesce(docs.chapters_total, 0) > 0
                then cfg.chapter_words * docs.chapters_total end,
           case when m.brief_target_word_count is not null and m.brief_target_word_count > 0 and m.brief_target_word_count <> 80000
                then m.brief_target_word_count end,
           case cfg.form
             when 'novel' then 80000
             when 'short-novel' then 45000
             when 'novella' then 25000
             when 'novelette' then 12000
             when 'short-story' then 5000
             when 'collection' then 60000
             when 'nonfiction' then 70000
             when 'memoir' then 75000
             when 'devotional' then 65000
             when 'monograph' then 85000
             when 'essays' then 55000
             when 'long-essay' then 15000
           end,
           case when coalesce(docs.draft_words, 0) > 0
                then greatest(500, round(docs.draft_words / 500.0)::integer * 500) end,
           nullif(m.brief_target_word_count, 0),
           80000
         )::integer,
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
  left join budgets on budgets.project_id = m.id
  left join cfg on cfg.project_id = m.id
  left join profiles o on o.id = m.owner_id
  order by 7 desc nulls last
$$;
grant execute on function public.bookkit_workspace(integer) to authenticated;
