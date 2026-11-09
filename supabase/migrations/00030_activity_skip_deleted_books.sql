-- Deleting a book deletes its documents; don't log those as activity for a
-- book that no longer exists (it broke book deletion with a foreign-key error).
create or replace function public.bookkit_track_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p uuid := coalesce(new.project_id, old.project_id);
  path text := coalesce(new.path, old.path);
  delta integer := 0;
begin
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then return null; end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.projects where id = p) then return null; end if;
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
