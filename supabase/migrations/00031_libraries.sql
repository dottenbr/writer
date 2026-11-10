-- Libraries (dom.bookkit.net) hold books on shelves. A library role
-- (reader = viewer, editor, co-author) applies to every book in the library
-- that isn't private; book-level sharing still works on top of that.

create table public.libraries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (
    slug ~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$'
    and slug not in ('www','api','app','mail','email','admin','auth','login','static','assets','help','support','blog','status','docs','dev','staging','test','bookkit','library','libraries')
  ),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  owner_id uuid references auth.users(id) on delete set null,
  -- a library set up for someone who hasn't signed in yet; claimed on first sign-in
  owner_email text check (owner_email is null or owner_email = lower(owner_email)),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (owner_id is not null or owner_email is not null)
);

create table public.library_members (
  library_id uuid not null references public.libraries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.project_role not null check (role in ('viewer','editor','coauthor')),
  added_at timestamptz not null default now(),
  primary key (library_id, user_id)
);

create table public.library_invitations (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries(id) on delete cascade,
  email text not null check (email = lower(email)),
  role public.project_role not null check (role in ('viewer','editor','coauthor')),
  created_at timestamptz not null default now(),
  unique (library_id, email)
);

create table public.shelves (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index shelves_library on public.shelves(library_id, position);

alter table public.projects
  add column library_id uuid references public.libraries(id) on delete set null,
  add column shelf_id uuid references public.shelves(id) on delete set null,
  add column private boolean not null default false;
create index projects_library on public.projects(library_id);

-- ---------- access ----------

create or replace function public.role_rank(r text) returns integer
language sql immutable as $$
  select case r when 'viewer' then 1 when 'editor' then 2 when 'coauthor' then 2 when 'owner' then 4 else 0 end
$$;

/** The caller's role in a library: owner, coauthor, editor, viewer, or null. */
create or replace function public.library_role(p_library uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.libraries l where l.id = p_library
                 and (l.owner_id = auth.uid() or (l.owner_id is null and l.created_by = auth.uid()))) then 'owner'
    else (select m.role::text from public.library_members m where m.library_id = p_library and m.user_id = auth.uid())
  end
$$;

create or replace function public.has_library_access(p_library uuid, p_min_role public.project_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.role_rank(public.library_role(p_library)) >= public.role_rank(p_min_role::text)
                  and (p_min_role <> 'coauthor' or public.library_role(p_library) in ('coauthor','owner')), false)
$$;

/** A library is visible to its people, to whoever it's waiting for, and to anyone with a book in it. */
create or replace function public.can_see_library(p_library uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.library_role(p_library) is not null
    or exists (select 1 from public.libraries l join auth.users u on u.id = auth.uid()
               where l.id = p_library and l.owner_email = lower(u.email) and u.email_confirmed_at is not null)
    or exists (select 1 from public.projects p where p.library_id = p_library and public.has_project_access(p.id, 'viewer'))
$$;

create or replace function public.has_project_access(p_project_id uuid, p_min_role public.project_role)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.projects p where p.id=p_project_id and p.owner_id=auth.uid())
 or exists(select 1 from public.project_members m where m.project_id=p_project_id and m.user_id=auth.uid() and m.accepted_at is not null
 and (p_min_role='viewer' or (p_min_role in ('editor','coauthor') and m.role in ('editor','coauthor','owner')) or (p_min_role='owner' and m.role='owner')))
 -- library people, for books that aren't private; never book ownership
 or (p_min_role <> 'owner' and exists(select 1 from public.projects p where p.id=p_project_id and p.library_id is not null and not p.private
     and public.role_rank(public.library_role(p.library_id)) >= public.role_rank(p_min_role::text)));
$$;

alter table public.libraries enable row level security;
alter table public.library_members enable row level security;
alter table public.library_invitations enable row level security;
alter table public.shelves enable row level security;

create policy libraries_select on public.libraries for select to authenticated using (public.can_see_library(id));
create policy libraries_insert on public.libraries for insert to authenticated with check (owner_id = auth.uid() and created_by = auth.uid());
create policy libraries_update on public.libraries for update to authenticated using (public.library_role(id) = 'owner') with check (public.library_role(id) = 'owner');
create policy libraries_delete on public.libraries for delete to authenticated using (owner_id = auth.uid());

create policy library_members_select on public.library_members for select to authenticated using (public.library_role(library_id) is not null);
create policy library_members_insert on public.library_members for insert to authenticated with check (public.library_role(library_id) = 'owner');
create policy library_members_update on public.library_members for update to authenticated using (public.library_role(library_id) = 'owner');
create policy library_members_delete on public.library_members for delete to authenticated using (public.library_role(library_id) = 'owner' or user_id = auth.uid());

create policy library_invitations_owner on public.library_invitations for all to authenticated
  using (public.library_role(library_id) = 'owner') with check (public.library_role(library_id) = 'owner');

create policy shelves_select on public.shelves for select to authenticated using (public.can_see_library(library_id));
create policy shelves_write on public.shelves for all to authenticated
  using (public.has_library_access(library_id, 'coauthor')) with check (public.has_library_access(library_id, 'coauthor'));

-- Owners can't be changed from the app, and a library's address stays valid.
create or replace function public.libraries_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and (new.owner_id is distinct from old.owner_id or new.owner_email is distinct from old.owner_email or new.created_by is distinct from old.created_by) then
    raise exception 'A library''s owner can''t be changed here.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger libraries_guard before update on public.libraries for each row execute function public.libraries_guard();

-- Who may put a book in a library, on a shelf, or make it private.
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
    end if;
    if new.private is distinct from old.private and old.owner_id is distinct from auth.uid() then
      raise exception 'Only the book''s owner can change who sees it.';
    end if;
    if new.shelf_id is distinct from old.shelf_id and new.shelf_id is not null
       and old.owner_id is distinct from auth.uid() and not public.has_library_access(new.library_id, 'coauthor') then
      raise exception 'Only the owner or the library''s co-authors can move books between shelves.';
    end if;
  end if;
  if new.shelf_id is not null and not exists (select 1 from public.shelves s where s.id = new.shelf_id and s.library_id = new.library_id) then
    raise exception 'That shelf belongs to another library.';
  end if;
  return new;
end $$;
create trigger projects_library_guard before insert or update of library_id, shelf_id, private on public.projects
  for each row execute function public.projects_library_guard();

-- Sign-in: accept book invitations, library invitations, and claim libraries set up for you.
create or replace function public.accept_project_invitations()
returns integer language plpgsql security definer set search_path = '' as $$
declare accepted integer := 0; invitation record; lib record; verified_email text;
begin
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then return 0; end if;
 for invitation in select * from public.project_invitations where email=verified_email for update loop
  insert into public.project_members(project_id,user_id,role,accepted_at)
   values(invitation.project_id,auth.uid(),invitation.role,now())
   on conflict(project_id,user_id) do nothing;
  delete from public.project_invitations where id=invitation.id;
  accepted := accepted + 1;
 end loop;
 for invitation in select * from public.library_invitations where email=verified_email for update loop
  insert into public.library_members(library_id,user_id,role) values(invitation.library_id,auth.uid(),invitation.role)
   on conflict(library_id,user_id) do nothing;
  delete from public.library_invitations where id=invitation.id;
  accepted := accepted + 1;
 end loop;
 for lib in select * from public.libraries where owner_id is null and owner_email=verified_email for update loop
  update public.libraries set owner_id=auth.uid(), owner_email=null where id=lib.id;
  -- whoever set the library up keeps editing rights until the owner changes that
  if lib.created_by is not null and lib.created_by <> auth.uid() then
   insert into public.library_members(library_id,user_id,role) values(lib.id,lib.created_by,'editor') on conflict do nothing;
  end if;
  delete from public.library_members where library_id=lib.id and user_id=auth.uid();
  accepted := accepted + 1;
 end loop;
 return accepted;
end $$;

-- ---------- what the dashboards show ----------

drop function if exists public.bookkit_workspace(integer);
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
                   from bookkit_daily_activity a where a.project_id = m.id and a.day > current_date - p_days), '[]'::jsonb),
         m.library_id, m.shelf_id, m.private
  from mine m
  left join docs on docs.project_id = m.id
  left join profiles o on o.id = m.owner_id
  order by 7 desc nulls last
$$;
grant execute on function public.bookkit_workspace(integer) to authenticated;

/** Every library the caller can see, with their role, shelves and people. */
create or replace function public.bookkit_libraries()
returns table (id uuid, slug text, name text, description text, role text, owner_name text, pending_owner text,
               shelves jsonb, members jsonb, invitations jsonb, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select l.id, l.slug, l.name, l.description,
         coalesce(public.library_role(l.id), 'reader'),
         coalesce(nullif(o.display_name, ''), o.email, l.owner_email),
         case when l.owner_id is null then l.owner_email end,
         coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'position', s.position) order by s.position, s.created_at) from shelves s where s.library_id = l.id), '[]'::jsonb),
         case when public.library_role(l.id) is not null then
           coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role, 'name', coalesce(nullif(p.display_name, ''), p.email), 'email', p.email) order by m.added_at)
                     from library_members m left join profiles p on p.id = m.user_id where m.library_id = l.id), '[]'::jsonb)
         else '[]'::jsonb end,
         case when public.library_role(l.id) = 'owner' then
           coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'role', i.role) order by i.created_at) from library_invitations i where i.library_id = l.id), '[]'::jsonb)
         else '[]'::jsonb end,
         l.created_at
  from libraries l left join profiles o on o.id = l.owner_id
  order by (l.owner_id = auth.uid()) desc nulls last, l.name
$$;
grant execute on function public.bookkit_libraries() to authenticated;
