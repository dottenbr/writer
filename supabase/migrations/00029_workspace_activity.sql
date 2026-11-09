-- Daily writing activity per book, for the workspace home page.
create or replace function public.bookkit_word_count(t text) returns integer
language sql immutable parallel safe as $$
  select case when btrim(x) = '' then 0 else coalesce(array_length(regexp_split_to_array(btrim(x), '\s+'), 1), 0) end
  from (select regexp_replace(
    regexp_replace(regexp_replace(coalesce(t, ''), '^---\n.*?\n---\n', ''), '^#[^\n]*$', '', 'gn'),
    '[#>*_`|\[\]()~-]+', ' ', 'g') as x) s
$$;

create table public.bookkit_daily_activity (
  project_id uuid not null references public.projects(id) on delete cascade,
  day date not null,
  edits integer not null default 0,
  -- net words added to the author's manuscript that day
  words integer not null default 0,
  last_user uuid references auth.users(id) on delete set null,
  last_at timestamptz not null default now(),
  primary key (project_id, day)
);
alter table public.bookkit_daily_activity enable row level security;
create policy daily_activity_read on public.bookkit_daily_activity for select to authenticated
  using (public.has_project_access(project_id, 'viewer'));
revoke insert, update, delete on public.bookkit_daily_activity from anon, authenticated;

create or replace function public.bookkit_track_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p uuid := coalesce(new.project_id, old.project_id);
  path text := coalesce(new.path, old.path);
  delta integer := 0;
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then return null; end if;
  if path ~ '^manuscript/.*\.md$' then
    delta := public.bookkit_word_count(case when tg_op = 'DELETE' then null else new.content end)
           - public.bookkit_word_count(case when tg_op = 'INSERT' then null else old.content end);
  end if;
  insert into public.bookkit_daily_activity as d (project_id, day, edits, words, last_user, last_at)
  values (p, (now() at time zone 'utc')::date, 1, delta, auth.uid(), now())
  on conflict (project_id, day) do update
    set edits = d.edits + 1, words = d.words + excluded.words,
        last_user = coalesce(excluded.last_user, d.last_user), last_at = excluded.last_at;
  return null;
end $$;

create trigger bookkit_track_activity after insert or update or delete on public.bookkit_documents
  for each row execute function public.bookkit_track_activity();

-- Back-fill: what we know is when each file was last saved.
insert into public.bookkit_daily_activity (project_id, day, edits, words, last_at)
select project_id, (updated_at at time zone 'utc')::date, count(*), 0, max(updated_at)
from public.bookkit_documents group by 1, 2
on conflict (project_id, day) do nothing;

-- Everything the workspace shows, for the books the caller can open.
create or replace function public.bookkit_workspace(p_days integer default 84)
returns table (
  project_id uuid, name text, role text, owner_name text, is_bookkit boolean,
  created_at timestamptz, last_worked_at timestamptz, last_worked_by text,
  author_words integer, draft_words integer, chapters_total integer, chapters_written integer,
  target_words integer, activity jsonb
)
language sql stable security invoker set search_path = public as $$
  with mine as (
    select p.id, p.name, p.owner_id, p.created_at, p.bookkit_slug, p.brief_target_word_count,
           case when p.owner_id = auth.uid() then 'owner' else coalesce((select m.role::text from project_members m where m.project_id = p.id and m.user_id = auth.uid()), 'viewer') end as role
    from projects p
    where public.has_project_access(p.id, 'viewer')
  ), docs as (
    select d.project_id,
           sum(public.bookkit_word_count(d.content)) filter (where d.path ~ '^manuscript/.*\.md$')::integer as author_words,
           sum(public.bookkit_word_count(d.content)) filter (where d.path ~ '^draft/.*\.md$')::integer as draft_words,
           count(distinct regexp_replace(d.path, '^.*/', '')) filter (where d.path ~ '^(manuscript|draft)/(.*/)?\d+[^/]*\.md$')::integer as chapters_total,
           count(*) filter (where d.path ~ '^manuscript/(.*/)?\d+[^/]*\.md$' and public.bookkit_word_count(d.content) > 0)::integer as chapters_written,
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
         coalesce((select jsonb_agg(jsonb_build_object('day', a.day, 'edits', a.edits, 'words', a.words) order by a.day)
                   from bookkit_daily_activity a where a.project_id = m.id and a.day > current_date - p_days), '[]'::jsonb)
  from mine m
  left join docs on docs.project_id = m.id
  left join profiles o on o.id = m.owner_id
  order by 7 desc nulls last
$$;
grant execute on function public.bookkit_workspace(integer) to authenticated;
grant execute on function public.bookkit_word_count(text) to authenticated;
