alter table public.projects add column bookkit_slug text;
create unique index projects_bookkit_owner_slug on public.projects(owner_id, bookkit_slug) where bookkit_slug is not null;
alter table public.bookkit_documents add column version integer not null default 1;
create function public.bump_bookkit_version() returns trigger language plpgsql as $$
begin new.version = old.version + 1; return new; end;
$$;
create trigger bookkit_version before update on public.bookkit_documents
  for each row execute function public.bump_bookkit_version();
