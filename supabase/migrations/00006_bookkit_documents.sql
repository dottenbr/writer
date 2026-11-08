-- Store the book policy and original source documents without flattening the
-- reference draft into human-authored manuscript text.
alter table public.project_settings
  add column ai_prose_policy text not null default 'human-authored'
  check (ai_prose_policy = 'human-authored');

create table public.bookkit_documents (
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null check (path !~ '(^/|(^|/)\.\.(/|$))'),
  content text not null,
  source_sha256 text not null,
  updated_at timestamptz not null default now(),
  primary key (project_id, path)
);
alter table public.bookkit_documents enable row level security;
create policy bookkit_read on public.bookkit_documents for select
  using (public.has_project_access(project_id, 'viewer'));
create policy bookkit_insert on public.bookkit_documents for insert
  with check (public.has_project_access(project_id, 'editor'));
create policy bookkit_update on public.bookkit_documents for update
  using (public.has_project_access(project_id, 'editor'))
  with check (public.has_project_access(project_id, 'editor'));
create policy bookkit_delete on public.bookkit_documents for delete
  using (public.has_project_access(project_id, 'owner'));
create trigger bookkit_updated_at before update on public.bookkit_documents
  for each row execute function public.set_updated_at();
