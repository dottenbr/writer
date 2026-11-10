-- Claiming a library set up for you is the one owner change the app may make.
create or replace function public.libraries_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare claiming boolean;
begin
  claiming := old.owner_id is null and new.owner_id = auth.uid() and new.owner_email is null
    and old.owner_email = (select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
    and new.created_by is not distinct from old.created_by;
  if auth.uid() is not null and not claiming
     and (new.owner_id is distinct from old.owner_id or new.owner_email is distinct from old.owner_email or new.created_by is distinct from old.created_by) then
    raise exception 'A library''s owner can''t be changed here.';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Taking a book off a shelf is a shelf move too.
create or replace function public.projects_library_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.library_id is not null and not public.has_library_access(new.library_id, 'coauthor') then
      raise exception 'You can only add books to libraries where you can write.';
    end if;
  else
    if new.library_id is distinct from old.library_id then
      if old.owner_id is distinct from auth.uid() then raise exception 'Only the book''s owner can move it to another library.'; end if;
      if new.library_id is not null and not public.has_library_access(new.library_id, 'coauthor') then
        raise exception 'You can only move books into libraries where you can write.';
      end if;
      if new.shelf_id is not distinct from old.shelf_id then new.shelf_id := null; end if;
    elsif new.shelf_id is distinct from old.shelf_id
       and old.owner_id is distinct from auth.uid() and not public.has_library_access(new.library_id, 'coauthor') then
      raise exception 'Only the owner or the library''s co-authors can move books between shelves.';
    end if;
    if new.private is distinct from old.private and old.owner_id is distinct from auth.uid() then
      raise exception 'Only the book''s owner can change who sees it.';
    end if;
  end if;
  if new.shelf_id is not null and not exists (select 1 from public.shelves s where s.id = new.shelf_id and s.library_id = new.library_id) then
    raise exception 'That shelf belongs to another library.';
  end if;
  return new;
end $$;
